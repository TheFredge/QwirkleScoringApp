#!/usr/bin/env python3
"""Privacy check for a git repo.

Looks through every version of every file and every commit (names, emails, messages)
for things the repo rules say must never be in a repo: keys, passwords, private links,
email addresses, phone numbers, exact GPS points, street addresses, home network addresses.

Run it from inside the repo folder:

    python3 scripts/privacy_scan.py
    python3 scripts/privacy_scan.py --also "word one,word two"

--also   extra words to look for, such as family names. They are typed on the command
         line so they never get saved in the repo.
--path   check a different repo folder.
--ci     used by the automatic check on GitHub (.github/workflows/privacy-check.yml).
         Its results can be read by anyone on a public repo, so it only reports the
         kind of problem and the file, never the text found or the names on commits.

Anything deliberately kept (for example a town a feature needs) goes in .privacy-allow,
one per line, with a comment saying why. Lines starting with # are comments.

Exit code 0 = nothing found, 1 = something to review.
"""
import argparse
import re
import subprocess
import sys
from collections import defaultdict

SAFE_EMAILS = re.compile(
    r"(?i)^(\d+\+)?[a-z0-9-]+@users\.noreply\.github\.com$|^noreply@anthropic\.com$|^noreply@github\.com$"
    r"|@example\.(com|org|net)$"
)

CHECKS = [
    ("Private key file contents", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("Google API key", r"AIza[0-9A-Za-z_\-]{35}"),
    ("Stripe key", r"\b[sr]k_(live|test)_[0-9A-Za-z]{10,}"),
    ("Resend key", r"\bre_[0-9A-Za-z]{6,}_[0-9A-Za-z]{6,}"),
    ("GitHub token", r"\b(ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{30,}"),
    ("Slack token", r"\bxox[abpr]-[0-9A-Za-z-]{10,}"),
    ("AWS key", r"\bAKIA[0-9A-Z]{16}\b"),
    ("Supabase secret key", r"\bsb_secret_[0-9A-Za-z_\-]{10,}"),
    ("Signed token (JWT)", r"\beyJ[0-9A-Za-z_\-]{10,}\.[0-9A-Za-z_\-]{10,}\.[0-9A-Za-z_\-]{10,}"),
    ("Password written in the code", r"(?i)\b(password|passwd|pwd|secret)\s*[:=]\s*[\"'][^\"'\s]{4,}[\"']"),
    ("Private calendar link", r"(?i)calendar\.google\.com/calendar/ical/|/private-[0-9a-f]{16,}/|webcal:/{2}\S+|\bhttps?://\S+\.ics\b"),
    ("Email address", r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
    ("Phone number", r"(?<![\d.])(\+?1[ .\-])?\(?[2-9]\d{2}\)?[ .\-]\d{3}[ .\-]\d{4}(?![\d.])"),
    ("Exact GPS point (3+ decimals)", r"-?\b\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b|lat(itude)?=-?\d{1,3}\.\d{3,}"),
    ("Street address", r"\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Court|Ct|Pass|Way|Place|Pl|Boulevard|Blvd|Terrace|Ter|Circle|Cir|Trail|Trl)\b"),
    ("Home network address", r"\b(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b|\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b|\b[\w-]+\.ts\.net\b"),
]
RISKY_FILES = re.compile(r"(?i)(^|/)(\.env(\..*)?|.*\.pem|.*\.key|.*\.p12|id_rsa.*|id_ed25519.*|credentials.*\.json|secrets?\..*|.*\.ics)$")


def git(repo, *args, data=None):
    return subprocess.run(["git", "-C", repo, *args], input=data, capture_output=True, check=True).stdout


def main():
    ap = argparse.ArgumentParser(description="Privacy check for every version of a git repo.")
    ap.add_argument("--also", default="", help="comma-separated extra words to look for (not saved anywhere)")
    ap.add_argument("--path", default=".", help="repo folder (default: current folder)")
    ap.add_argument("--ci", action="store_true",
                    help="for the automatic check on GitHub: report the kind of problem and the file, never the text found or any names")
    args = ap.parse_args()
    repo = args.path

    checks = [(name, re.compile(rx)) for name, rx in CHECKS]
    extra = [w.strip() for w in args.also.split(",") if w.strip()]
    if extra:
        checks.append(("Word you asked to look for", re.compile(r"(?i)\b(" + "|".join(re.escape(w) for w in extra) + r")\b")))

    allowed = []
    try:
        top = git(repo, "rev-parse", "--show-toplevel").decode().strip()
        with open(f"{top}/.privacy-allow", encoding="utf-8") as f:
            allowed = [l.strip() for l in f if l.strip() and not l.lstrip().startswith("#")]
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    allowed_lower = [a.lower() for a in allowed]

    def is_allowed(text):
        low = text.lower()
        return any(a in low or low in a for a in allowed_lower)

    findings = defaultdict(set)  # (check, matched text) -> places

    def look(text, place):
        for name, rx in checks:
            for m in rx.finditer(text):
                hit = m.group(0)
                if name == "Email address" and SAFE_EMAILS.search(hit):
                    continue
                if is_allowed(hit):
                    continue
                findings[(name, hit)].add(place)

    # Every object reachable from any branch, tag or pull request copy in this folder
    listing = git(repo, "rev-list", "--all", "--objects").decode("utf-8", "replace").splitlines()
    paths = defaultdict(set)
    for line in listing:
        sha, _, path = line.partition(" ")
        if path:
            paths[sha].add(path)
            if RISKY_FILES.search(path):
                findings[("Risky file name", path)].add(path)
    shas = [l.split(" ", 1)[0] for l in listing]
    out = git(repo, "cat-file", "--batch", data=("\n".join(shas) + "\n").encode())
    i = 0
    while i < len(out):
        nl = out.index(b"\n", i)
        sha, typ, size = out[i:nl].decode().split()
        body = out[nl + 1: nl + 1 + int(size)]
        i = nl + 1 + int(size) + 1
        if typ == "blob" and b"\0" not in body[:8000]:
            look(body.decode("utf-8", "replace"), ", ".join(sorted(paths.get(sha, {"(file)"}))))

    # Commit names, emails and messages
    log = git(repo, "log", "--all", "--format=%h%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x01").decode("utf-8", "replace")
    people = set()
    for entry in log.split("\x01"):
        parts = entry.strip("\n").split("\x00")
        if len(parts) < 6:
            continue
        h, an, ae, cn, ce, msg = parts
        for name, email in ((an, ae), (cn, ce)):
            people.add(f"{name} <{email}>")
            if not SAFE_EMAILS.search(email) and not is_allowed(email):
                findings[("Real email on a commit", email)].add(f"commit {h}")
        look(msg, f"commit message {h}")

    commits = git(repo, "rev-list", "--all", "--count").decode().strip()
    print(f"Checked {commits} commits and {len(shas)} stored objects.")
    if not args.ci:
        print("Names on commits: " + "; ".join(sorted(people)))
    if not findings:
        print("Nothing found.")
        return 0
    print(f"\n{len(findings)} thing(s) to review:")
    for (name, hit), places in sorted(findings.items()):
        shown = hit if len(hit) <= 80 else hit[:77] + "..."
        if name in ("Google API key", "Stripe key", "Resend key", "GitHub token", "Slack token", "AWS key",
                    "Supabase secret key", "Signed token (JWT)", "Password written in the code"):
            shown = hit[:8] + "…(hidden)"
        if args.ci:
            shown = "(hidden in the automatic check; run the check by hand to see it)"
        where = sorted(places)
        print(f"- {name}: {shown}\n    in: {', '.join(where[:4])}{' and more' if len(where) > 4 else ''}")
    return 1


if __name__ == "__main__":
    sys.exit(main())

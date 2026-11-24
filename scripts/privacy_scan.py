#!/usr/bin/env python3
"""Privacy check for a git repo.

Looks through every version of every file and every commit (names, emails, messages)
for things the repo rules say must never be in a repo: keys, passwords, private links,
email addresses, phone numbers, exact GPS points, street addresses, home network addresses,
photos that still carry location data, and risky file names (keys, database copies).

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
one per line, with a comment saying why. Lines starting with # are comments. A finding is
only let through when it sits inside an exact copy of an allowed line (capital letters
don't matter), so a short line can't hide anything else.

A repo whose older versions were deliberately left as they are (a decision in the GitHub
note) has a .privacy-baseline file holding the last old commit ID. Versions from before it
are skipped; the current files of every branch are always checked.

Exit code 0 = nothing found, 1 = something to review.
"""
import argparse
import re
import struct
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
    ("Anthropic or OpenAI key", r"\bsk-(ant-|proj-)?[0-9A-Za-z_\-]{20,}"),
    ("Tailscale key", r"\btskey-[0-9A-Za-z_\-]{10,}"),
    ("Google sign-in secret", r"\bGOCSPX-[0-9A-Za-z_\-]{20,}"),
    ("Plex token", r"(?i)x-plex-token\s*[=:]\s*[\"']?[0-9A-Za-z_\-]{10,}"),
    ("Key or token in a web address", r"(?i)[?&](access_token|api_key|apikey|token|key|auth)=[0-9A-Za-z_\-]{16,}"),
    ("Webhook link", r"(?i)hooks\.slack\.com/services/\S+|discord(app)?\.com/api/webhooks/\S+|\b\d{8,10}:AA[0-9A-Za-z_\-]{30,}"),
    ("Key or token written in the code", r"(?i)\b(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|token)\s*[:=]\s*[\"'][^\"'\s]{12,}[\"']"),
    ("Signed token (JWT)", r"\beyJ[0-9A-Za-z_\-]{10,}\.[0-9A-Za-z_\-]{10,}\.[0-9A-Za-z_\-]{10,}"),
    ("Password written in the code", r"(?i)\b(password|passwd|pwd|secret)\s*[:=]\s*[\"'][^\"'\s]{4,}[\"']"),
    ("Private calendar link", r"(?i)calendar\.google\.com/calendar/ical/|/private-[0-9a-f]{16,}/|webcal:/{2}\S+|\bhttps?://\S+\.ics\b"),
    ("Email address", r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
    ("Phone number", r"(?<![\d.])(\+?1[ .\-])?\(?[2-9]\d{2}\)?[ .\-]\d{3}[ .\-]\d{4}(?![\d.])"),
    ("Exact GPS point (3+ decimals)", r"-?\b\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b|lat(itude)?=-?\d{1,3}\.\d{3,}"),
    ("Street address", r"\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Court|Ct|Pass|Way|Place|Pl|Boulevard|Blvd|Terrace|Ter|Circle|Cir|Trail|Trl)\b"),
    ("Home network address", r"\b(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b|\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b|\b[\w-]+\.ts\.net\b"),
]
RISKY_FILES = re.compile(r"(?i)(^|/)(\.env(?!\.example$)(\..*)?|.*\.pem|.*\.key|.*\.p12|id_rsa.*|id_ed25519.*|credentials.*\.json|secrets?\..*|.*\.ics"
                         r"|.*\.(dump|sqlite3?|db|backup|bak)|.*\.sql\.(gz|zip|bz2|xz))$")
PHOTO_FILES = re.compile(r"(?i)\.(jpe?g|heic|heif|tiff?|png|webp|dng)$")
HIDDEN = ("Google API key", "Stripe key", "Resend key", "GitHub token", "Slack token", "AWS key",
          "Supabase secret key", "Anthropic or OpenAI key", "Tailscale key", "Google sign-in secret",
          "Plex token", "Key or token in a web address", "Webhook link", "Key or token written in the code",
          "Signed token (JWT)", "Password written in the code")


def photo_has_location(body):
    """True when a photo's hidden details (Exif) include a GPS section."""
    at = body.find(b"Exif\0\0")
    if at >= 0:
        tiff = body[at + 6: at + 6 + 65536]
    else:  # PNG and some HEIC files keep Exif without the marker
        at = body.find(b"eXIf")
        if at < 0:
            return False
        tiff = body[at + 4: at + 4 + 65536]
    big = tiff[:2] == b"MM"
    if tiff[:2] not in (b"MM", b"II"):
        return False
    tag = b"\x88\x25" if big else b"\x25\x88"
    endian = ">" if big else "<"
    try:
        first = struct.unpack(endian + "I", tiff[4:8])[0]
        count = struct.unpack(endian + "H", tiff[first:first + 2])[0]
        for n in range(count):
            entry = tiff[first + 2 + 12 * n: first + 14 + 12 * n]
            if entry[:2] == tag:
                return True
    except (struct.error, IndexError):
        return tag in tiff[:4096]
    return False


def git(repo, *args, data=None):
    return subprocess.run(["git", "-C", repo, *args], input=data, capture_output=True, check=True).stdout


def main():
    ap = argparse.ArgumentParser(description="Privacy check for every version of a git repo.")
    ap.add_argument("--also", default="", help="comma-separated extra words to look for (not saved anywhere)")
    ap.add_argument("--path", default=".", help="repo folder (default: current folder)")
    ap.add_argument("--since", default="", help="skip versions from before this commit (normally read from .privacy-baseline)")
    ap.add_argument("--ci", action="store_true",
                    help="for the automatic check on GitHub: report the kind of problem and the file, never the text found or any names")
    args = ap.parse_args()
    repo = args.path

    checks = [(name, re.compile(rx)) for name, rx in CHECKS]
    extra = [w.strip() for w in args.also.split(",") if w.strip()]
    if extra:
        checks.append(("Word you asked to look for", re.compile(r"(?i)\b(" + "|".join(re.escape(w) for w in extra) + r")\b")))

    allowed = []
    top = git(repo, "rev-parse", "--show-toplevel").decode().strip()
    try:
        with open(f"{top}/.privacy-allow", encoding="utf-8") as f:
            allowed = [l.strip() for l in f if l.strip() and not l.lstrip().startswith("#")]
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    allowed_lower = [a.lower() for a in allowed]

    base = args.since.strip()
    if not base:
        try:
            with open(f"{top}/.privacy-baseline", encoding="utf-8") as f:
                base = next((l.split()[0] for l in f if l.strip() and not l.lstrip().startswith("#")), "")
        except (FileNotFoundError, NameError):
            base = ""
    if base and subprocess.run(["git", "-C", repo, "cat-file", "-e", f"{base}^{{commit}}"], capture_output=True).returncode != 0:
        print(f"Warning: the starting commit {base[:7]} isn't in this copy, so every version is checked.")
        base = ""
    since = ["--not", base] if base else []

    def allowed_spans(text):
        low = text.lower()
        spans = []
        for a in allowed_lower:
            start = low.find(a)
            while start >= 0:
                spans.append((start, start + len(a)))
                start = low.find(a, start + 1)
        return spans

    def is_allowed_email(email):
        return email.lower() in allowed_lower

    findings = defaultdict(set)  # (check, matched text) -> places

    def look(text, place):
        spans = allowed_spans(text) if allowed_lower else []
        for name, rx in checks:
            for m in rx.finditer(text):
                hit = m.group(0)
                if name == "Email address" and SAFE_EMAILS.search(hit):
                    continue
                if any(a <= m.start() and m.end() <= b for a, b in spans):
                    continue
                findings[(name, hit)].add(place)

    # Every object reachable from any branch, tag or pull request copy in this folder
    listing = git(repo, "rev-list", "--all", "--objects", *since).decode("utf-8", "replace").splitlines()
    if base:  # the current files of every branch are always checked, even when they haven't changed
        tips = git(repo, "for-each-ref", "--format=%(objectname)", "refs/heads", "refs/remotes", "refs/tags").decode().split()
        for tip in sorted(set(tips)):
            for row in git(repo, "ls-tree", "-r", "-t", tip).decode("utf-8", "replace").splitlines():
                meta, _, path = row.partition("\t")
                listing.append(f"{meta.split()[2]} {path}")
    paths = defaultdict(set)
    for line in listing:
        sha, _, path = line.partition(" ")
        if path:
            paths[sha].add(path)
    # Every file name ever used, even when its contents match another file's (git lists those only once above)
    ever = git(repo, "log", "--all", *since, "--name-only", "--format=").decode("utf-8", "replace").splitlines()
    for path in set(ever) | {l.partition(" ")[2] for l in listing}:
        if path and RISKY_FILES.search(path):
            findings[("Risky file name", path)].add(path)
    shas = list(dict.fromkeys(l.split(" ", 1)[0] for l in listing))
    out = git(repo, "cat-file", "--batch", data=("\n".join(shas) + "\n").encode())
    i = 0
    while i < len(out):
        nl = out.index(b"\n", i)
        sha, typ, size = out[i:nl].decode().split()
        body = out[nl + 1: nl + 1 + int(size)]
        i = nl + 1 + int(size) + 1
        names = paths.get(sha, {"(file)"})
        if typ == "blob" and b"\0" not in body[:8000]:
            look(body.decode("utf-8", "replace"), ", ".join(sorted(names)))
        elif typ == "blob" and any(PHOTO_FILES.search(n) for n in names) and photo_has_location(body):
            for n in names:
                findings[("Photo with hidden location data", n)].add(n)

    # Commit names, emails and messages
    log = git(repo, "log", "--all", *since, "--format=%h%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x01").decode("utf-8", "replace")
    people = set()
    for entry in log.split("\x01"):
        parts = entry.strip("\n").split("\x00")
        if len(parts) < 6:
            continue
        h, an, ae, cn, ce, msg = parts
        for name, email in ((an, ae), (cn, ce)):
            people.add(f"{name} <{email}>")
            if not SAFE_EMAILS.search(email) and not is_allowed_email(email):
                findings[("Real email on a commit", email)].add(f"commit {h}")
        look(msg, f"commit message {h}")

    commits = git(repo, "rev-list", "--all", "--count", *since).decode().strip()
    print(f"Checked {commits} commits and {len(set(shas))} stored objects.")
    if base:
        print(f"Versions from before {base[:7]} were skipped, as .privacy-baseline says. Current files were all checked.")
    if not args.ci:
        print("Names on commits: " + "; ".join(sorted(people)))
    if not findings:
        print("Nothing found.")
        return 0
    print(f"\n{len(findings)} thing(s) to review:")
    for (name, hit), places in sorted(findings.items()):
        shown = hit if len(hit) <= 80 else hit[:77] + "..."
        if name in HIDDEN:
            shown = hit[:8] + "…(hidden)"
        if args.ci:
            shown = "(hidden in the automatic check; run the check by hand to see it)"
        where = sorted(places)
        print(f"- {name}: {shown}\n    in: {', '.join(where[:4])}{' and more' if len(where) > 4 else ''}")
    return 1


if __name__ == "__main__":
    sys.exit(main())

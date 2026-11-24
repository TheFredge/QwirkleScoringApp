# Rules for this repo

These are the owner's standard rules for every repo. Follow them in every session, before changing anything. This file is a word-for-word copy of the master in the GitHub note in the owner's Obsidian vault (Homelab → Services → GitHub). If the vault tools are available, read that note first. If its rules version is newer than the one below, the note wins and this file should be updated to match (rule 8).

Rules version: 2026-11-24.2

Explain everything to the owner in plain language, not developer shorthand.

## 1. Public or private
- **Private by default.** A repo goes public only when it has to, which today means a GitHub Pages site on the free plan.
- **A public Pages repo is a public website.** Anyone can read every file, every older version of every file, and the name and email on every commit. Pages also publishes every file in the repo at the page address, not just the page. Making the repo private doesn't fix that, so privacy has to come from what goes into the files.
- A public repo holds only what the page needs, plus backup copies that pass rule 2.
- **New Pages projects use two repos:** a public one with only the page files (the page, its scripts, icons), and a private one for the Supabase functions and setup records.

## 2. Never put these in any repo, public or private
- Passwords, keys, tokens, sign-in codes, private calendar links. The one exception is Supabase's **publishable** key in a page, and only when every table is locked to approved sign-ins (rule 5).
- Email addresses and phone numbers, the owner's or anyone's, including email sender addresses.
- Family names. Use roles instead: "the owner", "the second approved account". Never kids' names, ages or schools.
- A home street address. A town is OK only when a feature needs it.
- Exact GPS spots of private places (home, stands, cameras). Round to 2 decimal places, about half a mile.
- Anything that tells when the house is empty or where the owner will be: trip dates, hunting times, daily routines.
- Home setup details: which computer runs what and when, home network and Tailscale addresses, device or browser IDs.
- Account numbers and logins for other services.

## 3. Where those things go instead
- Keys, private links and email sender addresses: **Supabase → Edge Functions → Secrets.** The code asks for them by name (for example `GOOGLE_MAPS_KEY`, `ALERT_FROM`), and does nothing if one is missing.
- Passwords the database uses for its own scheduled jobs: generated inside the database and never shown.
- Who is allowed in, and their labels and emails: only in each Supabase project's approved list.
- The words the privacy check looks for (names and places): only in the GitHub note in the owner's vault, and in each repo's `PRIVACY_WORDS` secret on GitHub.
- Exact spots, dates and people: the project note in the owner's vault.

## 4. Commits
- Author: `TheFredge <104334327+TheFredge@users.noreply.github.com>`, or `Claude <noreply@anthropic.com>` when Claude commits. Never a real email.
- Commit messages say what changed, with no names, places, trip dates or personal details.

## 5. Every repo has
- **README.md** with a **Privacy** section: what's deliberately left out and where it lives instead. Start from the README in `repo-template`.
- **.gitignore** from `repo-template`, which keeps out `.env` files, calendar files, key files and Mac `.DS_Store` files.
- **.privacy-allow** listing anything deliberately kept that the privacy check would flag (for example a public place's address), each with a comment saying why.
- **.privacy-baseline**, only in a repo whose older versions were deliberately left as they are (a decision in the GitHub note). It holds the last old commit ID. The privacy check skips versions from before it, and always checks the current files.
- **These rules as `CLAUDE.md`**, a word-for-word copy of the master (rule 8), so every Claude session in the repo reads them.
- **The privacy check script**, `scripts/privacy_scan.py`.
- **The automatic privacy check**, `.github/workflows/privacy-check.yml`. GitHub runs it after every push and emails the owner if it finds something. The words it looks for come from the repo's `PRIVACY_WORDS` secret (Settings → Secrets and variables → Actions), never from a file. Its results only name the kind of problem and the file, never the text found, because anyone can read a public repo's results.
- **If it uses Supabase:** every table locked (row-level security on, nothing readable without an approved sign-in), and Supabase's security check reviewed after every database change.
- **GitHub's secret scanning and push protection on.** They only catch known key formats, not names, emails or addresses, so they don't replace rule 6.

## 6. Privacy check
Claude runs it before every push, before a repo turns public, after big changes, and whenever the owner asks:
1. Fetch any pull request copies (`git fetch origin '+refs/pull/*:refs/remotes/origin/pr/*'`), then run `python3 scripts/privacy_scan.py --also "<the word list from the GitHub note>"`. It checks every version of every file plus every commit's name, email and message. Type the words on the command line only, so they are never saved in a repo.
2. Read every changed file by hand as well. The script only catches patterns.
3. If the repo uses Supabase, check its security advice and the table locks.
4. If another chat pushed to the repo since the last check, check those commits too.
5. Tell the owner what was found, in plain language, before changing anything.

The automatic check on GitHub (rule 5) is a backup alarm. It runs after the push, so the check before pushing is the real protection.

## 7. If something slips out
1. If it's a key or password, change it first, so the leaked one stops working.
2. Clean every older version in a copy, check the copy with rule 6, and show the owner what changed.
3. GitHub keeps old versions viewable by their commit ID, and Pages build records and pull requests link to them. For a small repo with no forks: the owner deletes the repo and creates it again with the same name, Claude pushes the cleaned copy, and the owner turns Pages back on (the page address stays the same). For a bigger repo: ask GitHub Support to purge the old versions. For a private repo, cleaning from here on can be enough, with a `.privacy-baseline`; the owner decides, and the decision goes in the GitHub note.
4. Update any commit IDs mentioned in the vault notes.
5. Log it in the GitHub note and the project note.

## 8. Master copy and mirrors
- The master copy of these rules is the "Rules for every repo" section of the GitHub note in the owner's Obsidian vault (Homelab → Services → GitHub).
- These copies mirror it word for word: `CLAUDE.md` in `repo-template` and `CLAUDE.md` in every repo. The `github-repo-privacy` skill doesn't repeat the rules; it points to the master.
- To change a rule: change the master first and update its rules version, then `repo-template`, then every repo's copy. Log the change in the GitHub note.
- If a copy says something different from the master, the master wins; update the copy.

## Starting a new repo from the template
- [ ] Decide public or private (rule 1), and add the repo to the Repos table in the GitHub note.
- [ ] The owner adds the `PRIVACY_WORDS` secret (the word list from the GitHub note) under Settings → Secrets and variables → Actions.
- [ ] If the Claude GitHub app is limited to selected repositories, the owner adds this repo there.
- [ ] Fill in README.md and delete the parts that don't apply.
- [ ] Run the privacy check (rule 6) before the first push.

# SEGE Command Center — for review

A Salesforce-style dashboard that sits **on top of this repo's GitHub Issues** — no new
database, same issues the classic board uses. Built for the SEGE/Togo leadership team to
see who's doing what across Facility / Provider / Business projects.

- **Live:** https://togohealth-dev.github.io/sege-tracker/command.html
- **Code:** [`command.html`](../command.html) (single self-contained file, ~315 lines)
- **Classic board:** [`index.html`](../index.html) (unchanged)

## How it works
- Reads open + closed **Issues** via the GitHub REST API. Category/status/priority come from
  labels (`facility|provider|business`, `status:*`, `priority-N`); owner = issue assignee.
- **View-only with no token** (public repo) — anyone can open the link and look.
- **Editing** (Claim / Mark done / Blocked / Add) requires a GitHub token with `repo` scope,
  entered once via **Connect to edit** and stored in the browser's `localStorage` (same key
  the classic board uses). Writes go straight to the issues, so both boards stay in sync.
- Auto-refreshes every 2 minutes.

## Tabs
- **Overview** — needs-attention (blocked + top-priority not-started) and what's in progress.
- **People** — each teammate's active issues (GitHub assignees).
- **Facility / Provider / Business** — projects by category.
- **Follow-ups** — placeholder that ties into the per-person Ops Assistant (Gmail/Tasks digest).
- **Done** — closed issues.

## What to review / decide
1. Is a dashboard over GitHub Issues the right home, or should this live on the Google
   Workspace side (Sheets/Tasks) where the rest of ops runs? (Both prototypes exist.)
2. **Owners without GitHub logins** (Ed, Sam, Eric, Robin, Grace) can't be issue assignees —
   next step is `owner:<name>` labels so everyone shows up in **People**.
3. Bringing the facility/provider **onboarding % + phases** in (currently in spreadsheets).

## Notes
- Nothing sensitive is in this repo (it's public): no contact info, no PHI.
- No build step — it's plain HTML/JS served by GitHub Pages.

# SEGE Command Center — for review

A Salesforce-style dashboard that sits **on top of this repo's GitHub Issues** — no new
database, same issues the classic board uses. Built for the SEGE/Togo leadership team to
see who's doing what across Facility / Provider / Business projects.

- **Live:** https://togohealth-dev.github.io/sege-command/
- **Code:** [`index.html`](../index.html) (single self-contained file, served at the site root)

## How it works
- Reads open + closed **Issues** via the GitHub REST API. Category/status/priority come from
  labels (`facility|provider|business`, `status:*`, `priority-N`); owner = issue assignee.
- **View-only with no token** (public repo) — anyone can open the link and look.
- **Editing** (Claim / Mark done / Blocked / Add) requires a GitHub token with fine-grained scope (Issues on sege-command, Contents on sege-business/sege-staffing),
  entered once via **Connect to edit** and stored in the browser's `localStorage` (same key
  the classic board uses). Writes go straight to the issues, so both boards stay in sync.
- Auto-refreshes every 5 minutes while the tab is visible (rate-limit safe).

## Views (each has its own URL, e.g. `/sege-command/accounts`)
- **Home** — 3 tiles (Accounts / Providers / Business), People, needs-attention.
- **People** — each teammate's active issues (GitHub assignees).
- **Accounts / Providers / Business** — Accounts = facility go-live readiness, Providers = 8-phase onboarding, Business = inline entities/contracts/compliance/marketing workspace.
- **Follow-ups** — placeholder that ties into the per-person Ops Assistant (Gmail/Tasks digest).
- **Done** — closed issues.
- **Bottlenecks** — items blocking the most providers.
- **Checklists** (`/sege-command/checklist.html`) — Supabase-backed checklists w/ staff login; will move into each user's member area.

## What to review / decide
1. Is a dashboard over GitHub Issues the right home, or should this live on the Google
   Workspace side (Sheets/Tasks) where the rest of ops runs? (Both prototypes exist.)
2. **Owners without GitHub logins** (Ed, Sam, Eric, Robin, Grace) can't be issue assignees —
   next step is `owner:<name>` labels so everyone shows up in **People**.
3. Bringing the facility/provider **onboarding % + phases** in (currently in spreadsheets).

## Status (updated 2026-07-31)
Decisions 1–3 below were resolved: GitHub Issues stayed the home for projects, while onboarding/staffing/business data moved to **Supabase** (private, staff login) — see `docs/business-integration.md` and the sege-staffing portal-merge spec. The classic board has been retired (its features live in the Command Center).

## Notes
- Nothing sensitive is in this repo (it's public): no contact info, no PHI.
- No build step — it's plain HTML/JS served by GitHub Pages.

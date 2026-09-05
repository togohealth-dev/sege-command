# sege-command — UI shell (public)

The **SEGE Command Center** front end: generic HTML/JS only — **no project specifics, no staff
names, no roadmap**. Public because GitHub Pages requires it on the Free plan.

Live: https://togohealth-dev.github.io/sege-command/ — **staff sign-in required** (Supabase Auth:
Sign in with GitHub, or email + password).

All specifics live in private repos, loaded at runtime with your token / login:

| Data | Private home |
|---|---|
| Issues (roadmap), staff roster, strategy docs | `sege-projects` |
| Provider PII, onboarding checklists | `sege-staffing` |
| MSO entities, contracts, compliance, marketing assets | `sege-business` |
| Targets, PCC registry, checklists, campaigns | Supabase (login-gated) |

Pages: `index.html` (Command Center, site root) · `targets.html` (JV targeting) ·
`checklist.html` (onboarding checklists) · `bizworkspace.html` (business workspace, embedded) ·
`best-practices.html` (efficiency guides shelf) · `workspace-playbook.html` (Google Workspace
optimization, 62 steps) · `404.html` (SPA route fallback).

Best-practices guides are static operating guidelines — no data, nothing staff- or client-specific,
so no login gate. Progress is checkbox state in `localStorage` per browser, not shared state.
Adding a guide = one new HTML file + one entry in the `GUIDES` array in `best-practices.html`.

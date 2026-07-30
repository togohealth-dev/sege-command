# Business section — integration note

The **Business** workspace is a standalone page: [`business.html`](../business.html)
(+ `assets/store.js`, `assets/business.js`, `assets/business.css`). It reads the
private repo `togohealth-dev/sege-business`. It intentionally **does not touch
`command.html`** — that file is owned by the onboarding lane.

## One remaining wiring step (for whoever owns command.html)
Surface the workspace from the Business view. Additive one-liner in `bizView()`,
right after `v.appendChild(backCrumb('','🔵 Business projects'));`:

```js
v.insertAdjacentHTML('beforeend','<a class="btn pri" href="./business.html" style="display:inline-flex;margin-bottom:14px">Open Business workspace — entities, contracts, compliance & marketing →</a>');
```

(Optionally also point the Business hero tile's `onclick` at `business.html`.)

## Token / ops
Users need a fine-grained PAT with **Contents: read & write on `sege-business`**
(in addition to `sege-tracker` Issues). Same `localStorage['sege-tracker-pat']`.

## Data follow-ups (all editable in-app, not code)
- `marketing/domains.json` is a partial seed — import the rest via the Marketing tab.
- A few `state-compliance.json` IMLC values are best-effort from truncated sheet cells.

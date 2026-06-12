---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:3b0e006f2ebbbab69be84d7ecbb783a9f6486fc29ece86abf5d12e1b92aa01d4
  signedAt: 2026-06-12T17:07:15.215803Z
  signature: ed25519:ICHxAU6UQv8G2YYAKn0FzZGZwE6chJmBGf1LJuwfl45eAKE1Ju4BSxirhIlsgbEMNf5LAjEwkqRPoxhErS4+Bw==
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:3b0e006f2ebbbab69be84d7ecbb783a9f6486fc29ece86abf5d12e1b92aa01d4
  docFilename: 2026-06-12-sensors-restart-shields-out-watchlist-in-domain-purged.md
  stampedAt: 2026-06-12T17:16:47.401946Z
  signature: ed25519:1OJZqxkPnUGB4qv5yPM3hRFCKfBHiLuwof/33+PMA7vB9I70UJu4sQ9LnC72vySl45A/IbWNZmJLUms8TVqvCQ==
---

# Pitch — Sensors restart: shields out, watchlist in, domain purged

**Bet:** delete all 11 shields, the signal registry, and the budget UI from the browser; retire the five intervention modules from `@keel/domain`; restart per-domain DOM knowledge as sensors driven by one self-authored watchlist in `~/.keel/config.json`.

**Why it matters:** the coming weeks become the clean unshielded baseline that interventions will be measured against (interrupted time-series, one at a time, at P5) — and the domain package becomes its thesis: the log is the product.

---

## Boundaries

**JBTD:** As keel's first user, I want the browser to purely observe — with deep sensors on the domains I name — so that my baselines are uncontaminated and every later intervention is measurable against them. Baseline today: 11 always-on shields suppress the very behaviors we must measure, and four scattered mechanisms (shield configs, hosts blocklist, desktop blocklists, sensor-domain choices) decide which domains matter.

**Out:**
- The porn drogue stays — commitment device (precommitment, not attention intervention), the lone prefilled-list exception.
- keel-gate and the agent surface: untouched.
- `apps/desktop`: untouched (frozen), except absorbing `UIPresentation`.
- No intervention of any kind returns in this slice; no baseline report (slice E).

## Elements

- **Shield/signal/budget removal** — delete the 11 shield definitions + content-script activations (`apps/browser/modules/shields/`, `entrypoints/*.content/`), the signal registry (`modules/signals/`), and the budget UI (`entrypoints/manage/main.ts:97-160`, `popup/Popup.tsx:24-60`). DOM selectors ("video ended", "post seen", "game over") are extracted into the sensor substrate before the deletes.
- **Domain purge** — retire `intervention.ts`, `behavior.ts`, `trigger.ts`, `budget.ts`, `drift.ts`, `session.ts`; `UIPresentation` relocates to `apps/desktop` (sole consumer); `@keel/domain` = `activity.ts` + `value-objects.ts` + schema doc. The JITAI eulogy mapping (shield→decision rule, trigger→decision point, budget→baseline-relative constraint, DriftAction→outcome label) is recorded in the retirement decision doc so the P5 rebuild starts from the right vocabulary.
- **Watchlist** (`~/.keel/config.json`) — one self-authored list of domains, tiered `observe` (deep sensors) | `windowed` (vice-block schedule, today's hosts mechanism); neutral default label "watchlist" (presets principle); `logDetail` dial rides per-tier (default: domains). `keel rules` prints it; edits emit `rule_changed`; MCP may tighten, never loosen.
- **Per-domain sensors** — content scripts re-scoped to watchlist domains emit grammar-conforming key-action completions (`video_ended`, `post_seen`, `game_finished`) + domain session opens. Non-watchlist domains keep coarse activity-writer logging only.
- **Migration + sync** — one-time import of existing shield configs + hosts blocklist into the watchlist; the browser mirrors the list in `chrome.storage`, synced manually via the manage page (extensions can't read `~/.keel`) until a relay exists.

## Risks

**🐇 Rabbit holes:**
- The browser↔config sync temptation: do not build a native-messaging relay now. Manual import in the manage page is the whole mechanism.
- Shield deletion tangling popup/manage UI: timebox UI to a bare watchlist + export page; no design pass.
- "Just one shield back" mid-baseline: the answer is the drogue or nothing until P5.

**🏴 Off-sides:** any always-on intervention; windowed-tier enforcement beyond what `vice-block.sh` already does.

**🥩 Fat cut:** per-domain sensor config UI (thresholds, per-key-action toggles) — sensors are uniform per tier this slice.

**🧪 Domain knowledge:**
- Verify content scripts still get injected for watchlist matches after the shields are gone (match-pattern re-scoping).
- Verify desktop still compiles with `UIPresentation` relocated (frozen ≠ excluded from typecheck).

## Acceptance

1. The extension builds and loads with zero shield/signal/budget code; manage page = watchlist + log export.
2. `pnpm typecheck` green across the workspace with `@keel/domain` reduced to activity + value-objects (+ schema doc).
3. The watchlist lives in `~/.keel/config.json`; `keel rules` prints it; edits emit `rule_changed` events.
4. Key-action events appear in the browser log only for watchlist observe-tier domains.
5. The porn drogue is verified still active post-restart.
6. Old shield/hosts configs are imported; no second source of truth remains.

---

_Drafted by Claude (scribe)._
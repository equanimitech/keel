---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:f0faca0ab3e4d747a815c6baacd4e841cc3fb22d131577a5b801a9367479f973
  signedAt: 2026-06-24T21:14:58.231722Z
  signature: ed25519:fhym5T0cG2CgLQ2LlRtUpVIfgoELc50dKWnaHHfmBHXd7x7NU2Et+3/HNZ7LC/FsD7Fu15vqi4t5P9nlqmE3Bw==
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:f0faca0ab3e4d747a815c6baacd4e841cc3fb22d131577a5b801a9367479f973
  docFilename: 2026-06-24-deep-focus-mode-agent-surface-breath-capture-and-a-self-endi.md
  stampedAt: 2026-06-24T21:15:46.172307Z
  signature: ed25519:lPvkjiL1Fl15yYp+OrUzze1zAQYG0Z6fZa+NykAnSHyS7yIdWF7naRzCD6I68hYq1/tDhFSqnWzLOFiCHgK4Bg==
---

**Bet:** Ship an opt-in `keel focus` session mode that, at each turn boundary, points the AI-wait gap at a breath plus a park-the-idea nudge instead of the browser, ends itself at a natural breakpoint, and logs itself so we can measure the drift drop.

**Why it matters:** The EDA showed the AI gap is 61h browser vs 0.1h offline; drift is gap-filling. This is the smallest move that tests whether keel can redirect the gap without a wall.

---

## Boundaries

**JBTD:** As Rafa working a hard problem in one session, I want the wait-for-AI gap to cue a breath and catch my off-thread ideas, and the mode to fade when the stream ends, so that I stay in the stream instead of tabbing to YouTube and never leave a stale mode running. Baseline today: the gap drains silently into the browser (88% of gaps over 10min).

**Out:**
- Fixed timer / countdown / pomodoro end-time. Reintroduces the clock the tides-friction-dial decision retired; the data shows no natural fixed length (0/278 bouts near 90min).
- Browser-tab suppression (browser surface; separate follow-up).
- During-gap timer breath. Agent hooks fire at boundaries, not on a timer; that is the tray's job. See [[2026-06-12-ai-wait-gap-wheel]].
- Single-stream *enforcement*. keel nudges, never blocks (principle 3; high-work-control user).
- Supernote / offline integration.

## Elements

- **`keel focus on|off`** session-scoped mode. Mirror the granularity plumbing (`apps/agent/keel.mjs:202` `cmdGranularity`, `core.mjs` `setGranularity`). State flag, HUD pill in `cmdHud` (`keel.mjs:236`).
- **Breakpoint breath + capture line.** While focus is on, the turn-boundary text channel (`emitText`, the `intentionLine` slot at `keel.mjs:147`) adds one peripheral line: a breath cue plus "park off-thread ideas with /idea, don't chase." Scoreless. Breakpoint-armed, the research-correct trigger, not mid-task.
- **Self-ending stream (breakpoint lifecycle).** Focus clears at the natural end of the sitting: on session start (like granularity) and after a long idle gap (> `sessionGapMin`, `core.mjs`). Fade-by-design: the mode never outlives its purpose. Fast follow-up inside this element: a scoreless "held this stream a while, keep going or close?" at the next boundary past a *derived* elapsed threshold (never a hardcoded duration).
- **`focus_on` / `focus_off` log events** (`store.mjs` writer). Lets the gap-fill notebook segment focus-on vs focus-off and check whether browser gap-fill drops. Closes the loop with the same EDA that found the problem.

## Risks

**🐇 Rabbit holes:**
- A graphical breath animation. v0 is one text line; animation is the tray/wheel's job.
- Tuning the checkpoint's elapsed threshold. Derive it from the focus-on logs later; v0 ships without the checkpoint.

**🏴 Off-sides:** during-gap timer breath, browser suppression, streaks or scores on breaths, a hard end-time.

**🧪 Domain knowledge (equanimitech check):** Sovereignty and fade-by-design. Opt-in, scoreless, nudge-not-block; the breath line and the mode itself must recede on their own. A streak counter or a countdown would be equanimitech-washing. Breath = recovery and noticing, not a performance booster (claim discipline).

## Acceptance

1. `keel focus on` sets a session flag; `cmdHud` shows a focus pill; `keel focus off` clears it.
2. Focus auto-clears on session start and after a long idle gap (> `sessionGapMin`).
3. While on, the turn-boundary output includes exactly one peripheral breath + capture line (max 2 lines), scoreless.
4. `focus_on` / `focus_off` events land in `~/.keel/log`; the gap-fill notebook segments by them.
5. No PreToolUse deny is added. Focus mode never blocks a tool.

---

_Supersedes 2026-06-24-deep-focus-mode-agent-surface-breath-and-capture-at-the-brea.md. Drafted by Claude (scribe). Success signal (post-ship): a week of focus-on vs focus-off shows browser gap-fill down and dwell up._
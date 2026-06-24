---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:4a9aee67f378907701411edb69c69eb7794f3605ce9e4dca18fa32b5f135aa3b
  signedAt: 2026-06-24T21:09:42.067324Z
  signature: ed25519:BkJOe51LsPD5J+tuOm0ArIQ45dMcnrDb5/DaxCZKnDnyF9H3P5s/2LPGtlejoBtzFvTsYL+109gPyrhAIA22Bg==
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:4a9aee67f378907701411edb69c69eb7794f3605ce9e4dca18fa32b5f135aa3b
  docFilename: 2026-06-24-deep-focus-mode-agent-surface-breath-and-capture-at-the-brea.md
  stampedAt: 2026-06-24T21:16:05.871443Z
  signature: ed25519:ITAnRP6Ui/PKxsUxQkwg74YQMzkXXVky6RLsydjaB8PfpmC70XybKK/2uEsGhhOOKGM6rA1MiZPp4Hnf1i0nCA==
---

**Bet:** Ship an opt-in `keel focus` session mode that, at each turn boundary, points the AI-wait gap at a breath plus a park-the-idea nudge instead of the browser, and logs itself so we can measure the drift drop.

**Why it matters:** The EDA showed the AI gap is 61h browser vs 0.1h offline; drift is gap-filling. This is the smallest move that tests whether keel can redirect the gap without a wall.

---

## Boundaries

**JBTD:** As Rafa working a hard problem in one session, I want the wait-for-AI gap to cue a breath and catch my off-thread ideas, so that I stay in the stream instead of tabbing to YouTube. Baseline today: the gap drains silently into the browser (88% of gaps over 10min).

**Out:**
- Browser-tab suppression (browser surface; later slice).
- During-gap timer breath. Agent hooks fire at boundaries, not on a timer; that is the tray's job. See [[2026-06-12-ai-wait-gap-wheel]].
- Single-stream *enforcement*. keel nudges, never blocks (principle 3; high-work-control user).
- Supernote / offline integration.

## Elements

- **`keel focus on|off`** session-scoped mode. Mirror the granularity plumbing (`apps/agent/keel.mjs:202` `cmdGranularity`, `core.mjs` `setGranularity`). A state flag cleared on session start like granularity, with a HUD pill in `cmdHud` (`keel.mjs:236`).
- **Breakpoint breath + capture line.** While focus is on, the turn-boundary text channel (`emitText`, the `intentionLine` slot at `keel.mjs:147`) adds one peripheral line: a breath cue plus "park off-thread ideas with /idea, don't chase." Scoreless. Breakpoint-armed, the research-correct trigger, not mid-task.
- **`focus_on` / `focus_off` log events** (`store.mjs` writer). Lets the gap-fill notebook segment focus-on vs focus-off and check whether browser gap-fill drops. Closes the loop with the same EDA that found the problem.

## Risks

**🐇 Rabbit holes:**
- Building a graphical breath animation. v0 is one text line; animation is the tray/wheel's job.
- Gap-threshold tuning. The breath fires at the turn boundary, so v0 needs no threshold.

**🏴 Off-sides:** during-gap timer breath, browser suppression, streaks or scores on breaths (that would make it engagement, betraying sovereignty).

**🧪 Domain knowledge (equanimitech check):** Sovereignty and fade-by-design. The mode stays opt-in, scoreless, nudge-not-block, and the breath line must be able to recede once the habit forms (no permanent nag). A streak counter would be equanimitech-washing. Breath = recovery and noticing, not a performance booster (claim discipline).

## Acceptance

1. `keel focus on` sets a session flag; `cmdHud` shows a focus pill; `keel focus off` and session start clear it.
2. While on, the turn-boundary output includes exactly one peripheral breath + capture line (max 2 lines), scoreless.
3. `focus_on` / `focus_off` events land in `~/.keel/log`; the gap-fill notebook segments by them.
4. No PreToolUse deny is added. Focus mode never blocks a tool.

---

_Drafted by Claude (scribe). Success signal (post-ship): a week of focus-on vs focus-off shows browser gap-fill down and dwell up._
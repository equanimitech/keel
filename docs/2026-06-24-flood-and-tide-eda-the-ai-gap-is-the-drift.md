---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:0db49c306210d4b6544d478ce75018bfb353959e4873199072c90769fdc62f05
  signedAt: 2026-06-24T21:07:05.260989Z
  signature: ed25519:r1EcgSFs6VNUGjT1y2/5sEeZnQC72xOOxBekYZ/DvtnDSWNXolctLF3ziEokYP5dyVI8+8W9RKi6t8HQZW3GAg==
type: note
---
> Findings from the 2026-06-24 flood/tide EDA session. The analysis lives in `nbs/01_tides.ipynb` (gitignored, local-only); `nbs/load.py` is committed. Themes, not a dashboard.

## Problem

keel cannot yet read a tide. The prior session mapped only the browser *ebb* (drift). This session mapped the agent *flood* (deep-work rhythm) and then crossed all three surfaces. The point: can keel recognize flood-vs-ebb from the user's own data, the unfinished core of v0.

## Method

`nbs/load.py` over ~13 focus-days of `~/.keel/log`. Two new primitives: `agent_bouts` (per-session deep-work runs) and `agent_flood` (those bouts unioned across concurrent sessions, anchored to user messages). Plus a cross-surface gap-fill pass. Hypotheses pre-registered against `docs/references/attention-research-basis.md`, leaning on strong rows, pre-flagging weak ones.

## Findings

1. **The tide is readable (the feasibility core holds).** Agent deep-work has a stable circadian peak at 17h, present on 7/9 days. There is a baseline keel can bank.
2. **Concurrency is leverage, not fragmentation.** Summing per-session bout time overcounts wall-clock by 95% (union 2153m vs summed 4188m, a ~1.95x throughput multiplier). 89% of session-switches leave a session that is still grinding (median autonomous tail 15m, median coverage 100%). Only ~10% are thrash. Running many sessions is delegation, not a drift signal.
3. **The AI gap IS the drift.** Between prompts: 49% browser, 37% other app, 10% watching the agent, only 5% offline. By time: 61h browser vs 0.1h truly offline. Gaps over 10min are 88% browser. So drift is not a separate failure, it is what rushes in to fill the latency the AI creates. Offline deep focus (Supernote) is ~0 today.
4. **Human attention is fragmented at a 1-message / 1.5-minute grain.** Dwell median is 1 message (74% of runs are length 1); cadence is faster than Mark's already-alarming 3min average. Single-context flow is squeezed out of active hours: throughput traded for flow, knowingly.
5. **The night-lock is mis-calibrated.** Both flood and ebb peak in the afternoon (flood by watch: afternoon 48%, morning 24%, evening 20%, night 8%). The surviving wall guards a near-empty window. Captured separately as a pain.

## Claim discipline

Circadian = strong (kept). Ultradian ~90min = absent (0/278 bouts in the 75-105m band, refuted exactly as pre-flagged). The attention-residue cost paid on *returning* to a session is unmeasured, so not claimed. Human-multi-agent fragmentation is off the 2008-2023 research map (Mark/Leroy studied a human switching between passive apps, not one steering active autonomous agents).

## Next

- Shape **deep-focus mode** (captured as an idea).
- Decide the **night-lock** (captured as a pain).
- Week-scale / day-of-week baseline waits for ~6-8 weeks of data; circadian qualifies today, weekly does not.
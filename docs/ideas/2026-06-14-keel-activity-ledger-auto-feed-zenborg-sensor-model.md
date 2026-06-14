---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:39c4579280d2fc4424be87b88322af4469f93f227f94357fcce1d2f7f9a7604b
  signedAt: 2026-06-14T11:05:52.193021Z
  signature: ed25519:BTw1e69e/ljKAcVZsR84bQVdK3e8ZI+DelQHNKX4+olL8K0TIZCaIkaq1mACs3LkEhC+LVHVfX8zhn8O73qODw==
type: idea
---
# keel activity ledger → auto-feed zenborg (sensor→model)

Captured 2026-06-08.

keel hooks already observe real activity with timestamps + project (cwd from the hook stdin): session-start, every user-submit, pre-tool. Today keel only uses this for the friction gate. But it's a passive, high-fidelity activity sensor for free.

Idea: keel emits an append-only activity ledger — per session {start, end, project/cwd, turn count, maybe tool counts}. It already tracks sessionStartTs/lastPromptTs + 30min gap detection (updateSession). Add cwd capture + a ledger file (~/.keel/activity.jsonl or similar).

A bridge maps project → zenborg area/habit and PROPOSES moments from the ledger. This turns morning beat 5a / sign-off "reconcile the garden truthfully" from manual narration into "here's what you actually did (timestamped), confirm/adjust." The garden becomes true by sensing, not self-report.

Why it matters: closes the loop. keel gained INTENT dials today (intention/appetite); this adds REALITY emission. zenborg = the truthful projection. High-fidelity time/project modeling, automatic.

Sovereignty guardrail (HARD, equanimitech): this is self-activity-logging — must stay local, private, and PROPOSED-not-auto (human curates; never silent surveillance). Awareness without a panopticon. Also feeds the de-overfit/generalization story (keel as a calm time-sensor).

Build later (not midnight). Pairs with: the keel generalization memo (docs/2026-06-07-keel-generalization-exploration.md), morning/sign-off reconcile beats, scoping fix (intention/appetite session-scoped).

Captured via /triage on 2026-06-14 from the Things inbox.
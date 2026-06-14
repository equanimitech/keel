---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:941a358e15a5924ee084ecdd36202d39ea742d929fc12dc9e93e9e0e405160d8
  signedAt: 2026-06-14T11:07:03.199155Z
  signature: ed25519:W5TGKE1rWLSK7dUh0MKkA9OMVL5KJGdFf0LfCf2tH50xLB69F3kXDQODk0Bfb/cuH9C3DjjKTapkNQoURxwZAA==
type: idea
---
# Add timed blocks to keel (duration as a third dial)

Soft-awareness session timer, lives in keel alongside intention + appetite.

The dials: intention (what), appetite (how deep), duration (how long). Duration is what gives a session a shape in time. Today a keel "session" is really day-grain (one intention/appetite echoed across every Claude Code launch). Duration pulls the grain down to the sitting.

- A "block" = a timed instance against the standing day-intention. Started ad hoc, many per day. Carries: inherited intention, startedAt, length, which pings have fired.
- Soft awareness only, no enforcement.
- Threshold pings glide in at T-30 / T-15 / T-5, plus an edge ping at T-0. Quiet through the absorbed middle.
- Pings ride keel's existing each-turn echo line (the one that already shows the intention).
- Delivery = turn-evaluated (lazy): keel checks elapsed time on each turn, shows a ping only if a threshold was crossed since last turn. No background daemon, no OS notification. The clock speaks only when you're at the keyboard, never barges in. (Tradeoff: a ping waits for your return if you step away; for soft awareness that's correct.)
- Edge (T-0): one gentle ping ("you've reached your 90 min on X"), then silence. No overrun ticker, equanimity says don't guilt-trip the overrun. Want to keep timing? Start a fresh block.

Why keel, not zenborg/secretariat: keel owns the session as a unit and already does temporal enforcement (wind-down, 01:00 lockdown). zenborg is plan-time (cycle/phase/moment), not a wall clock. secretariat is attestation. If a block should be a Touch-ID-sealed commitment, keel runs the clock + secretariat stamps the contract (the /sign-off pattern, scoped to a block).

Don't shape yet.

Captured via /triage on 2026-06-14 from the Things inbox.
---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:298eed1ff84c8b2c5b80aa6ed915428e8ad3d30097299e2d6f8f99104df255b0
  signedAt: 2026-06-12T18:05:09.841924Z
  signature: ed25519:HPNpetw6vd0SfgXL9Bz3ltdVnKhgDT/m9eWBKeXuLa2dE3m4jZweWnLZAFR/SIfqqKD1V/oYMf9dLxkkJfUnDw==
type: idea
---
# Video budget via regenerating credits

- Budget the number of videos watched per day: each video costs a credit; credits regenerate over time (regen mechanic open — "or something").
- P5 intervention material (interventions return on baselines). Note the fit: absolute budgets were retired 2026-06-12 for lacking validated thresholds — a credit/regen mechanic is a *graded* form, and regen rate could be baseline-relative ("your usual ± z") instead of a fixed cap.
- The consumption meter already exists: `video_started`/`video_ended` sensor events on observe-tier domains.
- Skip-credit precedent: keel-gate's monthly skip budget is the same shape (credits + refill) — one mechanic, two uses.
- Questions:
  - Regen curve: fixed N/day vs time-trickle vs baseline-relative?
  - Notch at zero credits: signal-only (count visible) vs delay vs block?
  - Does this become the rebuilt form of the retired `BudgetDimension` (eulogy: baseline-relative constraint)?

Don't shape yet.
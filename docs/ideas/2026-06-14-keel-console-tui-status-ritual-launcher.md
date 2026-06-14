---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:97ce479cbdc1527b743f87e79fa43796f25a268efc8166a3f92d38f8746f36b4
  signedAt: 2026-06-14T11:05:34.358754Z
  signature: ed25519:QggMIk/KJ/UwhnkaWPlnrrlJyofDY4gwJCyHtafnQJggI7img8VJhdWN/TNtlUyRAN9Os0PtgYHdWJzUchG6BQ==
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:97ce479cbdc1527b743f87e79fa43796f25a268efc8166a3f92d38f8746f36b4
  docFilename: 2026-06-14-keel-console-tui-status-ritual-launcher.md
  stampedAt: 2026-06-14T11:05:55.958679Z
  signature: ed25519:YFKmWdX76VSnfjm6xRmJk0mMLzoOPCgEQhjXCr+wV1I/qMycqU1oMvvMaFYkFyWEDGMiiDbaLzEbMQTTfxZwBg==
---
# keel console TUI — status + ritual launcher

Captured 2026-06-08. Wants the personal-OS as a TUI, not aliases/hotkeys.

A single-screen "keel console":
- STATUS bar (live from ~/.keel/state.json + config.json, + zenborg): phase + friction (day/wind-down/lockdown), ◎ intention, ▤ appetite, vice-block on/off, skip credits, wound-down streak.
- RITUALS: morning · wind-down · sign-off · weekly · recall · wake-up → each shells out `claude "<prompt>"`.
- DIALS/TOGGLES: set intention / set appetite (write via keel.mjs); vices on/panic/off (vice-block.sh); sign off now = keel.mjs signoff (lock).
- PIPELINES: journal-review.py · jungian-distill.py.

Tech: best = Ink (React TUI) IN the keel repo — reuses core.mjs to render phase/intention/appetite directly; becomes the product face (ties to equanimitech ritual-app idea + keel de-overfit/generalization). Fast v1 alt = a `gum` (Charmbracelet) shell script (~60 lines).

Build in daylight (real build, not 2am). Pairs: aliases already at ~/.keel/aliases.zsh (the CLI version); keel generalization memo; activity-ledger→zenborg idea (status bar could surface it).

Captured via /triage on 2026-06-14 from the Things inbox.
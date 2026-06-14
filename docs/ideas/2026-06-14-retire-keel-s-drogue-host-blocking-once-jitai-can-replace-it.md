---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:8882038ec1e5147dea5de64e5234dd09c38ceb2b0257490a298410113d8e1b7f
  signedAt: 2026-06-14T11:06:23.537225Z
  signature: ed25519:0G3srY6OMi70SWG9VLXVNcx1V7RhukEzm6HJhnqeG776Ifj6DWzIB4jcufiYoCB1YQL94bJQUr5HuFzMD01vCQ==
type: idea
---
# Retire keel's drogue (host blocking) once JITAI can replace it

Eventually drop the drogue (network/host blocking) — it's misaligned with keel's core.

WHY:
- Philosophically it's a wall, not catch-and-steer. keel's spine = stability + steerage (catch the pull, hold your course) via awareness → JITAI at the breakpoint. A hard host-block is the "crutch, not capacity" pattern the equanimitech diagnostic flagged.
- Practically it's whack-a-mole / leaky: desktop host-blocking just migrates the compulsion to another device (phone). Cross-device a per-browser block does nothing. Real answer = intervene at the moment of reach, not block the destination.

SEQUENCING:
- The drogue is currently keel's ONLY intervention (the retired intervention layer's lone survivor). Dropping it leaves keel observe-only until JITAI ships. So: keep as stopgap until the JITAI loop replaces its function, then retire it.

TIES: P5 / JITAI design work + archived desktop BCT/PDP gems (git tag desktop-archive-2026-06-13; docs/decisions/2026-06-13-remove-desktop-preserve-compass-gems.md).

QUESTIONS:
- What does the JITAI replacement for "block this site" look like at the moment of reach? Is there ever a place for a user-chosen wall?
- Cross-device: does keel need a phone surface for the intervention to hold where the compulsion lives, or does the awareness/skill transfer?

(Captured 2026-06-13; keel-gate blocked the repo docs/ideas/ write during late-night lockdown, so parked here. Move to docs/ideas/2026-06-13-retire-the-drogue-when-jitai-lands.md next session if wanted.)

Captured via /triage on 2026-06-14 from the Things inbox.
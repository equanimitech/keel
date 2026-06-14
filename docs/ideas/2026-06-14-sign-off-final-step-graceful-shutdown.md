---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:845954220a831b2eed5ccfd42cfba75481e79062c40e0e1c26820ca3ff81607d
  signedAt: 2026-06-14T11:05:20.818354Z
  signature: ed25519:aKxwhTz174MHQstLGSrkQUgG3Sz5IRrHIFsQOmHGjej4zxOQGIFw7CxSbWhsFFWldhglNzCXfTl9q9JqzzbTBQ==
type: idea
---
# sign-off final step → graceful shutdown

Captured 2026-06-08. After stamp + keel signoff + vice-block, sign-off's LAST step = confirmed graceful shutdown (total disconnect; kills the scattered sessions). Use `osascript -e 'tell app "System Events" to shut down'` (graceful, apps can save, no sudo) — opt-in + explicit confirm (irreversible-ish). Add to ~/.claude/skills/sign-off + maybe a `kshutdown` alias. The machine going dark IS the disconnect.

Captured via /triage on 2026-06-14 from the Things inbox.
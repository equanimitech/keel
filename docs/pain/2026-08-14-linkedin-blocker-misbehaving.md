---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:0eb7fca08bbb91050ed9d70c76447d0473ac76c663a14b104affd5911a5772a6
  signedAt: 2026-08-14T18:02:21.115187Z
  signature: ed25519:cSRhzvxYB/xd0fDhVdQ+ppaFxNtbULCZH0BGpFzMxazw8v5im4dYcW615hMDZ8icOC3rxm0WrVrKQHGeou/jDg==
type: pain
---
# LinkedIn blocker misbehaving

Captured 2026-08-11: **something wrong with the LinkedIn blocker.**

## What is known

The capture is a bare symptom with no notes — it records that the blocker misbehaved, not how. Worth writing down before the memory of it goes.

The blocker is the hosts-file mechanism locked by the root daemon. Its failure modes are not symmetric, and which one this was matters:

- **Fails open** — LinkedIn reachable when it should be blocked. The blocker is not doing its job and the friction it promises is illusory.
- **Fails closed / stuck** — LinkedIn blocked when it should be released, and the release path doesn't work. Worse, because it makes the whole mechanism something to route around rather than trust.

## Next step

Not a fix — a reproduction. Note the state of the hosts file and whether the root daemon was running the next time it happens. Without knowing which direction it failed, any change is a guess.

Sits alongside the open question in [kill the /focus skill](2026-08-14-kill-the-focus-skill.md): both are survivors of the walls-era design that the tides/friction-dial direction has been steadily retiring.

---

Dispatched from Things inbox by /triage on 2026-08-14.

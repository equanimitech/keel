---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:ab1c7578f96adb889e9fc81cc0ae952d83091f772e0f15b7196f93186b672d63
  signedAt: 2026-06-26T08:48:17.573220Z
  signature: ed25519:C9Ay0l/T223XIpx1hb5TqG7Lg74vwOkz3tFVxuahfNUKQJdWxRQHoJnK1qevvky9Umw2THVS/wr/bvKAjTR7BA==
type: idea
---
# Guard: open-source docs must never leak personal/private info

Before open-sourcing keel (or any repo), ensure docs AND code carry no personal data: the watchlist domains in `nbs/load.py`, doc content referencing personal drift patterns, real numbers, etc.

Want a commit-time / pre-publish guard (a PII scan or a de-Rafa pass on docs). The `.ipynb` is already gitignored — extend that same vigilance to committed docs.

_Dispatched from Things inbox by /triage on 2026-06-26._
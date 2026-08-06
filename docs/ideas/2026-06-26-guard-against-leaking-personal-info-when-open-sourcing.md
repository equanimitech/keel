---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:ab1c7578f96adb889e9fc81cc0ae952d83091f772e0f15b7196f93186b672d63
  signedAt: 2026-06-26T08:48:17.573220Z
  signature: ed25519:C9Ay0l/T223XIpx1hb5TqG7Lg74vwOkz3tFVxuahfNUKQJdWxRQHoJnK1qevvky9Umw2THVS/wr/bvKAjTR7BA==
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:ab1c7578f96adb889e9fc81cc0ae952d83091f772e0f15b7196f93186b672d63
  docFilename: 2026-06-26-guard-against-leaking-personal-info-when-open-sourcing.md
  stampedAt: 2026-06-26T08:55:01.064278Z
  signature: ed25519:yeWdF5jsvM0L63BDMEX2aExY70+l/JTx9IqWZiRknxxLLbYrSFVuw4YdRGFmaJO2nVrDhIZABfoszhEk7cZsBQ==
---
# Guard: open-source docs must never leak personal/private info

Before open-sourcing keel (or any repo), ensure docs AND code carry no personal data: the watchlist domains in `nbs/load.py`, doc content referencing personal drift patterns, real numbers, etc.

Want a commit-time / pre-publish guard (a PII scan or a de-the operator pass on docs). The `.ipynb` is already gitignored — extend that same vigilance to committed docs.

_Dispatched from Things inbox by /triage on 2026-06-26._
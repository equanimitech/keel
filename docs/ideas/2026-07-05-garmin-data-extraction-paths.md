---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:eea5e65b032fe5d36d63bb0a314cef5269ebe6d13f1b24420921e39a9fd3b45c
  signedAt: 2026-07-05T17:31:55.556142Z
  signature: ed25519:WPCGRS+2eu7PnV8fiIsWgOy2VoTxlSvxwNTlpQEHFdfckusKxVHDWMlLHHiXJrLD78kHbw3zofFxUqB9hHpEDg==
type: idea
---
# Garmin data extraction paths

Two paths: (1) python-garminconnect — unofficial Python wrapper, 134+ endpoints, no approval needed, good for personal use. (2) Official Garmin Health API — JSON push/pull, requires partner program approval, uses OAuth 1.0a.

For personal/Keel use, python-garminconnect is the pragmatic choice. Terra API is a third-party aggregator option if multi-wearable support matters later.

Related: [[garmin-as-equanimitech-peripheral]].
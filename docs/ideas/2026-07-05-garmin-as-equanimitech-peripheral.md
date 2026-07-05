---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:24b801fe28d62491f6c92ba6139389e74fef908f28d7941d5f081dd6c2c1b778
  signedAt: 2026-07-05T17:31:30.394204Z
  signature: ed25519:kD8OFamz8NtE/5DLaxaW2lVSqNjtS+NfEUs8wWCVVpw8VOI6BVaNSB/w9O0LXkFd/ESdNED2a1a8Z5+XvzNCAA==
type: idea
---
# Garmin as equanimitech peripheral

Use Garmin Instinct 3 as dumb sensor for Keel/Zenborg consciousness budgeting.

Architecture: sit → record as Yoga activity on Garmin → sync → Keel/Zenborg pulls session data via python-garminconnect → budget updated. No on-watch app needed.

Activity payload includes: duration, HR curve, stress delta, Body Battery before/after, respiration average.

Watch stays dumb sensor, Keel is the reflective layer.

Related: [[garmin-meditation-tracking]], [[garmin-connect-iq-options]], [[garmin-data-extraction-paths]].
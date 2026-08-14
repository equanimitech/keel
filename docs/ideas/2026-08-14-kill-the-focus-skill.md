---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:ed4117adae400afb66791bfed2568788f7d1eed4b6cf2ffb906650e1acae8531
  signedAt: 2026-08-14T18:02:10.860768Z
  signature: ed25519:5dNB0YTinJicyHGNzUTzeKmXUlXCVw7goqPyHa6ROUc19GQGJu+iGWDG+nTd1atIxlM8RpXKKWBmoWCmseifAA==
type: idea
---
# Kill the /focus skill

Captured 2026-08-12: **kill the `/focus` skill.**

## What it does today

`/focus` arms keel's focus gate — a single-stream lock that holds other sessions, with the active moment naming the stream.

## Why it's a candidate for removal

It belongs to the **walls** family, and keel's direction since 2026-06-17 has been tides and a friction dial, *not* walls. The retirement of lockdown, vice, and credits left `/focus` as a survivor of a design the project has since disowned: a hard gate that refuses, rather than a signal that informs.

There is also the `close-up` overlap — closing a block already releases the intention and keel's focus gate, so the arming half is the only unique surface `/focus` still owns.

## What to check before removing

- Does anything else call the focus gate, or only `/focus` and `close-up`?
- Is the gate itself dying, or only the skill that arms it? (If the gate stays, something has to set it.)
- Does `week-planning`'s "only craft blocks drive keel's intention" rule depend on it?

---

Dispatched from Things inbox by /triage on 2026-08-14.

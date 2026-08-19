---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:1a7997f343a8d26a630492aaea2b0f1447a0d91b1ee2aaf534f6223bca699b56
  signedAt: 2026-08-19T16:13:21.063921Z
  signature: ed25519:jfhn+SlMK9nyk/6N9Yl2eXdytC+8vo3cwJ2dKD0+dYuR0vn1dmz51nRqhMqXOCVG274d2JHeHUIJ6xhHb+dPBw==
type: pain
---
# LinkedIn reloads the feed because it is on the wrong primitive

Observed 2026-08-19: the YouTube gate has measurably curbed usage, and the
obvious next move is the same treatment for LinkedIn. But LinkedIn today does
not gate. It sits in a reload loop on the feed.

The two sites are on different primitives, and that is the whole story.

## Why the loop happens

YouTube is on `gate`. A content-script overlay fires every N minutes of
attended dwell (`apps/browser/modules/friction/gate/`), carrying the friction
and both affordances the rule declares. Nothing is touched at the network
layer. The page keeps working; the only cost is the interstitial. That is why
it curbs without feeling broken.

LinkedIn is on `cooldown`, which projects to a declarativeNetRequest `block`
rule (`apps/browser/modules/drogues/blocklist/sync.ts`). That rule covers
`ALL_RESOURCE_TYPES`: `main_frame`, `script`, `xmlhttprequest`, `websocket`,
the lot. Blocking every resource type is correct for the drogue tier, where a
blocked `main_frame` is the entire interaction and the browser's own blocked
page is the end of it.

It is wrong for a site you are already inside. The feed is an SPA that is
already running when the block lands. Its voyager XHRs get blocked one at a
time, and its client reads each blocked request as a transient network failure,
so it retries and re-mounts the feed. Assets on `licdn.com` keep loading
because that is a different registrable domain, so the shell renders and only
the data fails. Hence a feed that visibly reloads forever instead of a page
that cleanly refuses to load.

Nothing here is malfunctioning. `block` is doing exactly what it says. It is
the wrong shape for the surface.

## What this supersedes

[LinkedIn blocker misbehaving](2026-08-14-linkedin-blocker-misbehaving.md)
recorded the symptom and guessed the mechanism was "the hosts-file mechanism
locked by the root daemon". There is no hosts-file code anywhere in keel. The
blocker is DNR, in the extension. That doc's proposed next step, a
reproduction, is no longer the blocking unknown.

Its framing of the failure direction still holds, and the answer is neither of
the two it offered: the block did not fail open and it did not fail closed. It
held exactly as specified and the specification was wrong for LinkedIn.

## The move

Take LinkedIn off `cooldown` and put it on `gate`.

Order matters. Adding a gate rule does not lift the block; both would apply and
the loop would survive. Remove or disable the cooldown primitive covering
`linkedin.com` first, confirm the loop stops, then add the gate.

A starting rule, as `~/.kairos/keel/rules/linkedin-dwell-gate.json`:

```json
{
  "id": "linkedin-dwell-gate",
  "name": "LinkedIn dwell gate",
  "description": "A stopping cue every 20 minutes of attended LinkedIn.",
  "domains": ["linkedin.com"],
  "mechanism": "cue-interrupt",
  "defaultEnabled": true,
  "fadeEligibility": "auto",
  "persistAcrossSpaNavigation": true,
  "primitives": [
    {
      "kind": "gate",
      "trigger": { "type": "dwell", "everyMinutes": 20 },
      "frictionType": {
        "type": "intention",
        "prompt": "Still what you came for?"
      },
      "proceedAffordance": {
        "label": "Keep scrolling",
        "action": { "type": "continue" }
      },
      "abortAffordance": { "label": "Close the tab" }
    }
  ]
}
```

`linkedin.com` bare is correct. Domains are normalized before matching, so the
`www.` host resolves to the same key.

Escalation, if 20 minutes alone proves too cheap, is a second rule rather than
a new field: `evaluateGates` runs every gate on the domain and shows the one
with the larger interval when both come due, while still recording both. A
20-minute cue and a 60-minute beat are two files.

## One thing fixed along the way

`docs/primitive-contracts.md` declared rule scope as `domain: string`, with
`linkedin.com` as its literal example. Every loader reads `rule.domains` and
`rule.areas`. A rule authored from that doc resolves to the empty domain set
and covers nothing while still reading as enabled. Corrected in `085376d` on
`worktree-linkedin-gate`.

## Open

Whether LinkedIn actually carries `cooldown` is inferred from the symptom and
the code, not read from the rule. `~/.kairos/keel/rules` is private tier and
was not readable in the session that wrote this. The confirming line is in the
extension's service worker console: `[keel blocklist] synced N blocked
domain(s)` prints the list it is enforcing.

---
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:9205c492789ee84f94f78c949d0aa63e0876c380b73e22beafbf648a07be41f5
  docFilename: 2026-06-19-co-version-sign-on-sign-off-with-keel.md
  stampedAt: 2026-06-19T11:10:59.882612Z
  signature: ed25519:l85MI990vNYONJtDXzoByKFtCL+9XwQNLJzxt+icy2kpLkn4m7E2A03H0oJam3vU6Onxg9aCUIYR9SJ5u3lcBA==
---
# Co-version the sign-on / sign-off rituals with keel

**Date:** 2026-06-19
**Context:** `keel` (and the operator's personal `~/.claude/skills/` ritual layer)

## Decision

The `sign-on` (day-open) and `sign-off` (day-close) rituals will eventually ship **with keel** rather than living only in a user's personal skill directory — but as a **two-layer split**: keel ships the *generic ritual shape* (the open/close skeleton + the `keel signon`/`signoff` wiring + the nudge contract), while the *personal instance* (the operator's `#data/#ux/#offer` verticals, Zenborg areas, Linear, journal paths — all Themia-specific) stays in `~/.claude/skills/` as the instantiation. Not done now; recorded as the target architecture and its trigger.

## Rationale

keel already owns half of it: the session-start hook, the persistent `⊙ sign-on` HUD chip, the `keel signon`/`signoff` commands, and the nudge contract all live in keel. The skills are just the front-end that calls that mechanism — they are two halves of one product.

The argument is **drift**. On 2026-06-19 the keel nudge config still pointed at `/morning` and `/weekly-review` for days after those skills were renamed/deleted (→ `sign-on`, merged into `week-review`), because the keel-side contract and the skill-side rituals version independently. Co-locating the generic ritual + the keel mechanism in one repo makes the contract change in lockstep, killing that class of bug.

Alternatives rejected:
- **Bundle the operator's full personal sign-on into keel** — rejected: it hardcodes Themia/Zenborg/Linear specifics that no other keel user shares. keel must ship the *shape*, not one user's instantiation.
- **Keep everything in `~/.claude/skills/` forever** — rejected: guarantees recurring keel↔skill drift, and gives a second keel user no rituals out of the box.

This preserves the existing invariant (keel = trigger/mechanism, skill = ritual) — the two are *co-versioned*, not collapsed.

## Consequences

- **Distribution vehicle:** keel-as-a-Claude-Code-plugin (ships skills + the hook config together).
- **Trigger to actually do it:** the first **second keel user**, or the next time keel↔skill drift bites — whichever comes first. Not worth the plugin scaffolding at n=1.
- When built, the generic `sign-on`/`sign-off` skeletons move into the keel repo; the operator's personal versions become thin overrides/extensions (verticals, areas, Linear, journal).
- Pairs with the persist-until-signed-on nudge landed this session (`ritualNudge` keyed off `lastSignOnDay`, `keel signon` marker, `⊙ sign-on` HUD chip).

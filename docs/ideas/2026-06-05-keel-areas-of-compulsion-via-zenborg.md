---
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:8fcaa9e79d6b8377cdda487d48ae46d319825aba52b32a392029a975a4f1735c
  docFilename: 2026-06-05-keel-areas-of-compulsion-via-zenborg.md
  stampedAt: 2026-06-04T22:53:45.003416Z
  signature: ed25519:4n7LLJZk2y5tl7SHINrGAoNsMt1q6WSM1qzluZKyhOOu6yOFt5GbkzER5RkMKtBplhVDFhoJrsZHcLtfv7KnBg==
---
# keel: areas of compulsion (sourced from zenborg?)

> Captured 2026-06-05, late.

## The want

Define **areas of compulsion** — named groupings of targets you tend to overdo (YouTube,
chess, …) — instead of hardcoding a flat domain list. Maybe define them *through zenborg*.

## The fit

In the snack-window Drogue, `COMPULSION_DOMAINS` is a flat hardcoded array. An "area of
compulsion" generalizes it: a named group with its own drivers (schedule windows,
commitment locks) and notch. The Drogue engine consumes areas, not loose domains.

## The zenborg angle

zenborg already has **Areas** ("a plot of the garden — a life domain you cultivate"). A
compulsion area could be the shadow side of that vocabulary: not a domain you cultivate but
one you **fence**. Open question whether to:

- **Reuse zenborg Areas** directly (one Area, e.g. "Idle scrolling", carries both its
  cultivation intentions *and* its keel fence) — unified life-domain model, but couples keel
  to the zenborg vault.
- **Mirror the concept** in keel (keel has its own `Area` notion, optionally *linked* to a
  zenborg Area id) — looser coupling, keel stays standalone/local-first.

Leaning mirror-with-optional-link: keel must work without zenborg installed (sovereignty,
local-first), but can enrich when it's present.

## Shape (sketch)

```
Area {
  id, name,
  targets: Domain[],          // what's fenced
  drivers: Driver[],          // schedule windows + commitment locks
  notch: Notch,               // how hard (default: block)
  zenborgAreaId?: string,     // optional link
}
```

The hardcoded v0 (`COMPULSION_DOMAINS` + `ALLOWED_WINDOWS`) is exactly one Area with one
schedule driver — the refactor target.

Relates to: `docs/superpowers/specs/2026-06-05-snack-window-drogue-design.md`,
`2026-06-05-keel-big-red-button-multiday-commitment.md`,
`2026-06-05-keel-standardized-drogue-notch-scale.md`.

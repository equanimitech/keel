---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:ce9bc600f56c48c645c65535578f5b5fcbca3c234d8b0bb966f4e37e3acc5087
  signedAt: 2026-06-24T16:49:20.089535Z
  signature: ed25519:z/mGp6RcgO4OU/7g7pGAdY4vDRkJqHYVZKmbU2Ii64DLJowqTKBcPBLD3xieRvFLWV7AQTmdFvFkSpKpjtBLAg==
type: decision
---
# Rename keel's friction model from "strategic friction" to "defensive friction"

**Date:** 2026-06-24
**Context:** `keel` (platform-wide lexicon; the friction model is keel's spine)

## Decision

keel's friction model is **defensive friction**, not "strategic friction." The term "strategic friction" is retired.

- **Defensive friction** guards what the user already chose — it defends the declared session intention and the focused bout against intrusion and drift. It never strategizes *at* the user.
- **Strategic friction** carries the opposite frame: a strategist placing friction to shape behavior, friction done *to* the user. That frame contradicts sovereignty and is also taken UX jargon.
- The keel metaphor holds the distinction: a keel does not drive the boat, it resists being knocked off course. Defensive, stabilizing, in service of the heading *you* set.

This renames `docs/superpowers/specs/2026-06-01-strategic-friction-design.md` and re-centers all keel publishing copy on the term.

## Rationale

The reframe collapses cleanly onto every prior keel decision — no walls, observe-first, the tide reads *your* intention, the graduated dial. "Defensive" names the sovereignty that those decisions already imply: friction is legitimate only when it defends a choice the user made, never when it imposes one. It is also the more ownable, publishable term — "strategic friction" already exists as deliberate-friction UX jargon, while "defensive friction" is a coinable category concept and the lead thesis for the keel essay.

## Consequences

- The `strategic-friction-design` spec is renamed; the driver -> `f` -> renderer model inside it is unchanged in substance, only in name.
- The torchbearer "The Keel" article thread and the `personal-os` drafts re-center on defensive friction.
- Publishing stays gated by the 2026-06-17 decision: the repo must embody catch-and-steer (read a tide, defend the bout) before the defensive-friction essay ships, or it is equanimitech-washing.
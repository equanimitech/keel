---
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:43aba8107f7d7c0521f25ab0a3f6fc2aa179e8211a2d3a21befe10edd6675636
  docFilename: 2026-06-12-keel-productization.md
  stampedAt: 2026-06-12T14:13:01.662594Z
  signature: ed25519:i9WFk1vJ7peNyv8BgS6BZabo0pr4b21GoO39VmWJ7pNfH1uyU27g96h05ltgOmgAp1UOS5jNn4u208FbbUx6Ag==
---
# Productize keel as one substrate, three surfaces — keel agent leads

**Date:** 2026-06-12
**Context:** `keel` (equanimitech)

## Decision

keel productizes on the capability × surface grammar: **keel agent** (Claude Code
hooks — the gate that keeps Claude facing the right direction, and the session
logger), **keel browser** (extension), **keel desktop** (tray-only app). The
component name "keel-gate" is retired from public use; repo/package renames are
deferred until the identity hardens. The **tray app is the product's home** — one
download that installs and pairs the other surfaces. The **beachhead is keel
agent**, distributed as a Claude Code plugin, launched only after observability
roadmap P0–P1 plus ~3 weeks of the author's own data exist as the demo.
Sequencing stands: observability first; interventions as a separate later module.
The product rules ship as a public contract: local-first, logs never leave the
machine, override always easier than the gate, no engagement metrics,
works after the commercial relationship ends, fade-by-design.

## Rationale

"keel-gate" felt wrong because it names a component while the architecture names
capability × surface — fixing the grammar dissolves the naming question for free.
keel agent is the only surface with daily-proven value, the only one with no
competitor, and the plugin marketplace reaches exactly the audience with the
unpublished pain (AI-wait gaps, fragmented agentic sessions) at zero distribution
cost. Browser-first and desktop-first were rejected: both enter saturated markets
(Freedom/Opal; RescueTime/Rize) where keel's differentiators are invisible without
the agent story. A unified monolith app was rejected as the classic backward push
(and fails the Power-Rangers test). The rules-as-contract is the moat:
engagement-funded competitors cannot copy local-first/fade-by-design without
dismantling their business models.

## Consequences

- Roadmap and pitch queue adopt surface naming (keel agent / browser / desktop).
- Tray slice (pitch B) doubles as the product home; its scope gains pairing duties.
- Launch gate is data, not code: P0–P1 shipped + 21 days of own logs.
- Multi-user sync, driver generalization, and any rename stay off the table until
  a second real user exists.
- Open, named, not blocking: licensing posture (open core vs fair-source) and the
  hook-install consent flow (sovereignty: show the settings.json diff, ask).

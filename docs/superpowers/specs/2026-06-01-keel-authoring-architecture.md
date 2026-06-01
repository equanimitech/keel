# keel Authoring Architecture — design

**Date:** 2026-06-01
**Surface:** keel (platform-wide; shield authoring lands browser-first)
**Status:** design, settled in conversation — ready for implementation plan
**Lineage:** Secretariat MCP architecture (thin adapter over core, file-as-substrate), `pipeline-flow.md` (LLM-generated interventions), `strategic-friction-design.md` (the shield domain's first content)

***

## Part I — The question

How should an external author (Claude, in any form) **write and commit** keel interventions, and **in what language** does keel's domain live? The question surfaced as a chain of narrowing forks:

1. MCP server, or teach an agent to drive keel via CLI?
2. What about a Rust crate (most of our other projects are Rust)?
3. But the shield domain needs to run in the browser…
4. And we need Claude to *write the TS code* — Claude Code via MCP, or Claude BYOK in the browser?

Each fork tried to pick a **transport or a language** before the **boundary** was drawn. This spec draws the boundary; the transport/language answers then fall out deterministically.

### The leverage read (Meadows)

Choosing MCP-vs-CLI-vs-crate is an **L10 decision** (structure of flows — plumbing). Choosing the *language* is also L10. The oscillation across forks 1–3 is the classic symptom of pushing on a parameter when the leverage is one level up: the **L5 boundary** (what each surface is *allowed and required* to do) and the **L3 goal** (which surface is primary, what keel is *for*). Once those are fixed, language and transport are adapters — cheap, swappable, downstream.

> Same altitude `strategic-friction-design.md` holds: *the leverage is the abstraction and the choice of driver, not the constants.*

***

## Part II — The boundary (invariant)

keel is **two bounded contexts**, split by what each touches — not one domain forced into one language.

| Context           | Owns                                                                                  | Surface                         | Language                                                                     |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| **Shield**        | `RuleSpec`, the 7 primitives, validator, desugarer, interpreter (DOM), friction model | browser-primary, **standalone** | **TypeScript** (`@equanimi/domain`, authoritative)                           |
| **Compass**       | sessions, drift, budgets, capture                                                     | desktop-primary                 | **Rust** (Tauri backend; existing `TauriStore*` repos)                       |
| **Shared kernel** | value objects (`Duration`, `Friction`, …)                                             | both import                     | TS today; mirror to Rust only at the seam, if/when the compass reads shields |

### Why the shield domain is TypeScript (load-bearing)

**Decision:** the browser surface is *fully standalone* — it must author, validate, and execute shields with no other process running.

A content script cannot call a Rust binary. "Standalone" means the logic **runs there**, so the shield domain's logic lives in TS, in the browser bundle. This is **physics, not preference**, and it **outranks** both the Rust-first portfolio convention and desktop-primary:

* The interpreter mutates a webpage DOM, which exists only in the browser → it is browser-only regardless.

* "Desktop primary" is **product/UX centrality** (the compass is the centerpiece), **not** shield-code ownership.

* Rust-first applies fully and naturally to the **compass** context, where there is no browser-page constraint.

So there is no conflict — the two conventions apply to two different contexts.

### Rejected alternatives (named, with revisit conditions)

* **Rust crate for the shield domain.** Rejected: would either duplicate the `RuleSpec` contract (two sources of truth → drift, the exact thing `primitive-contracts.md` exists to prevent) or reimplement the validator. Secretariat-core is a crate because it is 100% host-side; keel's shield core is not.

* **Rust→WASM shield core.** Rejected for now: WASM cannot touch the DOM, so the interpreter (the bulk of shield work, and the most DOM-coupled) stays TS regardless; WASM would only dedup the validator/desugarer — which **isn't written yet**, so there is zero duplication to remove. *Revisit only if* that pure-logic layer grows large and is being maintained twice.

***

## Part III — Generative authoring (one port, many adapters)

We need Claude to **write the TS**. "Claude Code via MCP" vs "Claude BYOK in the browser" is **not** an either/or — both produce the **same artifact**, already specified in `pipeline-flow.md`:

```
AuthoringRequest {prompt, context}
        │
      Claude (any adapter)
        ▼
AuthoringResponse {spec: RuleSpec, implementation: GeneratedScript, explanation}
```

Everything **downstream** of `AuthoringResponse` is **shared, browser-side, TS, identical** regardless of which Claude wrote the code: ephemeral `chrome.userScripts.register()` → the 5-validator gate (schema / AST / equanimous-intent / equanimous-behavior / conformance) → commit → version → friction-band assignment.

So the design is **one port, several adapters** (SOLID: depend on the abstraction; the LLM is an injected port):

```
                          ┌──────────────────────────────────────────────┐
   AuthoringProvider       │  shared browser pipeline (TS):                 │
   (port, in domain)       │  ephemeral run → validation gate → commit →    │
        │                  │  version → register → friction band            │
   ┌────┼───────────────┐  └──────────────────────────────────────────────┘
   │    │               │                     ▲
 BYOK   desktop-      ClaudeCode-MCP           │ all emit the SAME AuthoringResponse
 (browser  connected   (keel exposes an        │
  fetches   (desktop    MCP tool; CC calls it)  │
  Anthropic holds key,        │                 │
  w/ user   calls Claude,     └─────────────────┘
  key)      syncs down)
```

### The three adapters

| Adapter                 | Role                                                                                                     | Standalone?            | Build order                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| **BYOK-in-browser**     | the shipping product — extension fetches the Anthropic API with the user's own key                       | ✅ yes                  | **first — required by the standalone decision** |
| **Desktop-connected**   | when the desktop app is present, it holds the key, calls Claude, syncs the committed Rule to the browser | n/a                    | with the desktop-primary phase                  |
| **Claude Code via MCP** | dev / power-author surface; same artifact, committed via the desktop bridge                              | ❌ needs a host process | later, optional                                 |

Only **BYOK-in-browser** preserves "fully standalone," so it is the primary path. MCP/Claude-Code is a developer convenience, not the product path — and its delivery problem (getting a host-authored artifact into a *running* extension) is solved the clean way given desktop-primary: **MCP → desktop (Tauri) core → sync → browser.**

### This is the refined "file-as-contract" answer

Earlier framing: *"the agent produces a RuleSpec; the browser imports and runs it."* Refined: the agent produces an **`AuthoringResponse`**, which enters the **same** validation→commit pipeline as the in-browser BYOK path. The artifact (spec + code + explanation), not a live RPC, is the interface — mirroring Secretariat's git-native teardown (files are the substrate; thin adapters over a shared core). No MCP or crate is *required* for authoring; they are optional thin conveniences over the artifact contract.

***

## Part IV — Security (BYOK)

BYOK-in-browser means the user's Anthropic API key lives in the extension. Constraints:

* Store the key in `chrome.storage.local` — **never** `storage.sync`.

* Restrict authoring-call egress to `api.anthropic.com`.

* The key must **never** reach a `GeneratedScript`. The AST validator's "no remote fetch without declaration" rule must treat **two separate worlds**: the *authoring fetch* (infrastructure — the studio calling Claude) and the *shield code* (sandboxed `world: "MAIN"` output). A shield never sees the key; the studio's fetch is not subject to the shield egress rule.

***

## Part V — Build sequence

1. **`packages/domain/src/rules/`** (does not exist yet — still spec in `primitive-contracts.md` / `v2-spec.md`). Define `RuleSpec` + the 7 primitive contracts + `frictionBand` as pure TS (readonly, factory functions, branded value objects). This is upstream of everything: the friction spec is already waiting on these types, and `AuthoringResponse` references `RuleSpec`.
2. **Promote the authoring boundary types** — `AuthoringRequest`, `AuthoringResponse`, and the **`AuthoringProvider`** **port** — from sketches in `pipeline-flow.md` to real domain types.
3. **`BYOKProvider`** — the first adapter; the product path; forced by standalone.
4. **The shared pipeline** — ephemeral run → validation gate → commit → version (largely specified in `pipeline-flow.md`).
5. **Desktop-connected provider + sync**, then **Claude Code MCP** behind the same port — with the desktop-primary phase.

***

## Acceptance

* The shield domain (`RuleSpec`, 7 primitives, validator, interpreter, friction model) lives in `packages/domain` as TypeScript; no Rust crate or WASM core is introduced for it.

* The browser extension can author, validate, and execute a shield with no other keel process running (standalone).

* A single `AuthoringProvider` port exists; BYOK-in-browser is implemented as its first adapter; adding the MCP or desktop adapters requires **no change** to the validation→commit pipeline.

* The Anthropic key is never present in `storage.sync` and never reachable from a `GeneratedScript`.

* The Rust-first convention is honored in the **compass** context (desktop backend), and the spec records *why* it is not applied to the shield context.

***

## Open items

* **Sync mechanism** for the desktop-connected and MCP paths (how a committed Rule travels desktop → browser): native messaging host, a watched directory the extension imports on startup, or an existing sync channel. Decide when the desktop-primary phase begins.

* **Shared-kernel mirroring**: which value objects (e.g. `Duration`, `Friction`) must cross the TS↔Rust seam if/when the compass reads shields, and how the `RuleSpec` schema is published for a Rust reader (`schemars`-style JSON Schema generated *from* the TS, or hand-kept).


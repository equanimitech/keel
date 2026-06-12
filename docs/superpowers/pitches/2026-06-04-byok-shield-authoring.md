---
tag: pitch
appetite: big
status: draft
source: docs/ideas/2026-05-31-ai-byok-shields-generative-interventions.md + docs/superpowers/specs/2026-06-01-keel-authoring-architecture.md
slice_id: A
hard_dependency: chrome.userScripts.register must support runtime registration of user-authored scripts (verify before build)
---

# Pitch — BYOK shield authoring (walking skeleton)

**Bet:** Ship the thinnest end-to-end loop where a user pastes their Anthropic key, describes a compulsion in plain words, and gets a running keel shield — Claude writes it, an AST safety gate clears it, `userScripts.register` runs it.

**Why it matters:** keel ships 9 hardcoded shields. Every site we *didn't* anticipate (X, Reddit, a niche feed) is uncovered, and the user can't fix that without forking the extension. This slice turns keel from a fixed catalog into a tool the user authors — the keystone the prefilled-shields reframe and session-intentions both hang on.

---

## Boundaries

**JBTD:** As a non-coding keel user who hits a compulsion pattern keel doesn't ship a shield for (e.g. doomscrolling X.com), I want to describe it and get a working shield, so I don't have to write TypeScript or fork the extension. Baseline today: 9 static shields in `apps/browser/modules/shields/registry.ts`; if your pattern isn't there, nothing.

**Out:**
- The full `RuleSpec` + 7-primitive domain (`packages/domain/src/rules/` — doesn't exist; building it first is the rabbit hole).
- The 5-validator equanimous-intent / equanimous-behavior gate. Ship the **AST safety floor only**.
- Generative interventions-from-intentions (the *second* feature in the source idea — separate pitch).
- Desktop-connected and Claude-Code-MCP adapters. BYOK-in-browser only.
- The prefilled-shields opt-in / forkable-template reframe (separate decision).
- Versioning, rollback, friction-band assignment.

## Elements

- **BYOK key vault.** Key in `chrome.storage.local` only, never `storage.sync`; authoring egress restricted to `api.anthropic.com`. Mirrors blocklist storage pattern (`apps/browser/modules/drogues/blocklist/store.ts`). Spec Part IV is the constraint.
- **Authoring studio (popup).** One prompt box in the existing React popup: "Describe the shield you want." Lists generated shields beside built-ins (`apps/browser/modules/shields/registry.ts`).
- **Generation call.** Anthropic API from the extension. Output = a `ShieldDefinition` (`apps/browser/modules/shields/types.ts`) + a content-script body, matching the hand-coded shape (`apps/browser/modules/shields/youtube-shorts/definition.ts:3`).
- **Few-shot corpus.** Bundle 3–4 existing shield module pairs (definition + content script) as in-prompt examples — this is the source idea's *"learn from existing ones."* Prefilled shields earn their keep as the training set.
- **AST safety gate.** Reject generated scripts that fetch remote URLs, read the key, or touch network. DOM-only or it doesn't register. This is the minimal floor standing in for the full gate.
- **Ephemeral register + persist.** `chrome.userScripts.register()` the cleared script; persist to `storage.local` so it survives reload and shows in the shield list as active.

## Risks

**🐇 Rabbit holes:**
- Building the `RuleSpec`/7-primitive domain "properly" before proving the loop runs. The skeleton uses the *existing* `ShieldDefinition` shape — no new domain layer.
- Perfecting the equanimous-intent/behavior validators. Out of scope; AST floor only.
- Prompt-engineering the generator to perfection. Good-enough on 3 common sites is the bar.

**🏴 Off-sides:** generative interventions-from-intentions; desktop + MCP adapters; versioning. All deferred — name them so they don't creep in.

**🥩 Fat cut:** the 5-validator gate. Tempting (it's in the spec), but it gates *quality*, and the skeleton gates *safety*. Quality gate is its own slice once the loop exists.

**🧪 Domain knowledge (verify before building):**
- **Load-bearing:** does `chrome.userScripts` (MV3) allow registering arbitrary user-authored scripts at runtime against new match patterns? It needs the `userScripts` permission + a developer-mode/toggle gate, and runtime host access for novel domains. The entire standalone-BYOK premise rests on this. If it doesn't hold, the slice changes shape — verify first.
- Manifest today declares no `host_permissions`; shields get host access via build-time `content_scripts.matches` (`apps/browser/wxt.config.ts`). Runtime registration on a user-named domain is a different grant — confirm the prompt/flow.

## Acceptance

1. User pastes an Anthropic key in the studio; key lands in `storage.local`, never `storage.sync` (verify in devtools).
2. User types "stop me doomscrolling on x.com"; one generation call produces a shield that is registered and **visibly active on x.com** in the same session.
3. The generated shield **persists across a browser restart** and appears in the shield list alongside the 9 built-ins.
4. A generated script that attempts a remote `fetch` or reads the key is **rejected by the AST gate** and never registers.
5. The generation prompt includes **≥3 existing shields** as few-shot examples.

---

_Drafted by Claude (scribe). Unstamped draft. Appetite: `big` — multi-surface (key vault + popup studio + Anthropic call + AST gate + runtime registration). Override with `--appetite=medium` if cutting persistence + studio polish._

# v2 — Rule Engine Clean Break

Spec for collapsing the existing per-shield architecture into a single Rule-driven engine, preserving the domain package and doc trail, shedding everything that fights the new model.

## Goal

One engine executes any Rule composed from the 7 foundational primitives. Adding a shield = committing a spec, not writing an entrypoint. The hand-coded shields disappear; their behavior is re-expressed as Rule specs run by the engine.

## Scope

**Must:**
- Deletion of `apps/browser/entrypoints/*.content/` for all shields and cooldowns (keeps `popup`, `background`, `options`, and any non-shield entrypoints).
- Deletion of `apps/browser/modules/shields/*` — registry model retired.
- `packages/domain/src/rules/` with the types from `primitive-contracts.md` (pure TS, no browser APIs).
- `apps/browser/modules/rules/interpreter/` — engine, per-primitive runners, SPA observer, RuleScope, storage adapter.
- `apps/browser/entrypoints/rules.content/` — single content script that loads committed Rule specs for the current URL and registers them with the engine.
- Migration of `youtube-shorts-scroll-lock` as the first committed Rule. Behavior must match the deleted hand-coded shield.
- Updated `CLAUDE.md` describing the engine architecture.

**Should:**
- Migration of `linkedin-feed-hide` as the second committed Rule.
- Bundled Rule specs (JSON in `apps/browser/src/rules/*.json`) loaded at build time. Later replaced by `chrome.storage.local` populated by the commit pipeline.
- Shield management UI retained — just pointed at the new Rule registry shape.

**Won't (v2):**
- LLM authoring pipeline (experimental → committed). That's v3.
- Validators beyond schema + minimal AST. Ship the engine first, layer validators next.
- Multi-Rule choreography.
- Desktop surface. Keep domain browser-agnostic *where cheap*; defer the actual desktop interpreter.

**v3 assumptions locked in advance (so we don't re-debate):**
- **LLM SDK:** Vercel AI SDK. `generateObject` + Zod schema for `RuleSpec` is the structured-output path. Streaming via `streamObject` for narration during experimental iteration. Runs in the MV3 service worker; content scripts message to it.
- **Provider:** OpenRouter as the sole BYOK path at launch. One `host_permissions` entry (`https://openrouter.ai/api/*`), one API surface, one bundle cost. Model is a user-selected string (`anthropic/claude-opus-4-6`, etc.). Direct-provider adapters (Anthropic, OpenAI) are a later 3.1+ option behind the same interface.
- **Key storage:** `chrome.storage.local` plaintext, with an honest disclosure at key entry ("stored locally, readable by anyone with profile disk access"). No encryption at rest. Matches the BYOK norm across the extension ecosystem.
- **Safety floor is deterministic, not LLM-tuned.** The validator-as-moat is local. The LLM is a drafting assistant. We don't rely on the model's safety tuning for Rule quality.
- **Do in v2, not v3:** author the Zod schema for `RuleSpec` alongside the TS types in `packages/domain/src/rules/`. Needed for schema validator #1 regardless of LLM; ready for `generateObject` when v3 lands. Reserve a "Providers — BYOK (coming with generative Rules)" stub in the settings UI.

## Non-goals

- Rewriting `packages/domain` value objects, behavioral science types, or build tooling.
- Touching `apps/desktop/` — dormant stays dormant.
- Changing the pnpm workspace shape.
- Backporting the old shield dashboard UI 1:1. Minimal dashboard is acceptable.

## Architecture decisions

**Branch, don't fork.** Work on `v2-rule-engine` in the same repo. One clean-break commit deletes the old shields and scaffolds the new structure. Subsequent commits land the engine and the first Rule.

**Domain stays pure.** The 7-primitive types, `ConditionExpr`, `ReactiveBinding`, `DataReference`, `Template`, `RuleSpec` all live in `packages/domain/src/rules/`. Zero browser API contact. This is what lets the desktop surface adopt the same vocabulary later.

**Interpreter is surface-specific.** Each primitive runner (`transform`, `intercept`, `actuate`, ...) has a browser implementation now. The *shape* is shared (`PrimitiveRunner<S>` → `Cleanup`); the implementation dispatches to DOM APIs. A desktop runner would dispatch to OS/accessibility APIs against the same spec shape.

**Primitives are surface-agnostic in intent.** `transform` = modify a UI region. In browser that's DOM; on desktop that could be overlaying an element on top of an app window or dimming a region via the accessibility API. `intercept` = rewrite event behavior — keyboard shortcuts and mouse events exist at the OS layer too. `actuate` = side effect on an interactive element — pausing media, focusing a window, etc.

**Cleanup is structural, not conventional.** Every primitive runner returns a `Cleanup` thunk pushed onto the Rule's scope stack. Unregistering drains LIFO. `cleanupOnUnregister: true` becomes an engine invariant.

**SPA handling is engine-level.** One shared observer per tab, fanning out to scopes that declared `persistAcrossSpaNavigation`. Primitives stay ignorant.

## File changes

### Delete

```
apps/browser/entrypoints/chess-post-game-cooldown.content/
apps/browser/entrypoints/linkedin-cooldown.content/
apps/browser/entrypoints/linkedin-feed-hide.content/
apps/browser/entrypoints/linkedin-notification-badge.content/
apps/browser/entrypoints/linkedin-promoted-posts.content/
apps/browser/entrypoints/youtube-comments-hide.content/
apps/browser/entrypoints/youtube-cooldown.content/
apps/browser/entrypoints/youtube-shorts.content/
apps/browser/entrypoints/youtube-shorts-homepage.content/
apps/browser/entrypoints/youtube-sidebar-recs.content/
apps/browser/entrypoints/youtube-sponsored.content/
apps/browser/entrypoints/youtube-stain.content/
apps/browser/entrypoints/youtube-watch-time.content/
apps/browser/modules/shields/
```

### Keep

```
packages/domain/src/                     (value objects, BehavioralMechanism, SignalDefinition, ...)
apps/browser/entrypoints/popup/
apps/browser/entrypoints/background/
apps/browser/entrypoints/options/        (if present)
apps/browser/wxt.config.ts + tsconfig + package.json
pnpm-workspace.yaml
docs/
CLAUDE.md                                (updated)
```

### Add

```
packages/domain/src/rules/
  index.ts
  spec.ts              RuleSpec + PrimitiveSpec union + shared types
  conditions.ts        ConditionExpr (data only)
  templates.ts         Template + ReactiveBinding + DataReference
  primitives/
    transform.ts
    gate.ts
    cooldown.ts
    observe.ts
    schedule.ts
    intercept.ts
    actuate.ts

apps/browser/modules/rules/
  index.ts
  interpreter/
    engine.ts          register / unregister / scope lifecycle
    scope.ts           RuleScope (cleanup stack, className, snapshots)
    conditions.ts      evaluate(ConditionExpr, ctx)
    bindings.ts        resolve(ReactiveBinding, ctx)
    spa.ts             shared MutationObserver + history patch
    storage.ts         chrome.storage.local adapter with rule:<id>:<key> prefix
    primitives/
      transform.ts
      gate.ts          (stub for v2 — only transform is exercised first)
      cooldown.ts      (stub)
      observe.ts       (stub)
      schedule.ts      (stub)
      intercept.ts
      actuate.ts
  registry/
    index.ts           loadRulesForUrl(url) — reads bundled JSON specs

apps/browser/src/rules/
  youtube-shorts-scroll-lock.json        first committed Rule spec
  linkedin-feed-hide.json                second

apps/browser/entrypoints/rules.content/
  index.ts             load + register for current URL
  matches: ["<all_urls>"]               engine filters by rule.matches internally
```

Three of the seven primitive runners are real at the end of v2: `transform`, `intercept`, `actuate`. The other four are stubs that log-and-skip. They get real when their corresponding shields migrate.

## First increment

The path to a working `youtube-shorts-scroll-lock` on the engine, ordered:

1. **Domain types.** Copy interfaces from `primitive-contracts.md` into `packages/domain/src/rules/`. Ensure `pnpm typecheck` passes. No runtime yet. *(~1h)*
2. **Engine skeleton.** `engine.ts` with `register`/`unregister`, `RuleScope`, dispatcher map (empty), SPA observer, storage adapter. No primitives yet. Compiles. *(~3h)*
3. **`transform` runner.** All four replacement types: `hide`, `text`, `template`, `restyle`. Template renderer with inline styles. `restyle` toggles `equanimi-<ruleId>-active` on `<html>` and scopes rules under it via a dynamically-injected stylesheet. *(~4h)*
4. **`intercept` runner.** Attach/detach event listeners on target. Support `suppress` behavior. Honor `whenKey` filter on keyboard events. *(~2h)*
5. **`actuate` runner.** Triggers: `dom_event`. Actions: `scroll_to` with `snapshot_at_activation`. `repeat: while_condition_holds`. *(~3h)*
6. **`rules.content` entrypoint + registry.** Load bundled JSON specs, filter by URL match, hand to engine. *(~1h)*
7. **`youtube-shorts-scroll-lock.json`** — serialize the spec from `spec-smoke-test.md`. *(~30m)*
8. **Verify.** Load extension, visit `youtube.com/shorts/...`, confirm: scroll snap off, nav buttons hidden, wheel/touch/keys suppressed, scroll position locked. Toggle Rule off via dashboard, confirm full restore (no orphan classes, no stale listeners). *(~1h)*

Est. 1.5-2 days to a passing verification. LinkedIn is another half-day on top.

## Desktop forward-compat

Dormant now. Not dead. Notes for when it restarts:

- **Primitive set likely unchanged.** `transform`, `gate`, `cooldown`, `observe`, `schedule`, `intercept`, `actuate` map onto "dim app window," "modal before opening app," "lock out app category for N minutes," "log app usage," "schedule focus windows," "suppress notification events," "pause background music." Same seven verbs.
- **Selectors generalize to accessibility references.** Today `SelectorChain.primary: string` assumes CSS. For desktop it's "app bundle id + accessibility element path." Probable refactor: `SelectorChain` becomes surface-tagged (`{ surface: "dom" | "a11y", ... }`), or primitives parameterize over a selector type.
- **Interpreter is a second implementation, not a rewrite.** `apps/desktop/modules/rules/interpreter/` consumes the same `RuleSpec` and implements runners against macOS APIs.
- **Condition language needs surface-neutral ops.** `url_path_starts_with` becomes one of many — add `app_focused`, `app_category_active`, `time_in_app_exceeds`, etc. Keep them as distinct `op` values; interpreters evaluate the ones they recognize and return false otherwise.

What we do now to keep this cheap: don't name things "dom_" or "browser_" inside domain types. Keep names shape-level. Where something is irreducibly browser-specific (e.g., `history.pushState` hooks), it lives in the interpreter, not domain.

## Open

- **Popup needs a Rule list view.** The current shields dashboard points at `modules/shields/registry`. Replace with a Rule list that reads from the same registry as `rules.content`. Probably deferred to after first increment verifies.
- **Manifest permissions.** `rules.content` matches `<all_urls>`. The manifest needs matching host permissions. Likely already present from the existing shields; verify during step 6.
- **Rule inspection toggle.** The commitment from `pipeline-flow.md` was transparency by default. For v2, minimum viable transparency = "view Rule spec as JSON" link on each Rule in the popup. Full show-implementation comes with the v3 LLM pipeline.
- **BehavioralMechanism on Rule vs. primitive.** Currently declared on the Rule (`mechanism: "access-block"`). Two primitives in a Rule could theoretically have different mechanisms. Leave at Rule level for v2; revisit if a real case appears.
- **`wxt.config.ts` entrypoint discovery.** WXT auto-discovers `entrypoints/*.content/`. Removing 13 folders and adding one means the content script manifest collapses dramatically. Verify the build reflects this.

## Decision checkpoint

Before starting: confirm branch name `v2-rule-engine`, confirm first Rule is `youtube-shorts-scroll-lock` (not `linkedin-feed-hide`), confirm claude-code-with-skills setup happens inside this repo not a fork.

If all three yes, the next action is the branch + the step-1 domain types commit.

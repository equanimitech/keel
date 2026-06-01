# Validator Budget — What the Moat Actually Costs

The validator is the moat. This doc enumerates every check it must perform, ranks each by feasibility, and identifies what's tractable, what's partial, and what's aspirational.

## Goals

- **Block obvious harm** — coercive interventions, security holes, runaway scripts
- **Surface non-obvious tension** — interventions that don't violate the letter of equanimous principles but probably violate the spirit
- **Stay tractable** — every check must be implementable in finite engineering time
- **Stay honest** — the validator is a strong filter, not a proof

## Non-goals

- **Prove a script is equanimous.** No static analysis can guarantee a piece of code respects a philosophy. The validator filters; the user judges; the patterns layer reports over time.
- **Catch every subtle anti-pattern.** Some require runtime observation, lived experience, or human review. The override path exists precisely because the validator will sometimes be wrong.
- **Replace transparency.** Every committed Rule remains inspectable. The validator does not absolve the user of the option to look.

## The five validators

| # | Validator | Layer | Feasibility | Tooling | Confidence |
|---|---|---|---|---|---|
| 1 | Schema | spec | Easy | JSON Schema / Zod | Near-perfect |
| 2 | AST security | code | Medium | TypeScript Compiler API + custom rules | High |
| 3 | Equanimous-intent | spec | Medium | Declarative ruleset over spec | High |
| 4 | Equanimous-behavior | code | Hard | Pattern matching + forbidden-API list + heuristics | Partial |
| 5 | Conformance (spec ↔ code) | both | Hard | Headless behavioral assertions | Partial |

## 1. Schema validator (spec)

Structural conformance to the primitive contract.

**Catches:**

- Missing required fields (`gate` without URL pattern)
- Wrong types (cooldown duration as string)
- Invalid enum values (action target outside the known DOM operations)
- Reference integrity (template bindings refer to real fields)

**How:** Off-the-shelf. Each primitive contract is a Zod schema. Validation is single-pass.

**False positives:** Near-zero. **False negatives:** Near-zero. **Build cost:** ~1 day per primitive.

## 2. AST security validator (code)

Static analysis on the LLM-generated TS/JS.

**Catches:**

| Check | Severity | Detection |
|---|---|---|
| `eval`, `Function()` constructor | Block | AST node type |
| Dynamic `import()` | Block | AST node type |
| `fetch` / `XMLHttpRequest` to undeclared origins | Block | Call-site analysis + declared-origins manifest |
| Access to `chrome.*` APIs beyond declared scope | Block | Member access analysis |
| `setInterval` / `setTimeout` with delay < 100ms | Warn | Literal argument analysis |
| `while(true)` without break | Block | Control-flow analysis |
| Recursion without termination guard | Warn | Call-graph analysis |
| `document.write` | Block | Member access |
| `innerHTML` with non-literal RHS | Warn | Assignment analysis |
| DOM mutations without cleanup hooks (no removal on unregister) | Warn | Lifecycle analysis |
| Unbounded MutationObserver (no disconnect path) | Warn | Lifecycle analysis |

**How:** TypeScript Compiler API for AST traversal. ~30 custom rules total. Mature pattern (ESLint plugins do this every day).

**False positives:** Low (~5%). **False negatives:** Low for blocked items, medium for warned items. **Build cost:** ~1 week.

## 3. Equanimous-intent validator (spec)

Declarative rules over the spec's structural shape, derived from the 9 (or however many we converge on) equanimous principles.

**Catches:**

| Principle | Check | Example violation |
|---|---|---|
| Modification Rights | `gate` requires `proceed_affordance` | Hard wall with no escape |
| Modification Rights | `cooldown` requires `unlock_path` | Cooldown with no override |
| Attentional Granularity | `observe` requires `data_surfaced_to_user` | Tracking without sharing back |
| Peripheral Presence | `value_remind` `frequency_per_day` ≤ 3 per surface | Wallpaper text |
| Bounded Experiences | All actions require `end_condition` (timer, event, or user-action) | Open-ended interventions |
| Strategic Friction | `gate` cannot use friction type "willpower-only" without `intention_field` or `breath_window` | Dumb walls |
| Fade-by-Design | All Rules must declare a `fade_eligibility` mode (auto, manual, never) | Permanent scaffolding by default |
| Local-First | Spec cannot reference external endpoints unless explicitly declared | Hidden network dependencies |

**How:** A small rule engine over the spec AST. Each rule is a pure function `(spec) → Finding[]`. Adding a principle = adding a function.

**False positives:** Low (~5%). **False negatives:** Low. **Build cost:** ~3 days for the ruleset, ~1 day per new principle.

This validator is **the cheapest, highest-leverage one**. It directly encodes the philosophy. Should be built first.

## 4. Equanimous-behavior validator (code)

The honest hard one. Detects whether the *code* implements refused BCTs/PDPs even when the *spec* doesn't declare them.

**Catches (partial — pattern-based):**

| Anti-pattern | Detection method | Confidence |
|---|---|---|
| Variable-ratio reward (gambling-shape feedback) | `Math.random()` × user-action increment + visible counter | Medium |
| Streak counter | Consecutive-day counter + visual prominence | Medium |
| Social comparison | Render of other-user data adjacent to own metrics | Low |
| Loss aversion trigger | "You'll lose X if you leave now" text patterns + countdown | Medium |
| Notification-bait | `Notification` API calls outside user-initiated actions | High |
| Audio attention-grab | `audio.play()` outside user-initiated handlers | High |
| Reward animation | Confetti / celebration libraries imported | High |
| Engagement-time maximization | Code paths that lengthen session on inactivity | Low |

**How:** Forbidden-API list (high confidence) + AST pattern matching for known shapes (medium confidence) + heuristic flagging for review (low confidence).

**False positives:** Medium-to-high (~15-25%). The "social comparison" detector will flag any rendering of multi-user data, including legitimate uses. **False negatives:** High. Subtle anti-patterns that don't match known shapes will pass.

**Honest framing:** This validator catches ~80% of *obvious* violations and misses subtle ones entirely. The mitigations are:

- Override visibility in the patterns layer ("3 of your Rules carry override flags")
- The transparency toggle (user can read the code)
- The community layer (when Rules are shared, more eyes find what the validator missed)
- A future "report a Rule as coercive" path that feeds back into the heuristic catalog

**This is the moat's actual shape.** Not "we prove your script is equanimous." Rather: "we filter the obvious 80%, surface the rest, and refuse to run anything that fails the security gate."

**Build cost:** ~2 weeks for v1 (forbidden APIs + ~10 patterns), ongoing as the catalog grows.

## 5. Conformance validator (spec ↔ code)

Does the code actually do what the spec promises? Two routes:

**(a) Symbolic.** Derive a spec-shaped representation from the code via static analysis, compare to the declared spec. Hard for non-trivial code. Brittle. Skip for v1.

**(b) Behavioral.** Run the script in a headless browser sandbox, derive a small set of assertions from the spec, observe whether the code satisfies them.

| Assertion type | Example | Tractability |
|---|---|---|
| Trigger fires on declared event | "On `.game-over-modal-container` insertion, code activates" | High |
| Action affects declared targets | "Cooldown class is added to declared selectors" | High |
| User affordance present | "Proceed button is rendered and clickable" | High |
| End condition reachable | "Cooldown UI is removed when timer hits zero" | High |
| No undeclared side effects | "Code does not modify DOM outside declared scope" | Medium |

**How:** Playwright or similar in a sandboxed worker. Spec generates the assertions automatically — you don't write tests, the validator does.

**False positives:** Medium (~10%). **False negatives:** High for "no undeclared side effects" specifically. **Build cost:** ~3 weeks.

This validator proves the code does *at least* what the spec says. It does not prove the code does *only* what the spec says — that's the false-negative gap.

## Build order

If shipping this in stages:

1. **Schema (1)** + **Equanimous-intent (3)** — together, ~1 week. These cover the spec layer fully and encode the philosophy directly. They can ship before any code-level validation exists, with a v0.1 product that has hand-written implementations and LLM-authored specs.

2. **AST security (2)** — ~1 week. Unblocks LLM-authored code at all (without it, you can't accept generated JS safely).

3. **Conformance behavioral (5)** — ~3 weeks. Closes the spec ↔ code gap to "at least."

4. **Equanimous-behavior (4)** — ~2 weeks for v1, then ongoing. Catches the obvious anti-patterns.

Total to a credible v1 validator: ~7-8 weeks of focused engineering. Less if you ship (1)+(3) first as a "specs only" product and add code generation later.

## The honest pitch

> The validator catches 100% of schema violations, 95% of declared-intent violations against equanimous principles, all known security anti-patterns, ~80% of obvious behavioral anti-patterns, and proves the code does *at least* what the spec promises. It cannot prove the code does *only* what the spec promises, and it cannot detect subtle behavioral violations that don't match known shapes. Modification Rights is preserved: any failure can be overridden, and overrides are surfaced in the patterns layer. The user remains the final judge.

That's defensible. It's also the truth.

## Open

- **Heuristic catalog governance.** Who maintains the equanimous-behavior pattern list? You alone? Open contribution? An advisory group? This is governance, not engineering — and it shapes the product's politics.
- **Override telemetry.** When a user overrides, do we record *which validator failed* (anonymous, local, opt-out)? That data would massively accelerate validator improvement, but it's a Local-First tension — even local logs are state the user must control.
- **Sandboxed conformance execution cost.** Running Playwright per commit might be too slow for the conversational experimental loop. If so, conformance moves from blocking-at-commit to async-after-commit (with a "verifying" badge until it completes). Acceptable trade.

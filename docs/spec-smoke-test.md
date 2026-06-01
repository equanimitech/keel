# Spec Smoke Test — linkedin-feed-hide & youtube-shorts

Hand-writing two existing shields as Rule specs to falsify (or confirm) the primitive contracts. linkedin-feed-hide is the simplest. youtube-shorts is the demanding one — it forces `intercept` and `actuate` to coexist.

## Test 1: linkedin-feed-hide

Source: `apps/browser/entrypoints/linkedin-feed-hide.content/index.ts` (95 LOC).

```yaml
rule:
  id: linkedin-feed-hide
  name: Feed Hide
  description: Hides the LinkedIn feed to reduce mindless scrolling
  domain: linkedin.com
  matches: ["*://*.linkedin.com/*"]
  mechanism: cue-removal
  defaultEnabled: true
  fadeEligibility: manual
  persistAcrossSpaNavigation: true   # SPA — re-apply on DOM mutation

primitives:
  - kind: transform
    target:
      primary: '[data-testid="mainFeed"]'
      fallbacks: []
    replacement:
      type: template
      templateId: feed_hidden_placeholder
      bindings: {}
    preserveOriginal: true
    cleanupOnUnregister: true

templates:
  - id: feed_hidden_placeholder
    content: "Feed hidden by Equanimi"
    style:
      padding: "48px 24px"
      textAlign: center
      color: "#666"
      fontSize: "14px"
      border: "1px dashed #d1d5db"
      borderRadius: "8px"
      margin: "16px 0"
```

### Findings from this spec

1. **A Rule has a list of primitives, not one.** Even simple shields use one primitive, but the wrapper has to support multiple. The contracts doc implied this; it should formalize.

2. **Templates are a separate authorable concept.** Referenced by `templateId`, defined alongside primitives. The LLM authors templates the same way it authors primitives. They have content + style.

3. **`persistAcrossSpaNavigation`** belongs at Rule level, not primitive level. It's about the runtime's re-application strategy.

4. **The placeholder text is a `value_remind` opportunity.** "Feed hidden by Equanimi" is utility copy; "Feed hidden — what brought you here?" is equanimous. The validator could surface this.

**Contracts hold for this shield.** Three small additions surfaced (Rule/primitives list, templates as separate concept, SPA persistence).

---

## Test 2: youtube-shorts (scroll lock)

Source: `apps/browser/entrypoints/youtube-shorts.content/index.ts` (142 LOC) + `style.css` (CSS-side cue removal).

```yaml
rule:
  id: youtube-shorts-scroll-lock
  name: Shorts Scroll Lock
  description: Blocks compulsive scrolling on YouTube Shorts
  domain: youtube.com
  matches: ["*://*.youtube.com/*"]
  mechanism: access-block
  defaultEnabled: true
  fadeEligibility: manual
  persistAcrossSpaNavigation: true

# Conditional scope — these primitives only act when the URL is /shorts
when:
  type: url_path_starts_with
  path: "/shorts"

primitives:
  # 1. CSS-side cue removal (kills scroll-snap, overflow, nav buttons)
  - kind: transform
    target:
      primary: "html"
      fallbacks: []
    replacement:
      type: restyle           # NEW REPLACEMENT TYPE — CSS rules, not DOM mutation
      rules:
        - selector: "#shorts-inner-container"
          properties: { scrollSnapType: none, overflowY: hidden }
        - selector: "ytd-shorts [aria-label='Next video'], ytd-shorts [aria-label='Previous video']"
          properties: { display: none }
      scope: "rule_class"     # runtime adds/removes equanimi-X-active class on <html>
    preserveOriginal: true
    cleanupOnUnregister: true

  # 2. Suppress wheel + touch events on the scroll container
  - kind: intercept
    target:
      primary: "#shorts-inner-container"
      fallbacks: []
    events: [wheel, touchmove]
    behavior:
      type: suppress

  # 3. Suppress specific keys, but only on /shorts page
  - kind: intercept
    target:
      primary: "body"
      fallbacks: []
    events: [keydown]
    whenKey: [ArrowUp, ArrowDown, PageUp, PageDown, " ", j, k]
    behavior:
      type: suppress

  # 4. Lock scroll position — actuate scrollTop reset on every scroll event
  - kind: actuate
    target:
      primary: "#shorts-inner-container"
      fallbacks: []
    trigger:
      type: dom_event
      event: scroll
    action:
      type: scroll_to
      position: { source: snapshot_at_activation, property: scrollTop }
    repeat: while_condition_holds
```

### Findings from this spec

1. **`transform` needs a `restyle` replacement type.** The shorts shield does CSS-side cue removal (kills nav buttons, scroll-snap, overflow). Pure DOM transformation can't express "scope these CSS rules under a class that I toggle." Add `replacement: { type: "restyle"; rules: CssRule[]; scope: "rule_class" | "global" }` to the contract.

2. **`intercept` needs a `whenKey` filter.** Keyboard interception doesn't suppress all keys, just specific ones. Add `whenKey?: string[]` to InterceptSpec.

3. **`intercept` and `actuate` compose.** The shorts shield uses both: intercept wheel/touch/key (block input), actuate scroll-reset (force position). This confirms both primitives are needed and must coexist in one Rule.

4. **`actuate` needs a snapshot-at-activation source.** "Scroll back to where it was when the lock turned on" requires the runtime to snapshot a value at activation time. Add `source: snapshot_at_activation` to ActuateSpec value bindings.

5. **Rule-level conditional `when`.** The shorts shield only acts on `/shorts` paths, even though it loads on all of `youtube.com`. The `when` clause at Rule level scopes ALL primitives. Without this, the LLM would have to repeat URL conditions on every primitive.

6. **Repeat semantics on `actuate`.** `repeat: while_condition_holds` means "keep re-applying while activation conditions are true." This is implicit in the existing scroll-reset code (it's an event listener that always fires). The contract makes it explicit.

7. **The CSS-class scope trick is generalizable.** The pattern `<html>.equanimi-X-active { rules }` should be the runtime's automatic implementation of `restyle` with `scope: rule_class`. The LLM declares the rules; runtime handles the class toggling.

**Contracts hold for this shield**, with the additions above. The `intercept` and `actuate` primitives proposed in the audit doc work as designed — they compose cleanly with `transform`.

---

## Aggregate findings

### Confirmed
- 7 foundational primitives is the right floor (no 8th surfaced)
- `intercept` and `actuate` are real categories, not parameters on existing primitives
- Composition within a Rule works as expected (multiple primitives on same target)

### New additions to formalize in `primitive-contracts.md`
| # | Addition | Where |
|---|---|---|
| 1 | A Rule is a wrapper containing `primitives: PrimitiveSpec[]` + `templates: Template[]` + Rule-level metadata | Rule schema |
| 2 | `templates` are a separate authorable concept, referenced by primitives via `templateId` | Template type |
| 3 | `transform.replacement` adds `restyle` type with CSS rules and scope option | `transform` contract |
| 4 | `intercept` adds `whenKey?: string[]` filter | `intercept` contract |
| 5 | `actuate` adds `snapshot_at_activation` value source | `actuate` contract |
| 6 | Rule-level `when: ConditionExpr` scopes all primitives | Rule schema |
| 7 | `persistAcrossSpaNavigation: boolean` (default true) at Rule level | Rule schema |
| 8 | `actuate.repeat: "once" | "while_condition_holds"` | `actuate` contract |

### What the audit didn't catch
The original audit identified 5 gaps (intercept, actuate, cross-Rule, reactive bindings, manual triggers). Writing the specs surfaced **3 more**: restyle replacement type, conditional whenKey/when, snapshot value source. Worth noting: every time we contact real artifacts, more surfaces.

### Architectural integrity
The contracts survive the smoke test. The 7-primitive set + composition model expresses both shields without forcing escape hatches into raw JS. The 8 additions above are refinements within the existing architecture, not redesigns.

**Verdict: proceed to (a) — update `primitive-contracts.md`.**

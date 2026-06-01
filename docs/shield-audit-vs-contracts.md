# Shield Audit vs. Primitive Contracts

Mapping every existing shield, cooldown, and signal to the 5 foundational primitives proposed in `primitive-contracts.md`. The point: find what doesn't fit.

## The inventory

| # | Module | Type | Maps to |
|---|---|---|---|
| 1 | youtube-shorts (scroll lock) | shield | **GAP — event interception** |
| 2 | youtube-shorts-homepage | shield | `transform/conceal` ✓ |
| 3 | youtube-sidebar-recs | shield | `transform/conceal` ✓ |
| 4 | youtube-comments-hide | shield | `transform/conceal` ✓ |
| 5 | youtube-sponsored | shield | `transform/conceal` ✓ |
| 6 | linkedin-feed-hide | shield | `transform/substitute` ✓ |
| 7 | linkedin-notification-badge | shield | `transform/conceal` ✓ |
| 8 | linkedin-promoted-posts | shield | `transform/conceal` ✓ |
| 9 | chess-post-game-cooldown | shield | `cooldown` ✓ |
| 10 | linkedin-cooldown | mode | `cooldown` (manual trigger) — **partial gap** |
| 11 | youtube-cooldown | mode | `cooldown` + **GAP — media control** |
| 12 | youtube-watch-time | signal | `observe` + `transform/substitute` (UI counter) — **partial gap on reactive bindings** |
| 13 | youtube-stain | signal | `transform` + **GAP — cross-Rule data dependency** + reactive bindings |

**Five real gaps.** The architecture as-written covers ~60% of existing surface area cleanly. The rest needs additions.

## Gap A: Event interception

**Shield affected:** `youtube-shorts` scroll-lock.

The Shorts scroll-lock doesn't change DOM. It intercepts wheel, touch, and keyboard events on the Shorts container to prevent the compulsive vertical scroll. The DOM looks the same; the *behavior* of the page is rewritten.

`transform`, `gate`, `cooldown`, `observe`, and `schedule` cannot express this. None of them touch event handlers.

**Resolution:** Add a 6th foundational primitive — `intercept`.

```ts
interface InterceptSpec {
  readonly kind: "intercept";
  readonly target: SelectorChain;
  readonly events: ReadonlyArray<"wheel" | "touch" | "keyboard" | "click" | "scroll">;
  readonly behavior:
    | { readonly type: "suppress" }                                 // preventDefault
    | { readonly type: "redirect"; readonly toAction: ProceedAction } // event triggers different action
    | { readonly type: "rate_limit"; readonly minIntervalMs: number };
}
```

**Equanimous constraints:**
- `suppress` requires a visible affordance somewhere on the page explaining the suppression (Attentional Granularity — user must know why scroll doesn't work)
- `rate_limit` minIntervalMs > 1000 triggers warning (heavy-handed)

This is a category, not a parameter. Real architectural addition.

## Gap B: Media control

**Module affected:** `youtube-cooldown`.

The YouTube cooldown actively pauses video playback. Not DOM mutation. Not event interception (the user didn't initiate playback during cooldown — the page autoplays). It's a *side effect on a media element*: `video.pause()`, `video.muted = true`, etc.

Two paths:

- **(B1) Add a 7th primitive: `actuate`.** Perform an action on an interactive/media element. Pause, play, mute, blur, focus, scroll-to.
- **(B2) Embed media-control as a side-effect option on `cooldown` and `gate`.** They already have a "surface" — let the surface declaratively name "while active, also pause any `<video>` in scope."

**My recommendation: (B1).** Treating media control as a primitive keeps the surface field for visual content. Mixing them couples `cooldown` to media specifics it shouldn't know about. `actuate` is also useful outside cooldown — e.g., on session-end, blur the active text field.

```ts
interface ActuateSpec {
  readonly kind: "actuate";
  readonly target: SelectorChain;
  readonly action:
    | { readonly type: "pause_media" }
    | { readonly type: "mute_media" }
    | { readonly type: "blur" }
    | { readonly type: "scroll_to" };
  readonly trigger: ActuateTrigger;
  readonly repeat: "once" | "while_condition_holds"; // youtube-cooldown re-pauses if user hits play
}
```

## Gap C: Cross-Rule data dependency

**Module affected:** `youtube-stain` reads `youtube-watch-time`'s persisted data.

Without this, the stain Rule has to duplicate the watch-time observation, which violates DRY and creates two divergent counters. The contracts doc had this as a "v2 open question." The audit shows it's needed at v1 — at minimum for the stain.

**Resolution:** Promote cross-Rule data references from v2 to v1. Add a `dataSource` reference type:

```ts
type DataReference =
  | { readonly source: "self_storage"; readonly key: string }
  | { readonly source: "rule_storage"; readonly ruleId: string; readonly key: string };
```

The validator checks that referenced Rules exist and that the consuming Rule has been authorized to read the producer's data (probably an explicit "depends on" field that requires user acknowledgment when the Rule is committed).

## Gap D: Reactive bindings

**Modules affected:** `youtube-stain` (blob size/alpha/position from watch seconds via asymptotic curve), `youtube-watch-time` (counter font/weight intensity curve).

The current `TemplateBindings` type I sketched is too thin — it just maps strings to refs. It can't express:
- A value derived via a curve (`asymptote(seconds, min: 5min, max: 60min)`)
- A binding that re-renders continuously as the source value changes
- Conditional thresholds (`if seconds > 5min then visible`)

**Resolution:** Extend `TemplateBindings` with a small reactive-expression language.

```ts
type ReactiveBinding =
  | { readonly type: "literal"; readonly value: string | number }
  | { readonly type: "ref"; readonly source: DataReference }
  | { readonly type: "curve"; readonly source: DataReference; readonly shape: "asymptote" | "linear" | "step"; readonly params: CurveParams }
  | { readonly type: "lerp"; readonly source: DataReference; readonly min: number; readonly max: number; readonly progress: ReactiveBinding }
  | { readonly type: "conditional"; readonly when: ConditionExpr; readonly then: ReactiveBinding; readonly else: ReactiveBinding };
```

This is small but real — without it the stain can't be expressed declaratively.

## Gap E: Manual triggers

**Modules affected:** `linkedin-cooldown`, `youtube-cooldown` (popup-triggered), `chess-post-game-cooldown` FAB (in-page manual).

The cooldown contract has `trigger: CooldownTrigger` but I didn't enumerate the trigger kinds. Manual triggers are common — and they're the user-sovereign path (Modification Rights in action: the user starts the cooldown deliberately).

**Resolution:** Trigger types must include `manual` with declared affordances:

```ts
type CooldownTrigger =
  | { readonly type: "event"; readonly when: ConditionExpr }
  | { readonly type: "manual"; readonly affordances: ReadonlyArray<{
      readonly location: "popup" | "in_page_fab";
      readonly options: ReadonlyArray<{ readonly label: string; readonly seconds: number }>;
    }> };
```

## Revised primitive count

| Foundational | Why |
|---|---|
| `transform` | DOM region modification |
| `gate` | Navigation/action interruption |
| `cooldown` | Temporal lockout |
| `observe` | Behavioral signal recording |
| `schedule` | Temporal binding wrapper |
| **`intercept`** | Event behavior modification — **new from gap A** |
| **`actuate`** | Side effect on interactive/media element — **new from gap B** |

**7 foundational primitives**, not 5. The original answer was undercounted because it was derived from the chess shield alone — chess uses 1 of these. The full shield surface uses 6 of 7 (no `schedule` yet because no scheduled shields exist; `youtube-watch-time` daily reset is implicit, not declared).

## Other audit findings worth noting

**LinkedIn-feed-hide is `substitute`, not `conceal`.** It hides the feed AND inserts a placeholder ("Feed hidden by Equanimi"). Pure conceal would leave a void. The placeholder is interesting — it's a small `value_remind` opportunity ("Feed hidden — remember why").

**The signals/shields/budgets distinction in the codebase is meaningful.** The current code separates:
- *Shields* (subtractive — remove cues)
- *Signals* (additive — surface hidden information)  
- *Budgets* (referenced in shared domain)

The primitive contracts collapse all three into one Rule schema. That's probably right architecturally — but the user-facing distinction (subtract / add / budget) might still matter as a *categorization* in the patterns dashboard, even if the underlying primitives are unified.

**Existing shields don't declare equanimous metadata.** None of them have `unlockPath`, `proceedAffordance`, `fadeEligibility`, etc. Migration to the new contract format will surface gaps in the existing shields' equanimous design — exactly the validator-as-moat working on real artifacts.

## Recommendation

1. **Update `primitive-contracts.md`** to reflect 7 foundational primitives + the resolutions for cross-Rule data and reactive bindings.
2. **Promote cross-Rule data references** from v2 open question to v1 contract feature.
3. **Migrate one shield as proof.** `linkedin-feed-hide` is the simplest. `youtube-shorts` is the most demanding because it forces `intercept`. Do both — if the simplest fits and the hardest fits, the architecture survives. If `youtube-shorts` doesn't fit `intercept` cleanly, we have more work.
4. **Don't migrate `youtube-stain` yet** — it pulls in cross-Rule references AND reactive bindings. Save it as the v1 acceptance test.

Want me to update `primitive-contracts.md` with the 7-primitive revision, or hand-write the `linkedin-feed-hide` Rule spec first as a smoke test?

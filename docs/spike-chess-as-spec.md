# Spike: Can the Chess Cooldown Shield Be Expressed as a Spec?

Falsification exercise for path (A) — generated spec + generic interpreter — before scaffolding `equanimi-studio`.

Source: `apps/browser/entrypoints/chess-post-game-cooldown.content/index.ts` (752 lines, hand-coded).

## What the shield actually does (functional decomposition)

1. Match `*.chess.com` pages
2. Detect game-over via DOM mutation watching for `.game-over-modal-container` or `.board-modal-container-container`
3. Classify outcome (win/loss/draw/abort) using header text + chat messages + own username
4. Compute cooldown duration: base seconds × 2 if loss (when `escalateOnLoss` is on)
5. Persist end-timestamp to `chrome.storage` keyed by domain
6. Disable a broad set of "play / new game / rematch" buttons (selectors + text patterns + tab-aware injection)
7. Insert cooldown bar UI under specific anchor points (`.game-over-buttons-component`, `.new-game-buttons-component .new-game-buttons-buttons`)
8. Apply puzzle-board overlay if URL matches `/puzzles?|daily|play|live`
9. Watch for SPA navigation, re-apply overlay on path change
10. Watch for "New Game" tab click, intercept and disable freshly-rendered buttons (with 300ms delay)
11. Resume persisted cooldown on page load (timestamp survival)
12. Floating action button (FAB) for manual cooldown trigger with duration menu
13. Tick countdown every 1s, update all bars + overlay + FAB
14. On expiry: clear UI, clear storage, re-enable buttons

## Spec attempt

```yaml
shield:
  id: chess-post-game-cooldown
  contract: cooldown                # which primitive contract this implements
  match: ["*://*.chess.com/*"]
  storage_namespace: "chess.com"

triggers:
  - id: game_ended
    type: dom_mutation
    watch: { childList: true, subtree: true, target: body }
    detect:
      any_of:
        - selector_appears: ".game-over-modal-container"
        - selector_appears: ".board-modal-container-container"
    debounce_ms: 300

  - id: new_game_tab_clicked
    type: dom_event
    selector: '[data-tab="newGame"]'
    event: click
    delay_ms: 300        # let chess.com render the tab

  - id: spa_navigation
    type: location_change
    matches: "/puzzles?|/daily|/play|/live"

  - id: page_load
    type: lifecycle
    when: document_idle

actions:
  - on: page_load
    do: resume_cooldown_if_active
    inputs:
      storage_key: "{{ storage_namespace }}/cooldown_until"

  - on: game_ended
    do: start_cooldown
    inputs:
      base_seconds: { ref: settings.cooldown_seconds, default: 30 }
      escalate_on:
        condition: outcome_is_loss
        multiplier: 2
        when_setting: settings.escalate_on_loss
      storage_key: "{{ storage_namespace }}/cooldown_until"

  - on: cooldown_active
    do: disable_targets
    targets:
      selectors:
        - '[data-cy="game-over-modal-new-game-button"]'
        - '[data-cy="game-over-modal-rematch-button"]'
        - '[data-cy="play-button"]'
        # ... ~14 more
      text_patterns:
        - '/^(play|play online|new game|start|rematch)$/i'
      scoped_to:
        - 'button'
        - 'a[role="button"]'
    apply_class: equanimi-btn-disabled

  - on: cooldown_active
    do: insert_overlay
    template: cooldown_bar
    anchors:
      - '.game-over-buttons-component'
      - '.new-game-buttons-component .new-game-buttons-buttons'
    contents:
      label: { conditional: outcome_is_loss, true: "Tilt protection.", false: "Take a breath." }
      timer: { binding: cooldown.remaining_seconds, format: mm_ss }
      action_button: { label: "Stop playing", do: navigate, to: "https://www.chess.com/home" }

  - on: cooldown_active
    when: location_matches "/puzzles?|/daily|/play|/live"
    do: insert_overlay
    template: full_board_overlay
    target: { first_of: ["#board-layout-main", ".board-layout-component", ".puzzle-board-component", "wc-chess-board"] }
    contents:
      label: "Take a break."
      timer: { binding: cooldown.remaining_seconds, format: mm_ss }
      action_button: { label: "Stop playing", do: navigate, to: "https://www.chess.com/home" }

  - on: cooldown_expired
    do: revert_all
```

## What fits cleanly

- URL matching, selector lists, DOM-mutation triggers, action buttons, anchored overlays, templates, persisted timer, lifecycle hooks (`document_idle`, `cooldown_expired`)
- Conditional template content (`outcome_is_loss ? "Tilt protection" : "Take a breath"`)
- Settings parameterization (`cooldown_seconds`, `escalate_on_loss`)
- The **structural 80%** of the shield

## What doesn't fit cleanly

Three escape hatches needed, in increasing order of pain:

### 1. Outcome classification (`outcome_is_loss`)

Multi-source logic: header text patterns + chat message patterns + own-username comparison. Not expressible as a single selector or text match. Options:

- **(a) Named-behavior interpreter primitive.** The interpreter ships with `classifyChessOutcome` as a known behavior. Trades flexibility for power — adding a new game site needs interpreter changes.
- **(b) Mini expression DSL.** Spec contains a JSON-Logic-style expression: `{ "any": [{ "regex": [{ "selector_text": ".header-title-component" }, "you lost"] }, { "and": [{ "exists": ".game-over-message-component" }, { "not_equal": ["winner_name", "current_username"] }] }] }`. Powerful, ugly, learnable.
- **(c) Sandboxed JS expression.** Spec contains a snippet of pure JS evaluated in a worker. Most flexible, reintroduces the V3 problem unless the sandbox is air-tight.

### 2. Username detection with fallback chain

`detectUsername()` tries DOM selector → `window.context` → … This is a *strategy chain*. Spec needs to express ordered fallbacks. Manageable with a `first_successful: [...]` construct, but it's another DSL feature.

### 3. FAB (Floating Action Button)

A whole secondary UI surface with its own dropdown, state, and event handlers. Could be:

- **(a)** A second "shield" entry (FAB is a separate intervention that triggers `start_cooldown` manually). Cleaner conceptually.
- **(b)** A `companion_ui` block in the same spec. More overhead in the language.

## Honest verdict

**Path (A) is real but the interpreter must be ~30% smarter than a naive trigger→action engine.** Specifically it needs:

1. A **mini condition expression language** (option 1b above) — without it, every site's outcome-classification needs an interpreter code change, defeating the point.
2. **Named overlay templates** with binding and conditional content
3. **Ordered fallback chains** for property extraction
4. **Composition of multiple shields** (FAB as separate spec) — easier than embedding a UI subsystem

If you accept those four interpreter capabilities, the chess shield spec fits in ~120 lines of YAML/JSON. The hand-coded shield is 752 lines of TS.

**Compression ratio: ~6×.** That's enough to justify the spec layer.

## What this spike does NOT prove

- That the **validator** can analyze a spec for equanimous-constraint violations (next spike)
- That an **LLM can reliably produce** specs of this structure (next-next spike — needs few-shot examples)
- That **edge cases** (chess.com redesigns, A/B variants of selectors, race conditions on SPA nav) survive without per-site debugging — this is where the hand-coded shield earns its line count

## Recommendation

Proceed with `equanimi-studio` scaffold under path (A), with the explicit constraint that the interpreter ships with the four capabilities above. If, building the interpreter, any single capability balloons past ~500 LOC, that's a signal we're reinventing JS and should pivot to (C) — per-user build pipeline.

Next move (one of):
- (i) Write the YAML spec for the simpler `linkedin-feed-hide` shield (95 LOC source) as a control case — should fit in ~20 lines
- (ii) Sketch the interpreter's four-capability surface as TS interfaces, verify mental model
- (iii) Scaffold `equanimi-studio` packages and stub the validator

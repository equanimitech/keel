# Friction authoring skill — design

**Date:** 2026-08-08
**Surface:** authoring (Claude Code, against `$KAIROS_HOME/keel/rules/`)
**Status:** design. Draft skill at `friction-authoring-SKILL-draft.md`; not installed.
**Lineage:** `packages/domain/src/rules.ts` (the contract), `docs/primitive-contracts.md`
(what it was ported from), `docs/references/attention-research-basis.md` (the evidence
base), `2026-06-01-strategic-friction-design.md` (the friction dial and skip credits),
`apps/browser/modules/sensors/adapters.ts` (the precedent for site knowledge as dated,
verified data).

---

## Why this exists

On 2026-08-08 three consecutive versions of a YouTube Shorts rule were authored from
memory. Every selector in v1 and v2 matched zero elements — `ytd-reel-shelf-renderer`,
`ytd-rich-shelf-renderer[is-shorts]`, `a[title="Shorts"]` are dead names. The plumbing
was flawless: the host projected the transform, the relay carried it, the content script
injected a stylesheet at `document_start`, and that stylesheet faithfully selected
nothing.

That is the worst failure mode this system has. A rule that crashes is visible. A rule
that silently matches nothing looks exactly like a rule that works, and the board says
you are protected while you are not. It was fixed only by driving a real browser,
reading the live DOM, injecting the candidate CSS, and re-counting.

**So: selector verification against a live DOM is a gate, not a nicety.** Everything
below exists to make that gate unavoidable and to give the author something to think
with before they reach it.

### And the fix was itself wrong

Verifying this design against `youtube.com/results?search_query=lofi` on 2026-08-08 —
the same surface the v3 rule was verified on — found that the shipped, "verified" rule
destroys the page it was meant to declutter. Per-selector bisection:

| Selector | matches | Shorts links hidden | **Regular `/watch` links lost** |
|---|---:|---:|---:|
| `ytm-shorts-lockup-view-model` | 160 | 140 | 0 |
| `grid-shelf-view-model:has(a[href^="/shorts"])` | 22 | 140 | 0 |
| **`ytd-item-section-renderer:has(grid-shelf-view-model a[href^="/shorts"])`** | 11 | 140 | **442 of 482** |
| `ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])` | 1 | 1 | 0 |
| the five `ytd-*` legacy fallbacks | 0 | 0 | 0 |
| `ytm-shorts-lockup-view-model-v2` | 160 | 140 | 0 |

`ytd-item-section-renderer` is the *whole results section*. One Shorts shelf inside it
takes 92% of the search results with it, and it is entirely redundant — the
`grid-shelf-view-model` selector one row above already hides all 140 Shorts links with
zero collateral. Prune it.

The v3 verification counted one number: Shorts links, 31 → 0. That number was correct
and the rule was still broken. **The loop needs two counts — the target and the
control** — and that is the single most load-bearing procedural change this design
makes. (Not applied here; this document does not modify rules.)

---

## Part I — Taxonomy of web surfaces, by mechanism

Named by what produces the pull, never by who ships it. Domains are user data; this
table is code-adjacent knowledge, so it must be brand-free — the same rule
`modules/sensors/senses/` obeys, for the same reason.

The dark-patterns literature is the inverse catalogue. Gray et al. (2018) name the
designer's *strategies*; Mathur et al. (2019) count them at scale in commerce; Brignull
names them in the vernacular. Nearly every row below is one of theirs, read backwards:
where they document a mechanism that manufactures continuation, the friction is
whatever restores the interruption it removed.

| # | Category | The pull, mechanically | What structurally removes it |
|---|---|---|---|
| 1 | **Infinite feed** | No terminal cue. The container regenerates before you reach its end, so the decision "stop" never has a moment to occur in. Each item is a draw on a variable-ratio schedule. | Restore an end: remove the feed container entirely, or cap its height, or paginate. |
| 2 | **Autoplay / queue continuation** | Continuation is the *default*; stopping is the act. Preselection bias, applied to time. | Make continuation require an act: remove the next-item rail, remove the countdown, pause at boundary. |
| 3 | **Short-form vertical video** | (1) + (2) compounded, plus a swipe gesture cheap enough that the cost of "one more" is below the threshold of deliberation. | Remove the entry points. The surface itself is unsalvageable — every affordance inside it is the mechanism. |
| 4 | **One-more-round loop** | A bounded activity whose restart affordance is rendered at the exact coordinates the eye lands on at the end, while the affect of the last round is still live. | Remove the restart affordance so restarting requires navigating back. Or interpose a beat between rounds. |
| 5 | **Variable-reward inbox** | Intermittent reinforcement with a user-operated lever (refresh/pull-down). The reward schedule is the point. | Batch: make the surface exist only inside a window. Remove the refresh cue and the auto-poll. |
| 6 | **Badge / unread counter** | A number that constitutes an open loop. Zeigarnik: unresolved counts hold working memory whether or not you look. | Remove the number. Cheapest high-value transform in the whole taxonomy. |
| 7 | **Streak / obligation mechanic** | Loss aversion over an accumulated asset you did not ask to hold. The pull is not the reward; it is the prospective loss. | Remove the counter. **Caveat below** — removing the display does not remove the obligation. |
| 8 | **Social-validation metric** | Counts on *your own* output. Turns publishing into a slot machine with a refresh lever. | Remove the counters (the Demetricator pattern). Fully expressible today. |
| 9 | **Recommendation rail / rabbit hole** | Each page seeds three more, chosen to maximise the probability of a fourth. The pull is curiosity, harvested. | Remove the rail; keep search. Converts a wander into a lookup — the single highest-yield transform on a research-useful site. |
| 10 | **Marketplace browse** | Recommendation grid plus manufactured scarcity and urgency ("2 left", countdowns) — Mathur's most-counted categories, verbatim. | Remove the recommendation carousels; strip the urgency badges (they are the deception, so removing them restores truth as well as calm). |
| 11 | **Synchronous presence** | Typing indicators, read receipts, online dots. Manufactured obligation to answer *now*. | Remove presence indicators. Window the surface. |
| 12 | **Doomscroll news** | (1) plus negativity bias plus recency framing. The affect is the retention mechanism. | (1)'s removals, plus degrade: grayscale and thumbnail suppression strip most of the affect while leaving the text. |
| 13 | **Comment thread** | Variable social reward plus reactance. Reply is a lever with an unpredictable payoff. | Remove the thread. |
| 14 | **Live event** | A running clock you are outside of. Genuine FOMO — the scarcity is real, not manufactured. | Little. The pull is external to the page; a rule can only meter it. Honest answer: this is a scheduling problem, not a DOM problem. |

Three notes the table cannot carry:

**Category 7 backfires most.** Hiding a streak counter removes the reminder, not the
obligation, and can *raise* anxiety ("did I lose it?"). The honest intervention for a
streak mechanic is usually to leave the product, which keel cannot and should not
author. Say so rather than shipping a transform that trades a visible pull for an
invisible one.

**Category 14 is the boundary of the instrument.** Naming a category keel cannot help
with is more useful than pretending the DOM is where the problem lives.

**Categories 1, 2, 3, 5 share a single deficiency: no stopping cue.** That is what
`gate.trigger.dwell` exists for, and it is why that trigger was added to a contract
whose other triggers are all event-shaped. Overconsumption has no event to hang on; the
whole problem is that nothing happens.

---

## Part II — Friction mechanisms

The actuator vocabulary, ordered roughly by ascending cost to the person. Each row:
what it does, when it backfires, which primitive expresses it, and whether that
primitive is interpreted **today**.

| Mechanism | Psychologically | Backfires when | Primitive | Status |
|---|---|---|---|---|
| **Remove** | The cue never reaches awareness, so no willpower is spent resisting it. The cheapest possible intervention and the only one with no ongoing cost. | The removed element is load-bearing for a legitimate use, or removal is broad enough to break the site (see the Shorts collateral above). Total removal also invites reactance — the person routes around the tool. | `transform{hide}` | **wired** |
| **Degrade** | Lowers the reward-prediction signal without touching access. Grayscale kills thumbnail pull; stripping motion kills peripheral capture. | The site starts to feel dead. That is the near-enemy: indifference is not equanimity, and a surface you avoid because it is unpleasant is not a surface you are free about. | `transform{restyle}` | **wired** |
| **Interpose** | An intention prompt recruits meta-awareness — the strongest-evidence lever in the repo's own reference table (d/g ≈ 0.29–0.69). | Habituation. A prompt seen twenty times a day becomes a swat, and the contract already flags a bare `confirmation` as dumb friction that trains dismissal. | `gate{intention}` | **wired**, dwell trigger only |
| **Delay** | Inserts a gap between impulse and action. The gap is where noticing can happen; nothing else has to. | Over ~30s it stops being a beat and becomes a punishment — the validator warns at exactly that threshold. Repeated delays on a task-critical path are a documented workaround-generator. | `gate{delay}` | typed, **silently coerced** (see Part IV) |
| **Meter / reveal cost** | Self-monitoring (BCT 2.3). Makes an invisible accumulation visible at the moment of decision. | Rendered as a score it becomes gamification, which re-couples to the reward it was meant to reveal. And "don't dashboard the user with their own data" is already the repo's stance — working memory is ~7±2. | `observe` + a template binding | typed, not wired. Partially delivered: the gate overlay already prints *"N minutes here today"*. |
| **Reroute** | Behaviour substitution (BCT 8.2). Offers the alternative at the moment of wanting, when generating one is hardest. | The substitute is not actually wanted. Then it reads as the tool having an opinion about your life, which is where reactance starts. | `gate.proceedAffordance.action{redirect}` | typed, **not projected** |
| **Window** | A Ulysses pact against a self you can predict. Batching an inbox is the canonical case and the evidence is good. | Rigidity. The contract warns above 16h/day for a reason; a window that covers most of the day is scaffolding pretending to be a boundary. | `schedule` | typed, not wired |
| **Suppress** | Kills the gesture itself — swipe, scroll, key. The only mechanism that can reach a surface whose every affordance is the mechanism. | Immediately. A page that does not respond is indistinguishable from a broken page, which is why the contract *requires* a visible affordance explaining the suppression. | `intercept` | typed, not wired |
| **Act on the page** | Pause, mute, scroll back. Directly undoes the continuation the page performed. | Interrupting engagement the person actually chose. The contract flags `pause_media` on freshly-started media. | `actuate` | typed, not wired. Partially delivered: `gate/overlay.ts` pauses media unconditionally when it opens. |
| **Ration** | A finite, non-renewable allowance. Scarcity is the one friction an impulse cannot fake — unlike a "type a reason" prompt, a credit simply runs out. | It is a quota, and hard time limits are on the repo's documented-failure list. Also: rationing a surface you genuinely need is how a tool loses its user. | **none** | gap — see Part V |
| **Require-before-access** | Contingency (Premack). Access is downstream of another act. | The earning act is forgeable (self-minted currency), or the contingency corrupts it — see the overjustification argument in Part V. | **none** | gap — see Part V |
| **Lock** | A temporal boundary you set for yourself. Self-invoked restriction is BCT 1.9 Commitment (MoA `values`), a different mechanism from imposed restriction and with a different evidence base. | Imposed rather than chosen. Mark (2018) found blocking *raised* workload for high-work-control users, and the principal is one — which is exactly why the invariant exists. | `cooldown` | **wired** (browser enforcement only) |

Refused, explicitly: **shame**, **punitive framing** (6–10% adoption; users reject it),
**escalating multipliers** without `allowEscalation` (punishment-shaped), **any wall**
(§On walls — every notch keel owns is escapable, and genuine walls are external
actuators keel surfaces rather than builds).

---

## Part III — The cross-product

Category × mechanism. `✔` = expressible and interpreted today. `○` = the contract can
say it, nothing executes it. `—` = no primitive says it. **Bold** marks the recommended
first move for that category.

| Category | Remove | Degrade | Interpose | Delay | Window | Suppress | Lock | Ration |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 1 Infinite feed | **✔** | ✔ | ✔ (dwell) | ○ | ○ | ○ | ✔ | — |
| 2 Autoplay queue | **✔** | ✔ | ○ (needs `navigation`) | ○ | ○ | ○ | ✔ | — |
| 3 Short-form video | **✔** (entry points) | ✔ | ○ (needs `element_click`) | ○ | ○ | ○ | ✔ | — |
| 4 One-more-round | ✔ | — | **○** (needs `element_click`) | ○ | ○ | ○ | ✔ (self-armed) | — |
| 5 Variable-reward inbox | ✔ (refresh cue) | ✔ | ✔ (dwell) | ○ | **○** | ○ | ✔ | — |
| 6 Badge counter | **✔** | ✔ | — | — | ○ | — | — | — |
| 7 Streak | **✔** (with the caveat) | ✔ | — | — | — | — | — | — |
| 8 Validation metric | **✔** | ✔ | — | — | ○ | — | — | — |
| 9 Recommendation rail | **✔** | ✔ | ○ | ○ | ○ | — | ✔ | — |
| 10 Marketplace | **✔** (carousels, urgency badges) | ✔ | ○ (checkout `element_click`) | ○ | ○ | — | ✔ | — |
| 11 Synchronous presence | **✔** | ✔ | — | — | **○** | — | ✔ | — |
| 12 Doomscroll news | ✔ | **✔** (grayscale) | ✔ (dwell) | ○ | ○ | ○ | ✔ | — |
| 13 Comment thread | **✔** | ✔ | ○ | ○ | ○ | — | ✔ | — |
| 14 Live event | — | — | ✔ (dwell) | ○ | ○ | — | ✔ | — |

**What the matrix says.** The `✔` column is almost entirely **Remove**, plus **Degrade**
and one trigger of **Interpose**. That is not a poverty: removal is the cheapest
intervention per unit of effect and the one with no ongoing willpower cost, so a runtime
that only removes covers most of the taxonomy's *first* move well. What it cannot do is
the *second* move — the one you reach for when removal is too blunt because the surface
is load-bearing. Every `○` in the Interpose and Window columns is a case where the
honest answer today is "hide the whole thing or nothing", and hiding the whole thing is
how a tool gets uninstalled.

The densest cluster of `○` is at **(4, Interpose)**, **(5, Window)**, **(11, Window)**,
and **(2/3/10, Interpose via `element_click`)**. Those four cells are Part IV's ranking.

---

## Part IV — Gap analysis

### What is actually interpreted, verified against the code

| Primitive | Reality |
|---|---|
| `transform` | Wired. One injected stylesheet at `document_start` (`transform/apply.ts`), primary **and** all fallbacks emitted together, comma-joined, `display: none !important` or the `restyle` property map. `replace` degrades to `hide` host-side — no template registry exists. Reversible in one node removal; re-renders on policy flush via `pageTransforms.watch`. |
| `gate` | Wired for `trigger.type === "dwell"` only. `loadDwellGates` projects `{ruleId, domains, everyMinutes, prompt}`. Dwell is computed from the local event log through the shared `bouts()` derivation, day-scoped on the same local-midnight boundary the read side uses. The overlay renders in a closed shadow root, pauses media, focuses the abort button, and has no dismiss path. |
| `cooldown` | Wired: standing (DNR blocklist) and armable (timed, arm-forward-only, no disarm). `enforcement.at` other than `browser` is filtered out at projection. |
| `observe`, `schedule`, `intercept`, `actuate` | Typed. Nothing reads them. |

### Three silent coercions in the gate projection

Not "unwired" — worse. The rule says one thing and the runtime does another, without
error, which is the same species of failure as the dead selectors:

1. **`frictionType` is flattened to `p.frictionType?.prompt`.** A gate declaring
   `{type: "delay", seconds: 20}` has no `.prompt`, so it is projected as
   `"Still what you came for?"` and rendered as an intention gate. `breath`,
   `confirmation` and `value_recall` do the same. The author's declared mechanism is
   discarded and replaced with a different one.
2. **`proceedAffordance.label` and `abortAffordance.label` are not projected.**
   `gate/arm.ts` hard-codes `"Keep watching"` / `"Close the tab"`. The live
   `youtube-dwell-gate` rule happens to declare those exact strings, which is why nobody
   has noticed.
3. **`proceedAffordance.action` is ignored.** Everything is `continue`; `redirect` and
   `abort` never happen.

### Ranked by value per unit of runtime work

| Rank | Gap | Work | Value | Why here |
|---|---|:--:|:--:|---|
| **1** | **Honest gate projection** — carry a discriminated `friction` plus both affordance labels and the proceed action, and render `delay` and `breath` in the overlay. | S | H | Fixes three live silent coercions and unlocks the two mechanisms with the best evidence-to-cost ratio (a beat, a breath) without touching triggers, storage, or the relay schema. Touches `store.mjs`, `decide.ts`'s `DwellGate`, `overlay.ts`, `arm.ts`. Nothing else. |
| **2** | **`schedule` as a projection-time filter** — evaluate `window` host-side, project the wrapped primitive only inside it, re-flush at window edges. | S | M–H | The whole mechanism, with no interpreter change: the host already recomputes every projection on each policy pull, so a schedule is a filter plus an alarm. Unlocks (5, Window) and (11, Window), the batched inbox — the single best-evidenced behavioural intervention in the taxonomy. |
| **3** | **`gate.trigger.element_click`** — a delegated click listener over a `SelectorChain`, gate first, replay the click on proceed. | M | H | Turns Interpose from a dwell-only mechanism into a general one, which is the entire second column of `○`. It is what (4) one-more-round actually wants: a beat between rounds beats hiding the rematch button, because hiding it is the blunt version and this is the precise one. |
| **4** | **State-conditioned friction** — one new `ConditionExpr` op reading a host-computed physiological/attention signal (readiness, sleep debt, hours awake), evaluated host-side and projected as a boolean. | S–M | M–H | The honest 80% of the credit system at a fraction of the cost, and it needs **no new primitive** — `dwell_today_exceeds` is the precedent for a condition answered from outside the DOM. Friction rises when depleted, which is when drift happens. See below. |
| **5** | **`transform.replace` + a template registry** | M | M | Buys an explanation where something used to be, which is worth more than it sounds: it is the difference between "the site is broken" and "you asked me to remove this". Also a hard prerequisite for `intercept`, whose contract *requires* a visible affordance. |
| **6** | **`gate.trigger.navigation`** | M | M | SPA route observation plus URL-condition evaluation. Wants (2) and (3). Middling because on those surfaces removal already works. |
| **7** | **Earn/spend credit ledger** | L | M | See below. Needs #4 first, carries a real psychological risk, and the ledger half is the expensive half. |
| **8** | **`intercept`** | M–H | M | Main-world event capture with per-key filtering, plus the required affordance (so, plus #5). The case that wants it most — short-form swipe — is better served by removing entry points. |
| **9** | **`actuate` as a first-class primitive** | M | L | The one action that matters (`pause_media`) is already hard-coded into the gate overlay. Promoting it buys tidiness. |
| **10** | **`observe` + a meter surface** | M | L | The gate already prints the only number worth printing at the only moment worth printing it. The repo's own reference doc argues against more. |

Adjacent, and not runtime: **a re-verification command**. Selectors rot; a rule verified
in August is of unknown status in November. The skill below is that procedure performed
by hand; a `keel rules verify` that replays each rule's recorded probe and reports
drift is the natural next artifact once the procedure has been run a few times and its
shape is known. Do not build it first.

---

## Part V — The credit / contingency system, assessed honestly

**The proposal.** Earn X minutes of a surface by doing C×X minutes of something else.

### It is not a new primitive

The spending half looks like it needs one and does not. A gate that refuses to open is a
wall, which is out of scope; the shape that fits keel is the friction dial the repo
already designed:

- balance positive → friction ≈ 0, the intentional path is clean and unimpeded;
- balance exhausted → the existing ladder engages (transform, then gate), and the
  surface stays reachable.

That is `Rule.when` over a `ConditionExpr`. The only missing piece is a condition op
that reads a balance the DOM cannot see — and `dwell_today_exceeds` is the existing
precedent for exactly that, added with the note that it is *"the one condition that
cannot be answered from the DOM"*. So: **one condition op, plus a meter.** Widening the
contract by a primitive here would be unjustified; widening it by a variant of an
existing union member is the smallest thing that works.

### The hard part is the meter, and forgeability differs by an order of magnitude

| Meter | Cost to forge | Latency | Verdict |
|---|---|---|---|
| **zenborg moments** | One MCP call. Self-declared, self-completed. | none | **Not currency.** Its value is ceremony — you must state the intention, which is BCT 1.9 Commitment. Use it to *declare* a contingency, never to *enforce* one. Calling it a meter would be self-minting with extra steps. |
| **keel's own activity log** | Leaving a tab open — but the log records *attended* time, bracketed by focus and idle spans, so idling does not accrue. Forging it means sitting there. | zero, in-browser | **Medium currency, zero new plumbing.** "Earn entertainment minutes with attended work minutes" is computable today from `bouts()`, host-side, with the same derivation the gate already uses. |
| **Garmin** | Approximately the cost of the act. Forging a 40-minute Z2 walk means walking, or strapping the watch to a dog. | minutes to hours (sync delay) | **The only hard currency in the stack.** The latency is a feature for contingency ("I'll do it right after" stops working) and fatal for immediacy. Agent-side only, so the balance is computed on the host and projected across the relay like every other policy field — existing plumbing. |
| **secretariat stamps** | Touch ID. Unforgeable by an agent; freely available to the principal, who owns the finger. | manual | High ceremony, useless as a meter. Right for recording that a contingency was *chosen*. |

### The argument against the ledger, and for the state

Metering an **act** you perform in order to buy something converts an intrinsically
motivated activity into paid labour. If walks become how you purchase YouTube, the walk
gets worse — and the walk was the good part. That is the overjustification effect, and
it aims squarely at the highest-value meter in the table.

Metering a **state** has no such failure. Readiness, sleep debt, hours awake are not
acts you can perform for pay; they are conditions. And the repo already argues that the
depleted state is precisely when the intervention is warranted: *"17–19h awake ≈ legal
alcohol limit; subjects unaware of their own deficit"* is the stated justification for
the wind-down Ulysses pact. Friction that rises with depletion is the same argument
applied to a different surface.

**Recommendation.** Build #4 (state-conditioned friction) and stop there until it has
been lived with. It costs one condition op and a host-side signal; it captures most of
what the credit system was reaching for; it cannot be self-minted, because you cannot
decide to have slept. Revisit the earn/spend ledger only if the state-conditioned
version proves too coarse — and if it is built, meter attended work time (medium
currency, no overjustification risk, zero plumbing) rather than workouts.

**Name the real failure mode.** A credit economy does not fail when someone cheats it.
It fails when the exchange rate is wrong, at which point the whole of life becomes a
chore economy denominated in screen time — which is the near-enemy the strategy document
already warns about, arriving by a new road.

---

## Part VI — The skill

Full draft: `friction-authoring-SKILL-draft.md`. Its shape and the reasoning behind it:

**It is a procedure, not a reference.** The taxonomy and the cross-product are tables
the skill carries, but the load-bearing content is a ten-step workflow with one
non-skippable gate in the middle. A skill that were only tables would have produced the
Shorts rule exactly as it was produced.

**Verification is step 5 of 10 and cannot be deferred.** Its output — surfaces sampled,
counts before and after, per-selector bisection — is written into the rule's
`description` field. The description is the only durable place for it: the rules are
plain JSON read by three consumers and no schema field exists for provenance, and adding
one would widen a contract for metadata. The live rules already do this; the skill makes
it structured and mandatory rather than a good habit two of six rules happen to have.

**Two counts, not one.** Target and control, before and after, plus per-selector
bisection with `controlLost` recorded per selector. This is the direct lesson of the
collateral bug in Part 0 and the only mechanical change that would have caught it.

**Durability ordering is stated as a rule.** A URL prefix (`a[href^="/shorts"]`) is a
product contract; a custom-element name is an implementation detail with a half-life
measured in quarters. The durable predicate goes in `primary`, component names in
`fallbacks` — the reverse of what reads naturally, and the reverse of what the live
Shorts rule does.

**Unverified is a label, not a state of mind.** If any selector was not exercised
against a live DOM, `SELECTORS UNVERIFIED` appears in the description with the specific
selectors named. Three of the six live rules carry that label today, honestly. A fourth
correctness rule follows from the chess probe below: a negative result on a surface that
never rendered proves nothing. Scanning chess.com's 5,362 loaded CSS rules on
`/play/computer` found zero occurrences of `rematch`, `game-over-buttons-*` or
`board-modal-*` — and that is *not* evidence the selectors are dead, because the
game-over modal's chunk is not loaded until a game ends. The honest note is **"not
sampled"**, never **"not present"**.

**It refuses to design walls.** Step 4 asks for the exit before asking for the
selectors. If there is no exit, the design is out of scope by construction, and the
skill says so rather than negotiating.

---

## Acceptance

- The taxonomy names categories by mechanism; no company name appears in it.
- Every mechanism row states its primitive and whether that primitive executes today,
  verified against the code rather than the types.
- The cross-product distinguishes expressible-and-running from expressible-and-inert.
- The gap list is ranked by value per unit of runtime work, and the top entry is a
  correctness fix rather than a feature.
- The credit system is assessed with its meters ranked by forgeability, and the
  recommendation is the cheaper state-conditioned variant with the reason stated.
- No new primitive is proposed. One new `ConditionExpr` variant is, with the existing
  `dwell_today_exceeds` precedent cited.
- The skill makes live-DOM verification a gate, requires a control count, and requires
  unverified selectors to be labelled in the rule's `description`.

## Immediate follow-up, outside this document's scope

`youtube-shorts-hidden` ships a fallback that hides 92% of YouTube search results.
Remove `ytd-item-section-renderer:has(grid-shelf-view-model a[href^="/shorts"])` — it is
redundant with the `grid-shelf-view-model` selector above it. Not done here: this
document does not modify rules.

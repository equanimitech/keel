# The helm — closing the gap between heading and tide

**Date:** 2026-08-06
**Status:** design, approved in conversation. Unstamped.
**Builds on:** `docs/drafts/2026-08-05-unlock-cost-ladder.md` (the notch vocabulary),
`kairos/kernel/areas.md` (the `weeds` tag), `packages/domain/src/{bouts,tide,rules,areas}.ts`.

---

## 1. What this is

kairos is one product — *leveraging AI to make most moments matter*. Its
instruments each hold one half of that sentence and neither can finish it:

| instrument | holds | blind to |
|---|---|---|
| zenborg / keel's watch | what you meant this block to be | what your attention did |
| keel's tide | what your attention actually did | what you meant |

The **helm** is the piece between them. It reads the declared **heading**, reads
the **tide**, and when they diverge it corrects — by tightening a gate that
already exists and giving it words that name what you said you were doing.

```
heading   what you meant to point at        state.watchIntentions   ✓ exists
tide      the current actually moving you   tide.ts over bouts.ts   ✓ exists
─────────────────────────────────────────
helm      notices the drift, corrects                               ← this spec
gate      what it reaches for               friction/gate/          ✓ exists
```

## 2. The one design decision

**The helm adds no actuator.** It modulates the dwell gate already shipped in
`apps/browser/modules/friction/gate/`.

That gate fires every N minutes of accumulated attended dwell on a domain set.
The helm changes N, and changes the prompt, when you are on watch and drifting.
It inherits the dwell math, the overlay, the day-boundary handling and the
fired-at bookkeeping without touching any of them.

The alternative — a second interrupt path with its own trigger, state and
overlay — would be a second answer to "should I interrupt right now", and the
two would drift apart exactly the way two dwell implementations would. One
interrupt path, one place to reason about noise.

## 3. What drift means

Drift is deliberately not a semantic judgement. It is:

> There is a declared heading right now, **and** attended time in an area tagged
> `weeds` has passed a floor within this watch.

No model call, no matching of heading text against domains. `Entertainement` is
already tagged `weeds` in the kernel, which is the entire reason that tag exists
in a shared contract. This is the deterministic baseline; a semantic helm is a
later layer and this is what it must beat.

**The known weakness, stated rather than hidden:** a heading that legitimately
lives in a weedy area (researching YouTube, an evening deliberately spent in
Entertainement) reads as drift. Mitigated by the gate always being escapable —
worst case is one interruption with a "continue" affordance, not a block. If it
proves annoying in practice, the fix is a per-watch opt-out, not a smarter
classifier.

## 4. Architecture

```
~/.keel/state.json
  watchIntentions{ morning: "keel — land what's in flight" }
        │
        │  policy pull, on the existing relay flush   ← 1 new field
        ▼
  friction/policy/store.ts
    heading · areas · areaMap · gates        (areas/areaMap already mirrored)
        │
        ▼
  bouts() ──► weedy dwell this watch
        │
        ▼
  helm(reading) ──► HelmVerdict | null
        │
        ├── null ──────► gate behaves exactly as today
        └── drifting ──► gate interval tightened, prompt names the heading
```

### 4.1 `packages/domain/src/helm.ts` — pure

No clock, no I/O, no Chrome APIs. Same rules as the rest of `@keel/domain`.

```ts
export interface HelmReading {
  /** The declared heading for the current watch, or null if none stands. */
  readonly heading: string | null;
  /** Attended ms in `weeds`-tagged areas since the watch began (§4.5). */
  readonly weedyMs: Duration;
}

export interface HelmVerdict {
  /** The heading to name in the prompt. Never null when a verdict exists. */
  readonly heading: string;
  /** Minutes of weedy dwell, floored — never overstate. */
  readonly weedyMinutes: number;
  /** Gate interval to use while drifting. */
  readonly everyMinutes: number;
}

export function helm(
  reading: HelmReading,
  thresholds?: HelmThresholds
): HelmVerdict | null;
```

Returns `null` — meaning "no opinion, leave the gate alone" — whenever there is
no heading, or weedy dwell has not reached the floor.

### 4.2 Thresholds

```ts
export const DEFAULT_HELM_THRESHOLDS: HelmThresholds = {
  /** Weedy dwell within a watch past which the helm has an opinion. */
  floorMs: 5 * 60 * 1000,
  /** Gate interval while drifting, replacing the rule's declared interval. */
  driftingEveryMinutes: 5,
};
```

Provisional, exactly like `DEFAULT_THRESHOLDS` in `tide.ts`, and carrying the
same caveat: these are eyeballed from one user's history and should become
personal baselines once ~21 days of data exist. A verdict produced with them is
a hypothesis.

`driftingEveryMinutes: 5` — **decided 2026-08-06.** Rationale: the 2026-08-05
drip was 100 minutes in 3–6 minute fragments, so 5 meets each fragment roughly
once, while 30 (the rule's declared default) never fires inside one. That is
why nothing fired on the day that prompted this work.

**Known ceiling — repetition trains dismissal.** At floor 5 / interval 5, a
100-minute drift day is ~20 interstitials, and `gate/state.ts` already names
this failure mode: a gate you swat has stopped being a gate. Deliberately not
pre-solved, because the frequency is unmeasured until `intention_set` logging
exists (§7). The upgrade path if it nags is **escalation rather than
repetition** — 5, 10, 20 within a watch — so the third interruption costs more
than the first instead of less. One line in `helm()`, and it keeps the
`nextFiredAt` arithmetic untouched.

### 4.3 `apps/agent` — expose the heading

The policy pull gains one field, read from `state.watchIntentions` at the
watch `activeWatch(now, target.watches)` resolves:

```json
{
  "heading": {
    "text": "keel — land what's in flight",
    "startedAt": 1786000000000,
    "endsAt": 1786021200000
  }
}
```

`null` when no heading stands. `startedAt`/`endsAt` bound the drift window
(§4.5). For a watch they are today's epoch ms of its configured start
(`watches.morning: "07:00"`) and of the next watch's start. The pull mechanism,
the native host and the relay all already exist; this is a field, not a channel.

**The shape is deliberately not watch-specific** — see §4.6.

### 4.4 `apps/browser` — consume it

- `friction/policy/store.ts` — one new mirrored item, `heading`.
- `friction/gate/decide.ts` — `evaluateGate` computes weedy dwell since
  `heading.startedAt`, calls `helm()`, and uses `verdict.everyMinutes` in place
  of `gate.everyMinutes` when a verdict exists. One branch.
- `friction/gate/overlay.ts` — when a verdict is present, the prompt names the
  heading and the minutes.

The weedy domain set is `domainsInAreas(areaMap, weedyAreaIds)`, both functions
already in `areas.ts`.

### 4.5 Drift is scoped to the watch, not the day

`dwellTodayFor(domains, now)` is day-scoped. Using it directly would be a bug:
weedy dwell from the morning would count against an afternoon heading, so an
afternoon watch could open already past the floor and gate on its first minute.

Generalise it rather than adding a second dwell path:

```ts
export async function dwellSince(
  domains: readonly string[],
  since: number,
  now: number = Date.now()
): Promise<number>;

// the existing call site becomes:
const dwellTodayFor = (domains, now = Date.now()) =>
  dwellSince(domains, startOfLocalDay(now), now);
```

Same `bouts()` derivation, same guarantee that the gate acts on the number the
analysis reports. The gate's own fired-at bookkeeping stays day-scoped and
unchanged — only the helm's drift window is watch-scoped.

**Consequence to accept:** when the watch rolls (13:00), weedy dwell resets to
zero and the helm goes quiet until the floor is met again inside the new watch.
That is correct — a new heading is a fresh commitment, not a continuation of the
morning's ledger.

## 4.6 Aimed at the calendar

The 2026-08-03 kairos direction names the pivot: *the tool demands input it
should derive*. `state.watchIntentions` is that demanded input — it only exists
if you remember to run `keel intention`. It is the v1 source because it ships
today at zero cost, **not because it is the right one.**

```
v1   keel intention "…"            typed     ← exists
v2   the calendar event you're in  derived   ← EventKit sidecar, same field
```

The helm never learns which. `HelmReading.heading` is a string that arrived
through the policy pull, so calendar ingestion is a change of *source*, not of
consumer. Three constraints keep that true, and they are the reason for the
shape above:

1. **No `watch` field in the contract.** A watch is a fixed phase band; a
   calendar event has arbitrary bounds. `startedAt`/`endsAt` describes both.
   Naming the watch here would make v2 a contract change.
2. **`endsAt` is load-bearing, not decoration.** With watches there is always a
   heading slot, so a null heading only means "none set". With a calendar there
   are **gaps** — and in a gap the helm must go quiet rather than inherit the
   previous block's heading. `endsAt` is what makes a gap representable.
3. **Only `accepted` moments may become headings.** A `tentative` moment is a
   guess the machine made from an ingested trace. Arming friction off a guess is
   precisely what would make the helm feel imposed rather than yours, and it
   would put the ingestion layer's mistakes between you and your browser. The
   accept step is the consent, and it must precede any friction.

No `source` field: v1 and v2 say the same thing to the user ("you meant X"), and
a field the copy does not read is speculative. Add it when the copy needs it.

**Ordering.** This builds the consumer before the good source, deliberately.
The helm is what makes calendar ingestion worth building — today the calendar
direction feeds a planning surface; with the helm, an ingested event becomes the
thing that protects the block it describes.

**Known v1 limitation, stated plainly:** `intention` sets are not logged (the
agent log carries 15 event kinds, none of them intention), so we cannot yet say
how often a heading actually stands. Until that is measured, the helm's firing
frequency in real use is unknown. See §7.

## 5. Invariants held

**Ambient may never arm a cooldown.** The helm is ambient — nobody reached for
it — so it may tighten a gate and nothing more. This is unrepresentable rather
than merely validated: `AmbientRule` in `rules.ts` has no slot a `CooldownSpec`
fits into. The evidence side says the same thing (yesterday's ladder, §1:
imposed restriction tops out at `gate`; Mark 2018 is about the imposed case).
The panic lock stays self-invoked and is untouched by this work.

**Every notch stays escapable.** `GateSpec.proceedAffordance` is required by the
type, not optional. The helm cannot produce something you can't walk through.

**Fail-soft is the default path.** Missing heading, missing areas, malformed
state, empty policy mirror → `helm()` returns `null` → the gate behaves exactly
as it does today. The helm can only make an existing gate tighter and
better-worded; it can never invent one. This matters because the policy mirror
is a cache that can legitimately be empty.

**No shame framing.** The prompt states two facts — what you declared, and what
the clock says — and offers the substitute. No streaks, no score, no
`10.11 Future punishment`.

## 6. Testing

`packages/domain/src/helm.test.ts`, beside `bouts.test.ts` and `tide.test.ts`.
Pure function, so no fixtures or harness:

| case | expects |
|---|---|
| no heading, heavy weedy dwell | `null` — an undeclared block is not drift |
| heading, weedy dwell below floor | `null` |
| heading, weedy dwell at the floor exactly | verdict — boundary is inclusive |
| heading, weedy dwell past floor | verdict, `everyMinutes` = 5 |
| heading, zero weedy dwell | `null` |
| empty-string heading | `null` — treated as no heading, since `clear` writes `""` |
| heading legitimately in a weedy area | verdict — documents the known weakness |
| `weedyMinutes` rounding | floored, never overstates |

Existing `gate/state.test.ts` covers the interval arithmetic and is unchanged —
the helm supplies a different N, it does not change how N is used.

One integration-level check on `dwellSince`: dwell before `since` is excluded,
so the watch-roll reset in §4.5 is verified rather than assumed.

## 7. Scope

**In:** `helm.ts` + tests, the `heading` field end to end, the one gate branch,
the overlay copy, and **an `intention_set` event** written when a heading is
declared or cleared.

That last one is not scope creep — it is three lines in `cmdIntention`, and
without it the helm ships with its own trigger unobserved. The observe-first
directive applies to the helm exactly as it applies to everything else: log the
signal now, model it later. It is also the only way to answer "would calendar
ingestion actually help?" with data rather than conviction.

**Out, deliberately:**
- Any semantic reading of the heading (that is the AI helm, a later layer).
- Calendar ingestion itself (§4.6 makes it a source swap; it is its own build).
- Reading zenborg's vault. The heading comes from keel's own state; zenborg is
  a possible future *source* of it, not a dependency. This preserves what the
  2026-06-17 decision protected — the published plugin stays dependency-free.
- The three deletions (ledger→areas, `vice-block.sh`→drogue, dead
  `state.intention`). Agreed as a separate pass; none blocks this.
- Renaming `drogue`, `intention`, `granularity`. Rides with the deletion pass.
- `weeds` is **kept** as the kernel tag — decided 2026-08-06, zero migration.

## 8. Open

1. Whether the helm should also read the *tide label* (`drifting` / `restless`)
   rather than weedy dwell alone. Deferred: dwell is the simpler signal and the
   tide's thresholds are themselves provisional. Revisit once both have baselines.
2. When calendar ingestion lands (§4.6), whether an all-day or multi-hour event
   should be a heading at all. A three-hour "offsite" event is a location, not
   an intention, and would hold a heading over blocks that deserve their own.
   Not blocking: v1 has no calendar source.

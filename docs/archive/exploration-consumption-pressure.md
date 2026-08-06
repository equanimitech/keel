# Exploration: Consumption Pressure & Dopamine Lockdown

**Status**: Exploration (pre-spec)
**Author**: The operator + Claude
**Date**: 2026-02-10
**Context**: Personal tool — no external structure, solo founder lifestyle

---

## The Gap in Equanimi's Model

Equanimi currently operates per-domain. Each shield, signal, and budget knows about one site. But compulsive consumption is rarely a single-domain problem. The actual pattern looks like this:

```
YouTube (20 min) → Chess (3 games) → LinkedIn (10 min) → YouTube (30 min) → Chess (5 games)
```

No individual budget is necessarily violated. The YouTube budget might be set at 60 min/day. The chess budget at 8 games/day. Each domain is "fine." But the aggregate pattern is clearly compulsive — 3+ hours of cross-domain consumption drift with no creation, no movement, no intentional pause.

This is the tragedy of commons applied to your own attention: each individual withdrawal seems small, but the aggregate is bankrupt.

### Buddhist Psychology Framing

The existing intervention axes map to the three poisons:

| Axis | Poison | Mechanism |
|------|--------|-----------|
| Shields | Lobha (craving) | Remove compulsive cues |
| Signals | Moha (delusion) | Reveal hidden state |
| Budgets | Sīla (ethical commitment) | Encode intention |

What's missing: **vedanā** — the feeling tone (pleasant/unpleasant/neutral) that arises BEFORE craving. In the consumption cycle, vedanā is the micro-reward that drives domain-hopping. You get a pleasant hit from chess, it fades, vedanā shifts to neutral/unpleasant, you seek the next hit on YouTube. The craving isn't for chess or YouTube specifically — it's for the *pleasant feeling tone* itself.

A consumption pressure detector would be modeling vedanā at the behavioral level: not what you're consuming, but the *pattern* of seeking across all domains.

---

## The Model: Consumption Pressure

### Definition

**Consumption pressure** is a cross-domain aggregate score representing the intensity and pattern of attention spent on monitored consumption sites. It's computed from signals already available within the browser extension.

### Available Heuristic Signals

A browser extension can't measure heart rate or EEG. But it can observe:

| Signal | What It Captures | How to Measure |
|--------|-----------------|----------------|
| **Cross-domain time** | Total time on all monitored sites today | Sum of per-domain dwell time |
| **Domain hop frequency** | How often you bounce between consumption sites | Tab switches between monitored domains per hour |
| **Session scatter** | Short bursts across many sites vs. sustained single-domain | Entropy of time distribution across domains |
| **Budget violation migration** | Over on one domain, moved to another | Domain B activity when Domain A budget > 100% |
| **Shield bypass rate** | How often you click "I'm sure" on cooldowns | Count of escape-hatch clicks per session |
| **Time-of-day anomaly** | Consuming during hours you typically don't | Activity outside your normal consumption window |
| **Velocity** | Acceleration of consumption (speeding up vs. steady) | Rate of change in cross-domain time over last 30 min |

### Computing the Score

**Simplest viable model** (v0 — no ML, pure heuristics):

```
consumption_pressure = weighted_sum(
  normalized_cross_domain_time,      // 0.0–1.0, relative to personal baseline
  normalized_hop_frequency,           // 0.0–1.0, hops per hour vs. baseline
  budget_violation_count,             // number of domains over budget
  shield_bypass_rate,                 // bypasses per hour
  time_anomaly_flag                   // binary: is it past your curfew?
)
```

Weights are tunable. The score produces a value from 0.0 (no pressure) to... unbounded, but practically 0–3:

| Range | State | Meaning |
|-------|-------|---------|
| 0.0–0.5 | **Calm** | Normal browsing, nothing unusual |
| 0.5–1.0 | **Warming** | Consumption is accumulating, worth noting |
| 1.0–1.5 | **Elevated** | Clear consumption drift, multiple domains active |
| 1.5–2.0 | **Hot** | Compulsive pattern likely — budget violations, domain hopping |
| > 2.0 | **Spiral** | Heavy consumption across domains, bypassing interventions |

### What "Personal Baseline" Means

Raw thresholds (e.g., "2 hours = elevated") are one-size-fits-all and fail (your own research confirms this). The pressure score should be relative to YOUR pattern:

- Running average of daily cross-domain time over past 14 days
- Running average of domain hop frequency
- Day-of-week adjustment (weekends may have different patterns)

This means the first 2 weeks of use are a calibration period. The system learns your normal before it can identify your abnormal.

---

## Compulsive Consumption Patterns

Not all elevated pressure looks the same. Three archetypes:

### 1. The Binge

Single-domain overconsumption. 15 chess games in a row. 2 hours of YouTube.

**Signals**: High single-domain time, low hop frequency, budget violation on one domain.

**Existing tools already address this** — budget escalation + signals. This is the simplest case.

### 2. The Scatter

Rapid domain-hopping. 10 min YouTube → 5 min LinkedIn → 1 chess game → back to YouTube → check email → back to chess.

**Signals**: High hop frequency, high entropy, no single domain budget violated, elevated aggregate time.

**This is what the current architecture misses.** Each domain looks fine individually. Only the cross-domain view reveals the pattern.

### 3. The Displacement

Over budget on Domain A, migrates to Domain B. "I shouldn't play more chess, so I'll just watch a couple videos." The craving displaces, it doesn't dissipate.

**Signals**: Budget violation on Domain A immediately followed by Domain B activation. Classic vedanā seeking — the pleasant feeling must come from somewhere.

---

## The Intervention: Dopamine Lockdown

### What It Is

A **system-wide mode shift** that simultaneously escalates all interventions across all monitored domains. Not a new intervention type — an orchestration of existing ones.

When activated:

- All shields go to maximum friction (longest cooldowns, most aggressive blocking)
- All signals go to maximum visibility (full opacity, largest size)
- All budgets treated as 100%+ consumed (escalation multipliers kick in)
- A persistent banner appears: "Lockdown active. [X min remaining]"
- The "I'm sure" escape hatches still exist, but each bypass gets logged and surfaced

### Trigger Modes

**System-suggested**: When consumption pressure crosses a threshold (e.g., > 1.5), the system proposes lockdown. A gentle prompt: "You've been on consumption sites for 2h 15m across 3 platforms. Want to activate a cooldown?"

The user can:
- Accept (lockdown activates for configurable duration)
- Snooze (ask me again in 30 min)
- Dismiss (not today)

**User-initiated**: A button in the popup/manage page: "Start lockdown." For when you feel the pull starting and want preemptive friction. This is the "I know myself" mode — declaring intent before the spiral takes over.

**Scheduled**: Set recurring lockdown windows. "Every day after 10pm, activate lockdown." This is the external structure you don't have — artificial curfew.

### Duration Mechanics

- Default: 2 hours
- Configurable: 30 min to "rest of day"
- Wind-down: Last 10 minutes, interventions gradually reduce to normal levels (avoids the "dam breaking" effect when lockdown ends)
- The user can end lockdown early, but it requires a deliberate action (navigate to manage page, click "End lockdown", confirm)

### Design Principles (Compass, Not Cage)

- **Never blocks access.** Every site is still reachable. Friction is maximized, but access is never zero.
- **Always shows the score.** The consumption pressure number is visible — meta-awareness, not paternalism.
- **Respects good consumption.** Watching a 2-hour documentary you planned to watch shouldn't trigger lockdown. The scatter and displacement patterns are stronger signals than raw time.
- **User trains the model.** Dismiss = "this was fine." Accept = "this was compulsive." Over time, the thresholds calibrate to the individual.

---

## Open Questions

### 1. How to distinguish intentional from compulsive consumption?

The "planned documentary" problem. You might intentionally spend 3 hours on YouTube for research. The system sees high consumption time and proposes lockdown. Annoying.

**Possible solutions:**
- "Intent declaration" before a session: "I'm going to watch X for Y minutes" → system exempts that session
- Only trigger on scatter/displacement patterns, not raw binge (binge might be intentional)
- Learn from dismissal patterns: if you always dismiss on Sundays, stop suggesting on Sundays

### 2. What about cross-device consumption?

The browser extension only sees Chrome. If you get locked down on desktop and switch to your phone, the system is blind. This is a fundamental limitation of the browser extension approach.

**Accept the limitation for now.** The goal is meta-awareness, not total control. Even seeing the desktop pattern is useful.

### 3. Where does this live architecturally?

Options:
- **A new module type** alongside shields/signals/budgets (e.g., `modules/pressure/`)
- **An extension of the background script** that aggregates cross-domain state
- **A layer on top of budgets** (the "meta-budget" — a budget for total consumption, not per-domain)

The meta-budget approach is the simplest: you already have budget types with `days-per-week` and `time-per-day`. Add a special domain `"*"` or `"all"` that sums across all monitored domains. Lockdown = what happens when the meta-budget is exceeded.

### 4. How heavy should the lockdown suggestion be?

Too subtle → ignored, you're already in the craving loop. Too aggressive → annoying, disabled, uninstalled.

The research says: **nudge, don't block.** But the research also says nudges don't work on people already in compulsive states. The "scattered" user has depleted executive function — they need *more* friction, not less.

Possible middle ground: **escalating suggestions.** First suggestion is a gentle prompt. If dismissed and consumption continues, second suggestion is more prominent. Third suggestion asks a reflective question: "What were you planning to do today?"

### 5. What data do we need to persist?

For the pressure score to work, we need a consumption log:

```
{ domain: string, timestamp: number, event: "enter" | "exit" | "game_end" | "video_end" }
```

This is a privacy-sensitive log of browsing behavior. It should be:
- Local only (never leaves the extension)
- Auto-pruned (keep 14 days max)
- User-deletable at any time
- Never shown raw (only as aggregated scores)

### 6. Does the Buddhist framing hold up?

The vedanā model is compelling as metaphor but needs rigor. Are we actually modeling vedanā (pre-conscious feeling tone) or just measuring behavior that correlates with craving? Probably the latter. The extension can't detect vedanā directly — it infers craving from its behavioral consequences.

This is fine for a product. It's insufficient for academic claims. Keep the framing as design philosophy, not as neuroscience.

---

## Connection to Broader Thesis

This exploration connects to three pieces of existing research:

**Attention Orchestration System**: The physical magnets give you meta-awareness of your attention allocation. Consumption pressure is the digital equivalent — making the consumption pattern visible so you can choose differently.

**Attention-Preserving Systems**: The MIT proposal envisions EEG/HRV-based attention state classification. Consumption pressure is the low-fidelity version: behavioral heuristics instead of biometrics. If you ever build the sensor version, it would replace the heuristics with real-time physiological data.

**Design Principle #4 from the literature review**: "Support meta-awareness, not just task management." This is exactly that — helping you notice your own attention state, not just blocking specific sites.

---

## What This Is NOT (Yet)

- A productivity tool (no "you should be working" judgment)
- A screen time tracker (Apple/Android already do this, poorly)
- A gamified system (no streaks, no points, no leaderboards)
- A social tool (no accountability partners, no sharing)
- An AI coach (no LLM telling you what to do — just a mirror)

---

## Next Steps

1. **Validate the model**: Test consumption pressure scoring against actual browsing logs. Does the score correlate with subjective "compulsive" feeling? (Self-experiment.)
2. **Cheapest possible v0**: Add a cross-domain time counter to the background script. Just surface the aggregate number in the popup. No lockdown, no fancy scoring — just the mirror.
3. **If v0 resonates**: Build the hop frequency and displacement detection. Add lockdown as user-initiated only (no auto-suggestion yet).
4. **If lockdown gets used**: Add system-suggested lockdown with escalating prompts. Calibrate thresholds from personal data.
5. **Write the spec**: If the exploration validates, formalize as spec 004 with full architecture, file changes, priority scoping.

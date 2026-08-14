---
tag: pitch
appetite: small
status: draft
source: conversation 2026-08-14 — "timeout during the AI wait gap" → screensaver/detachment → zenborg-sourced roulette
slice_id: A
---

# Pitch — Step away: a self-invoked gap window, wheel sourced from zenborg

**Bet:** A tray item that dims every screen and names one thing worth doing, drawn at random from the zenborg habits tagged `gap`.

**Why it matters:** The wait gap is the moment we reliably lose, and today keel only watches it. This is the smallest honest intervention — self-invoked, cue-level, and it makes the intentional path easier instead of only making the compulsive one harder.

---

## Boundaries

**JBTD:** When I dispatch a long agent run and the screen goes quiet, I want the screen to stop offering me things and hand me one concrete alternative, so that I leave the desk instead of opening a tab. Baseline today: the gap drains to the browser; keel logs it and does nothing.

**Out:**

- **Ambient firing.** Nothing arms this but a click. `AmbientRule.primitives` already excludes `CooldownSpec`; this honours that invariant by construction.
- **Agent-return auto-dismiss.** The tray is write-only today — it never reads the log. Wiring that is its own bet.
- **A countdown, a streak, a score.** A countdown makes waiting the salient activity.
- **A real screen lock.** `pmset` plus a password taxes the return to work as hard as it taxes the drift.
- **keel writing zenborg.** Habits are kernel-owned: keel reads `habits.json`, never writes it.

## Elements

- **Tray item → gap window** (`apps/tray/src-tauri/src/lib.rs:383`, beside `open`). "Step away" opens a borderless, near-black `WebviewWindow` on every monitor; it becomes "Return", disabled for the hold. `tauri.conf.json` `app.windows` stays `[]` — windows are built at runtime. The window floats *below* the menubar, so the escape hatch stays visible and honest.
- **The wheel** (`domain.rs`, pure). Read `~/.kairos/habits.json`; keep non-archived habits whose `tags` contain `gap`; pick one by a caller-supplied roll, so the domain stays free of randomness (same rule as `build_event`, `domain.rs:40`). `gap-screen` marks the on-screen ones. Empty list → the window still opens, unnamed. Fail-open like every other read.
- **Delay, not block** (`lib.rs`). Off-screen habits hold the window 60s before "Return" enables — the delay *is* the mechanism. On-screen habits (chess, italian lessons, revision code) reveal for 5s then close, because you need the screen for them. Cmd-Q always works, and that is stated rather than hidden — misrepresenting the mechanism is the named anti-pattern.
- **`step_away_start` / `step_away_end`** via `Logger::emit` (`lib.rs:105`). Payload carries habit name, `offScreen`, and `holdMs`; the end event carries `durationMs`. Spans, per the event-taxonomy contract. This is what tells us in a week whether it worked.

## Risks

**🐇 Rabbit holes:** a spinning roulette animation (v1 draws one name, no spin); reading the agent log to detect gaps; matching habit to predicted gap length.

**🏴 Off-sides:** letting a tide arm it; adding a countdown; porting it to the browser surface.

**🧪 Domain knowledge:**

- **Two mechanisms, one surface.** Off-screen picks are cue removal (detachment); on-screen picks are substitution (BCT 8.2). `offScreen` in the payload keeps them separable in the log. Note chess.com also sits on the compulsion blocklist — the wheel can name what the drogue blocks.
- **The AI-gap premise is unproven**: only 4.6% of watched dwell had a tool in flight (`docs/drafts/2026-08-05-unlock-cost-ladder.md`). Self-invocation sidesteps this — you fire it when you know — but do not promote it to ambient until the log says so.

## Acceptance

1. Tray shows "Step away"; clicking it dims every display within a second.
2. The window names one habit tagged `gap`; across 20 opens, more than one distinct name appears.
3. For an off-screen pick, "Return" is disabled for 60s, then enables and closes the windows.
4. For an on-screen pick, the window closes on its own after ~5s.
5. `step_away_start` and `step_away_end` land in the day's `.desktop.jsonl` with habit name, `offScreen`, and a `durationMs` on the end event.
6. No zenborg file is written, and no tide path can open the window.
7. `pnpm --filter @keel/tray test` passes, including wheel selection and the empty-list case.

---

_Drafted by Claude (scribe). Supersedes the "Heave to" naming variant from the same session._

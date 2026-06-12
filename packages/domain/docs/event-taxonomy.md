# keel event taxonomy — the writers' contract

One grammar for every `ActivityEvent.kind`, across all surfaces. Kinds stay an
**open set** (they accrete per surface; never a central enum), but every kind
conforms to one of three patterns. Stamped basis:
`docs/decisions/2026-06-12-keel-productization.md` (surfaces),
`docs/decisions/2026-06-12-retire-the-intervention-layer-….md` (observe vs act),
`docs/references/2026-06-12-attention-observability-literature.md` (constructs).

## The grammar

| Pattern | Shape | Examples | Academic anchor |
|---|---|---|---|
| **Span** | `<state>_start` / `<state>_end`; `durationMs` on the end event when the start was observed | `idle_start`/`idle_end`, `focus_start`/`focus_end`, `session_start`/`session_end` | AFK bracketing (ActivityWatch); interval substrate for resumption lag (Iqbal & Bailey 2006) |
| **Switch** | `<thing>_switched` / `<thing>_activated`; payload carries the *new* target; `durationMs` may close the previous span | `app_switched`, `tab_activated` | Switch events — fragmentation metrics (Mark CHI 2014); coarse breakpoints (Adamczyk & Bailey 2004) |
| **Completion** | past-tense action end | `navigation_committed`, `tool_completed`, `video_ended`, `post_seen` | Action completions = breakpoint candidates ("never clock-based", OASIS) |

Rules:

- `durationMs` appears **only** when the event closes an interval whose start
  this writer observed. A span end with an unobserved start (process restart,
  pause) is emitted **without** `durationMs` — the boundary is still real.
- Spans never survive a writer pause/sleep: drop span state, never fabricate.
- Payloads carry **domains, never full URLs**; window titles capped (256 chars);
  counts and timings, never content. `logDetail` dials extra depth per user.

## Per-surface vocabularies (live)

- **agent** (`apps/agent`): `session_start`, `session_end`, `prompt`,
  `tool_dispatched`, `tool_completed`, `tool_failed`, `turn_stop`,
  `subagent_stop`, `notification`, `pre_compact`, `permission_request`,
  `config_change`, `file_changed`, `rule_changed`.
- **desktop** (`apps/tray` — the body; the surface is keel desktop):
  `app_switched` (payload `app_name`, `window_title`, `is_full_screen`;
  `durationMs` = previous app's focus span), `idle_start` (payload
  `thresholdMs`, ts backdated to last input), `idle_end` (+`durationMs`).
- **browser** (`apps/browser`): `writer_started`, `tab_activated` (payload
  `domain`), `navigation_committed` (payload `domain`), `focus_start`/
  `focus_end` (browser holds OS focus), `idle_start`/`idle_end`
  (chrome.idle; locked counts as idle), `log_pruned`, `panic_pressed`
  (popup self-report), and — observe tier only — the sensor completions
  `video_started`, `video_ended`, `post_seen`, `game_finished`.

Architecture note (OASIS mapping): the desktop observer emits the global
*switch stream* (application-independent layer); each per-app surface
(browser, agent) emits its own *spans + completions* (per-application
plug-ins). Sensors added later follow the same split.

## "Session" semantics — per surface, by design

| Surface | `sessionId` | Meaning |
|---|---|---|
| agent | Claude session id | Real, tool-imposed session. `session_start`/`session_end` are span events. |
| browser | uuid per service-worker lifetime | **Writer epoch** — mechanical provenance only. `writer_started` marks it. Never analyze as a behavioral session. |
| desktop | `""` | Sessionless. |

The behavioral unit is the read-side **bout** (web-analytics "visit"):
derived by inactivity timeout over the merged log. Writers never claim bouts.

## Read-side constants (slice E inherits these — do not reinvent)

- Feature cadence: **3 s bins**, **30 s rolling windows** (OASIS).
- Breakpoint/label alignment tolerance: **±10 s**.
- Personal baselines: **z-scores over rolling windows** — never absolute
  thresholds (none are validated; Mishra 2021: personalization wins after
  ~21 days of data).
- Attention/cost states: **≤ 3 classes**, ever (Fogarty 2005 ceiling). No
  derived fact may claim more.
- Named derivations: **wait gap** (long `tool_dispatched` → next user input;
  keel's novel construct), **resumption lag** (interruption end → first
  action in resumed task), **switch rate / fragmentation** (per-window switch
  counts vs own baseline).
- Derived facts carry the bi-temporal envelope
  `{ validFrom, validTo?, learnedAt, invalidatedAt?, sourceEventIds }` —
  superseded facts are invalidated, never deleted.

## Reserved kinds (named now, emitted later)

- ESM channel: `probe_shown`, `probe_answered` (~2/h max, one 5-point item).
- Intervention outcomes (P5): `intervention_shown`, `intervention_dismissed`,
  `intervention_clicked_through`, `intervention_effective`.
- Desktop input sensor: `input_activity` (counts + interval aggregates per
  bin — never keycodes, never content; default-off).

## Legacy alias map (read-side; raw files are never rewritten)

| Pre-2026-06-12 kind | Canonical |
|---|---|
| `browser_idle` | `idle_start` |
| `browser_active` | `idle_end` |
| `window_focus` | `focus_start` |
| `window_blur` | `focus_end` |
| `browser_session_start` | `writer_started` |
| `app_focus` | `app_switched` |

In code: `canonicalKind()` / `LEGACY_KIND_ALIASES` in `src/activity.ts`.

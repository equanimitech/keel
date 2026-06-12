# Shields → sensors restart (directive, 2026-06-12)

Rafa's call: **remove/disable all 11 shields** and restart the browser surface as pure observability — the shield machinery (content scripts watching video state, post-game loops, feeds) becomes *per-domain sensors*:

- opens per day (domain session starts)
- session durations
- counts of key actions: posts seen / videos watched / games played
- time between key actions
- enhanced observability configurable per domain (the existing per-domain content-script registry is exactly this, repurposed)

Intervention timing confirmed for later: navigation commit, video end, session start ("timing beats strength").

**The methodological gift of removing shields now:** the coming weeks become a clean *unshielded baseline* — the thing we currently lack (correct: no baselines exist yet; they're P3, fed by the writers that went live today). When interventions return (P5), they re-enter one at a time against that personal baseline, each measured as an interrupted time-series on the user's own data (trigger rates, key-action rates, session durations before/after). Effectiveness becomes a number, not a feeling. Shield outcome logging (shown/dismissed/effective) joins the event stream then.

- Questions:
  - Remove vs disable: delete shield activation but keep content-script DOM knowledge (selectors for "video ended", "post seen") — it's the sensor substrate.
  - `keel log report` (slice E) defines the baseline metrics: opens/day, duration distributions, key-action cadence per domain.
  - Keep the porn-block drogue? (It's a commitment device, not an attention shield — different category, likely stays.)

Don't shape yet — next session's first slice.

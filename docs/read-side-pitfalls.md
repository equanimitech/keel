# read-side pitfalls — how the log lies if you let it

The log is honest. Derivations built on it are not, automatically. This is the
list of ways a plausible analysis over `~/.keel/log/*.jsonl` produced a
**confidently wrong answer**, written down so the next one doesn't.

Every case below is real, from the 2026-08-07 session that first joined the
garmin surface against the attention surfaces. The wrong answer and the right
answer are both recorded, because the gap between them is the lesson.

---

## 1. Ask whose behaviour the event describes

**What happened.** `tool_dispatched` was read as a measure of how hard the human
worked. It is emitted when *Claude* dispatches a tool. One `prompt` can spawn 80+
dispatches, so the count tracks **agent autonomy**, not human exertion.

**Wrong:** "tools dispatched 919/day vs 370 baseline — a heavy building week."
**Right:** two agentic days produced almost all of it, and the human's own
`prompt` count was *below* baseline. It was a rest week.

**Rule.** Before using a kind, name its actor (the table in
`event-taxonomy.md`). Derivations about the person use human-actor kinds only.
Agent-actor counts also have a **non-stationary baseline** — they shift when the
model or harness changes, with no change in behaviour at all.

---

## 2. Zero is data; absent is missing. They are not the same.

**What happened.** A comparison helper returned `None` for zero values —
`if counter[k] else None` — so zero-days were dropped from both means.

A day with no prompts is a **real rest day**, not a gap in the record. Dropping
zeros inflates both means *and* changes the two denominators unequally.

**Wrong:** 79.2 vs 32.7 (2.4× above baseline).
**Right:** 48.6 vs 56.9 (slightly *below* baseline).

One falsy check flipped the sign of the conclusion.

**Rule.** Distinguish "the writer recorded nothing" from "the writer was not
running". Only the second is missing data. For per-day rates, build the full
date range first and fill absent days explicitly — never let a falsy value
silently leave the sample.

---

## 3. Never analyse a window you are inside

**What happened.** A "last 7 days" comparison included the session doing the
analysing — which was itself one of the two heaviest agent days on record.

**Rule.** Exclude the current day from any window an agent computes about its
own user, or flag it loudly. The agent surface makes the analyst a participant
in the data.

---

## 4. A dead sensor means *unknown*, not *zero*

**What happened.** Video watch-minutes came back `0.0` for every period. The
cause was a defect (`video_ended` never carries `durationMs`; only 151 ends
against 456 starts). The defect was correctly spotted — and the analysis still
concluded "consumption was flat", resting on `post_seen`, a **feed** metric that
says nothing about video.

The human's own report — *"I did not build as much as I watched videos"* — was
correct, and dwell later confirmed it: 4.0 h of YouTube, +77% over baseline.

**Rule.** When an instrument is broken, every conclusion that instrument fed
becomes *unknown*. Downgrade the claim; do not substitute a neighbouring metric
that measures something else and keep the original confidence.

---

## 5. Enumerate from the data, not from the schema

**What happened.** Consumption was totalled over the kinds sensors emit —
`post_seen`, `video_started`, `product_seen`. Those sensors exist for video,
feed, and shopping. **chess.com was the second-largest sink at 2.4 h** and was
completely invisible, because no sensor covers chess, so it emitted nothing.

Dwell — derived from `tab_activated` / `navigation_committed` domains, which
every site produces — found it in one pass.

**Rule.** Sensor-derived metrics can only find what someone already anticipated.
For any "where did my attention go" question, start from a **sensor-agnostic**
derivation (dwell by domain) and use sensor kinds to add depth *within* what
that surfaces. Watchlist-gated sensors especially: they are blind by
construction outside the watchlist.

---

## 6. The subject's report outranks a weak statistic

**What happened.** The user stated plainly that he had watched more than he
built. This was treated as a claim to be explained by the data rather than
evidence to be weighed against it. The data won on the strength of `n=7`
z-scores. The data was wrong.

**Rule.** On a conflict between the subject's direct report and a weak
derivation, **suspect the derivation first**. The person has ground truth about
their own week; keel has a partial, instrumented, blind-spotted proxy for it.
Investigate the metric before you explain away the human.

---

## 7. Know the blind spots before you conclude

keel observes a Mac browser, macOS app focus, and Claude Code. It does **not**
observe: phone, tablet, TV, other machines, or anything in a browser without the
extension. A confident statement about "your content consumption" from this log
is a statement about *desktop* consumption, and should say so.

---

## 8. A raw switch count is mostly transients

`app_switched` and the browser's domain switches both fire on *every* focus
change — launcher pops, notification steals, alt-tab flicker, a tab touched in
passing. Over 2026-06-12..08-07:

```
app dwells      n=14344   median  6s   66% under 15s
domain dwells   n= 7985   median  5s   67% under 15s
```

Two thirds of every "switch" is a glance nobody would describe as switching
tasks. Counting them inflated `Bout.switches` by **71%** — median 17 per bout
against 4 — and every fragmentation figure built on it by the same margin.
`tide`'s 20-switches/hour threshold was labelling **76% of bouts fragmented**,
which is a threshold that has stopped discriminating.

**Rule.** Put a floor under any duration-derived count before you count it.
`bouts.ts` uses `SWITCH_FLOOR_MS` (15s) and counts moves between domains that
each held past it. The boundary is not arbitrary: above 15s the median dwell is
42s, against Gloria Mark's published ~47s average screen dwell — two
independent instruments agreeing on where a real attention span starts.

The same caution applies to anything else derived from raw event counts. Ask
what fraction of the population is below the threshold of the thing you claim
to be measuring, *before* dividing by it.

---

## Statistical hygiene, briefly

The read-side constants in `event-taxonomy.md` (z-scores over rolling windows,
never absolute thresholds; ≤3 attention classes; ~21 days before personalization
beats population priors) are the floor, not the ceiling. Also:

- **Report `n`, always.** A z of +1.19 on `n=7` is a hint, not a result.
- **A z-score is not a significance test.** At `n≈19` the critical `r` is ≈0.46;
  an `r` of −0.35 is *not* significant however suggestive it looks.
- **Check the confound before reporting, not after.** Weekday/weekend alone
  reversed the direction of one finding here.
- **Test the arrow.** `work(D-1) → sleep(D)` and `sleep(D) → work(D)` are both
  computable. If the first is as strong as the second, the second is not
  evidence of anything.
- **Daily observations are autocorrelated.** Busy days cluster; so do bad
  nights. Independent-sample intuitions do not apply.

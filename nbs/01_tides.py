# %% [markdown]
# # Tides, day 1 — where did the attention go?
# Private EDA over ~13 days of keel logs. Question 1: time-by-domain per focus-day.
# Run cell-by-cell (VSCode / Jupyter). Nothing here leaves the machine.

# %%
import pandas as pd
from load import load, domain_time, alert_class

pd.set_option("display.max_rows", 60)
df = load()
df.surface.value_counts()

# %% [markdown]
# ## Q1 — time by domain, per focus-day
# The dependent variable the tide work needs a baseline for.

# %%
dt = domain_time(df)
# wide view: focus-day x top domains (minutes)
top = dt.groupby("domain").minutes.sum().sort_values(ascending=False).head(15).index
pivot = (dt[dt.domain.isin(top)]
         .pivot_table(index="focus_day", columns="domain", values="minutes", aggfunc="sum")
         .fillna(0).round(0))
pivot

# %% [markdown]
# ## Top-vice share per day — is the drift trending?
# The vice is derived from the data (heaviest `windowed` domain by focused time),
# never named in source — this file is committed to a public repo.

# %%
_windowed = dt[dt.domain.map(alert_class) == "windowed"]
TOP_VICE = _windowed.groupby("domain").minutes.sum().idxmax()
per_day = dt.groupby("focus_day").minutes.sum().rename("total")
vice = dt[dt.domain == TOP_VICE].groupby("focus_day").minutes.sum().rename("vice")
share = pd.concat([vice, per_day], axis=1).fillna(0)
share["vice_%"] = (100 * share.vice / share.total).round(0)
share.round(0)

# %%
ax = share["vice_%"].plot(kind="bar", figsize=(10, 3),
                          title="Top-vice % of browser focus, by focus-day")
ax.set_ylabel("% of focused browser time")

# %% [markdown]
# ## Q2 — focus-bout length (the tide's grain)
# A bout = a continuous focused stretch on one domain. Long bouts = flood,
# short scattered bouts = ebb/fragmentation. Classified by your configured
# watchlist: **windowed** (high-alert drift), **observe**, **other**.

# %%
from load import bouts
bt = bouts(df)
bt.groupby("alert").minutes.agg(["count", "median", "mean", "max"]).round(2)

# %% [markdown]
# ### CAVEAT — bouts are short (median <1m). Two readings, decide which:
# 1. **Real fragmentation** — you alt-tab between work and drift constantly (a true tide signal).
# 2. **Gating artefact** — `focus_end` fires on tab-blur and fullscreen video, chopping
#    one watch session into many bouts. Sanity-check below: a real YouTube binge should
#    show as few long bouts, not dozens of tiny ones.

# %%
# distribution of high-alert bout lengths
wb = bt[bt.alert == "windowed"]
ax = wb.minutes.clip(upper=20).plot(kind="hist", bins=40, figsize=(10, 3),
                                    title="High-alert (windowed) bout length, min (clipped 20m)")
ax.set_xlabel("minutes")
print("windowed bouts:", len(wb), "· total min:", round(wb.minutes.sum()),
      "· longest:", round(wb.minutes.max(), 1))

# %% [markdown]
# ### High-alert load per focus-day and per watch
# Where the tide ebbs: minutes on the windowed set, split by watch.

# %%
by_watch = (bt[bt.alert == "windowed"]
            .pivot_table(index="focus_day", columns="watch", values="minutes", aggfunc="sum")
            .reindex(columns=["morning", "afternoon", "evening", "night"]).fillna(0).round(0))
by_watch["TOTAL"] = by_watch.sum(axis=1)
by_watch

# %% [markdown]
# ## Q4 — video starts, binge runs, tab churn
# `video_started` is a clean count signal (163 in corpus); `video_ended` carries
# `seconds` but only ~23% of starts emit one, so watch-*time* per video is unreliable.
# What's solid: **start counts**, **run-length** (consecutive starts with no long gap),
# and **distinct tabs touched** (concurrency proxy — no tab-lifecycle event yet).

# %%
# Dominant video host, derived from the log rather than named in source (public repo).
# Isolating one host keeps the binge-run signal clean; several sites emit video_started.
VIDEO_HOST = df[df.kind == "video_started"].domain.value_counts().idxmax()
vids = df[(df.kind == "video_started") & (df.domain == VIDEO_HOST)].copy()
ends = df[(df.kind == "video_ended") & (df.domain == VIDEO_HOST)].copy()
print(f"video_started: {len(vids)} · video_ended(+seconds): {len(ends)} "
      f"· end/start ratio: {len(ends)/max(len(vids),1):.0%}")
vids.groupby("focus_day").size().rename("starts").to_frame().join(
    ends.groupby("focus_day").size().rename("ends")).fillna(0).astype(int)

# %% [markdown]
# ### Binge runs — consecutive starts with < gap_min between them
# Tests the v0-spec claim ("92% of shorts in runs of 5+"). A run breaks on a gap.

# %%
def runs(start_ts, gap_min=3):
    """Segment sorted start timestamps into runs; return list of run-lengths."""
    out, n, prev = [], 0, None
    for t in sorted(start_ts):
        if prev is not None and (t - prev) > gap_min * 60_000:
            out.append(n); n = 0
        n += 1; prev = t
    if n:
        out.append(n)
    return out

import pandas as pd
rl = pd.Series(runs(vids.ts), name="run_length")
in_runs_5plus = rl[rl >= 5].sum() / rl.sum() if rl.sum() else 0
print(f"{len(rl)} runs · lengths: {sorted(rl, reverse=True)[:12]} "
      f"· share of starts inside runs of 5+: {in_runs_5plus:.0%}")
rl.value_counts().sort_index()

# %% [markdown]
# ### Tab churn — distinct YouTube tabs touched per focus-day
# Concurrency proxy. (True "open at once" needs tab_opened/tab_closed — sensor gap,
# being added now.) High distinct-tab counts + short bouts = fragmented foraging.

# %%
(df[df.domain.isin(yt_domains)].dropna(subset=["tab"])
 .groupby("focus_day").tab.nunique().rename("distinct_yt_tabs"))

# %% [markdown]
# # The flood — agent deep-work rhythm (research-anchored)
# The browser half above is the **ebb** (drift). This half is the **flood**: deep-work
# bouts on the agent surface. Each hypothesis traces to a graded row in
# `docs/references/attention-research-basis.md` — we lean on **strong** rows, pre-flag
# **weak** ones. Claim discipline: circadian = strong, ultradian (~90m BRAC) = weak.
#
# - **H1** flood is *separable* from the ebb (fragmentation is in the drift, not the work). ← "behavior fragmented" (strong)
# - **H2** floods routinely exceed the **23-min** re-entry horizon → a clock-slam mid-flood is a real interrupt. ← Mark 2008 (very strong)
# - **H3** natural breakpoints are frequent enough to *arm at* instead of the clock. ← breakpoint deferral, ~78% (works)
# - **H4** the flood has a **nocturnal tail** the late self can't self-assess → Ulysses pact. ← sleep-dep, unaware (strong)
# - **H5** flood timing has a **stable circadian signature** keel can baseline (the feasibility core). ← circadian (strong)
# - **H6** *(pre-flagged WEAK)* bouts cluster near a ~90-min ultradian period. ← claim discipline: do NOT assert

# %%
from load import agent_bouts
ab = agent_bouts(df)
ab["hour"] = pd.to_datetime(ab.start, unit="ms").dt.hour
print(f"{len(ab)} agent bouts across {ab.focus_day.nunique()} focus-days")
ab.minutes.describe().round(1)

# %% [markdown]
# ## H1 — flood is separable from the ebb
# Side-by-side bout-length summary: agent (flood) vs browser windowed drift (ebb).
# Support = agent right tail dwarfs the ebb (long deep-work runs are real, drift is chopped).

# %%
ebb = bouts(df)
ebb = ebb[ebb.alert == "windowed"]
cmp = pd.DataFrame({
    "agent_flood": ab.minutes.describe(),
    "browser_ebb": ebb.minutes.describe(),
}).round(2)
print(cmp)
ax = ab.minutes.clip(upper=90).plot(kind="hist", bins=45, figsize=(10, 3),
                                    title="Agent deep-work bout length, min (clipped 90m)")
ax.set_xlabel("minutes")

# %% [markdown]
# ## H2 — floods exceed the 23-min interruption-recovery horizon (Mark 2008)
# If a large share of deep-work *time* sits inside bouts longer than 23 min, then any
# clock-driven friction landing mid-bout pays the full ~23-min re-entry cost. That is the
# quantitative case for breakpoint-arming over clock-slamming.

# %%
RECOVERY_MIN = 23
long = ab[ab.minutes > RECOVERY_MIN]
share_time = long.minutes.sum() / ab.minutes.sum() if ab.minutes.sum() else 0
print(f"bouts > {RECOVERY_MIN}m: {len(long)}/{len(ab)} "
      f"({len(long)/len(ab):.0%} of bouts) but {share_time:.0%} of all deep-work time")
print(f"longest: {ab.minutes.max():.0f}m · total flood-time in long bouts: {long.minutes.sum():.0f}m")

# %% [markdown]
# ## H3 — breakpoints frequent enough to arm at (Iqbal & Bailey, ~78%)
# Within-session gaps between activity (here: the gaps we segmented on, plus turn_stop
# spacing) are candidate breakpoints. If the typical wait to the next breakpoint is short,
# arming-at-breakpoint has low latency — the HCI win is reachable. If breakpoints are
# 20-30m apart inside floods, arming forces slam-now-or-wait-forever.

# %%
# inter-event gaps within agent sessions (minutes); the long ones are breakpoints
ag = df[(df.surface == "agent") &
        (df.kind.isin(["tool_dispatched", "tool_completed", "tool_failed", "prompt", "subagent_stop", "turn_stop"]))]
ag = ag.sort_values(["sessionId", "ts"])
gaps = ag.groupby("sessionId").ts.diff().dropna() / 60000
gaps = gaps[gaps > 0]
print("within-session gap percentiles (min):")
print(gaps.quantile([.5, .75, .9, .95, .99]).round(2))
print(f"gaps > 5m (true breakpoints): {sum(gaps > 5)} · turn_stops: {sum(df.kind=='turn_stop')}")

# %% [markdown]
# ## H4 — nocturnal tail (sleep-dep; the late self can't self-assess)
# Deep-work minutes by watch and by hour. A tail extending into the **night** watch is the
# Ulysses-pact justification. NOTE the standing tension: the browser ebb peaked in the
# *afternoon*, challenging keel's night-lock. Does the flood agree or disagree?

# %%
by_watch = (ab.pivot_table(index="focus_day", columns="watch", values="minutes", aggfunc="sum")
            .reindex(columns=["morning", "afternoon", "evening", "night"]).fillna(0).round(0))
by_watch["TOTAL"] = by_watch.sum(axis=1)
print(by_watch)
print("\nflood-minutes share by watch:")
print((ab.groupby("watch").minutes.sum() / ab.minutes.sum() * 100).round(0))

# %% [markdown]
# ## H5 — stable circadian signature (the feasibility core)
# Deep-work minutes by hour-of-day, summed across all focus-days. A repeatable peak/trough
# = a baseline keel can read. Flat/chaotic = no tide to recognize (the antagonist).

# %%
by_hour = ab.groupby("hour").minutes.sum()
ax = by_hour.plot(kind="bar", figsize=(11, 3), title="Agent deep-work minutes by hour-of-day (all days)")
ax.set_ylabel("flood minutes")
ax.set_xlabel("hour")
# per-day spread at the peak hour — is the peak stable or driven by one day?
peak_h = by_hour.idxmax()
spread = ab[ab.hour == peak_h].groupby("focus_day").minutes.sum()
print(f"peak hour = {peak_h}h · {by_hour.max():.0f} min total · "
      f"present on {spread.gt(0).sum()}/{ab.focus_day.nunique()} days (stability check)")

# %% [markdown]
# ## H6 — ultradian ~90m clustering? (PRE-FLAGGED WEAK — do not assert)
# Per claim discipline we expect NO clean 90m mode; bout length is set by the task, not
# biology. Reported only to keep the negative honest.

# %%
near90 = ab[(ab.minutes >= 75) & (ab.minutes <= 105)]
print(f"bouts in 75-105m band: {len(near90)}/{len(ab)} ({len(near90)/len(ab):.0%}) "
      f"— verdict: {'no 90m mode (weak as expected)' if len(near90)/len(ab) < 0.15 else 'inspect further'}")
ab.minutes.plot(kind="hist", bins=60, figsize=(10, 3), title="Bout length — is there a 90m bump? (claim: no)")

# %% [markdown]
# ## The tide — flood (agent) over ebb (browser drift), one focus-day
# The payoff overlay. Pick the day with the most deep work; lay agent bouts (flood) and
# browser windowed bouts (ebb) on one clock. Separation in time = a readable tide.

# %%
import matplotlib.pyplot as plt
day = ab.groupby("focus_day").minutes.sum().idxmax()
af = ab[ab.focus_day == day]
eb = ebb[ebb.focus_day == day]
fig, axx = plt.subplots(figsize=(12, 2.4))
def _h(ts):
    d = pd.to_datetime(ts, unit="ms"); return d.hour + d.minute / 60
for r in af.itertuples():
    axx.barh(1, _h(r.end) - _h(r.start), left=_h(r.start), height=0.6, color="#2c7", alpha=.8)
for r in eb.itertuples():
    axx.barh(0, _h(r.end) - _h(r.start), left=_h(r.start), height=0.6, color="#c33", alpha=.8)
axx.set_yticks([0, 1]); axx.set_yticklabels(["ebb (drift)", "flood (work)"])
axx.set_xlim(4, 28); axx.set_xlabel("hour (focus-day, 04:00→04:00)")
axx.set_title(f"The tide — {day}")
print(f"{day}: flood {af.minutes.sum():.0f}m / {len(af)} bouts · ebb {eb.minutes.sum():.0f}m / {len(eb)} bouts")

# %% [markdown]
# ## Still open (stubs)
# - **Q6 intention vs reality** — do `keel intention` declarations line up with the flood's cwd/timing? (tests personalization: high-work-control → intention-alignment beats quotas)
# - **(after sensor patch)** browser active-watch via `video_paused`, true concurrency via `tab_opened/closed`.

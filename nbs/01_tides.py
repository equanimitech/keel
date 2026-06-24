# %% [markdown]
# # Tides, day 1 — where did the attention go?
# Private EDA over ~13 days of keel logs. Question 1: time-by-domain per focus-day.
# Run cell-by-cell (VSCode / Jupyter). Nothing here leaves the machine.

# %%
import pandas as pd
from load import load, domain_time

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
# ## YouTube share per day — is the drift trending?

# %%
per_day = dt.groupby("focus_day").minutes.sum().rename("total")
yt = dt[dt.domain == "youtube.com"].groupby("focus_day").minutes.sum().rename("youtube")
share = pd.concat([yt, per_day], axis=1).fillna(0)
share["yt_%"] = (100 * share.youtube / share.total).round(0)
share.round(0)

# %%
ax = share["yt_%"].plot(kind="bar", figsize=(10, 3), title="YouTube % of browser focus, by focus-day")
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
yt_domains = {"youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
vids = df[(df.kind == "video_started") & (df.domain.isin(yt_domains))].copy()
ends = df[(df.kind == "video_ended") & (df.domain.isin(yt_domains))].copy()
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
# ## Next questions (stubs)
# - **Q5 fragmentation by hour** — bout count / switch-rate across the day.
# - **Q6 intention vs reality** — do `keel intention` declarations line up with the bouts?
# - **(after sensor patch)** active-watch via `video_paused`, true concurrency via `tab_opened/closed`.

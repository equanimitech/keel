/**
 * Areas — your history, grouped the way you would describe it.
 *
 * A rewrite of the ranked list (2026-08-06). The list answered "which domains
 * do I have", which is a sorting question, while every time it was opened the
 * question actually being asked was "what did I do" — and an aggregate with no
 * *when* cannot answer that. So: browser history, better grouped.
 *
 * Better grouped means `runs()` rather than page loads. Fifty YouTube
 * navigations become `19:09–21:10 · 1h 4m`, and a glance at another tab neither
 * earns its own row nor shreds the session it interrupted.
 *
 * Sorting did not go away, it became contextual: every row carries the area
 * picker, so you assign a site while looking at the evening you spent on it.
 * That is a better prompt than a list of 137 domains with no memory attached.
 *
 * The store answers; this page keeps nothing. `queryEvents` reads
 * `~/.keel/log`, which the tray and agent also write to — one history, no copy
 * to drift.
 */

import { runs } from "@keel/domain";
import { toJsonl, exportFileName } from "@/modules/activity/events";
import { readAllEvents } from "@/modules/activity/log";
import { areaMap, areas, type AreaInfo } from "@/modules/friction/policy/store";
import { queryEvents, setArea } from "@/modules/relay/client";
import {
  breakdown,
  byDay,
  byWeek,
  clock,
  dayLabel,
  dwellLabel,
  weekLabel,
  type AreaSlice,
  type DayGroup,
  type WeekGroup,
} from "@/modules/friction/areas/days";
import {
  DEFAULT_SCOPE,
  narrower,
  scopeById,
  scopeSince,
  wider,
  type Scope,
} from "@/modules/friction/areas/scope";
import { storage } from "wxt/storage";
import "./style.css";

const root = document.getElementById("areas-root");

/** The chosen scope, so the page opens where you left it. */
const scopePref = storage.defineItem<string>("local:areas:scope", { fallback: DEFAULT_SCOPE });

/**
 * Which groups are open. Keyed `w:<ts>` / `d:<ts>` because a Monday's day-start
 * and its week-start are the same instant, and collapsing them would fold a
 * week whenever its Monday was clicked.
 */
const expanded = new Set<string>();

function toggle(key: string): void {
  if (expanded.has(key)) {
    expanded.delete(key);
  } else {
    expanded.add(key);
  }
  void render();
}

/**
 * A folded group's shape, in area colour.
 *
 * A total says how long you were online; the colours say which life it was.
 * Area colour is the one sanctioned channel in the design grammar, so a stacked
 * bar carries the summary with no legend and no second number — and two folded
 * rows compare at a glance instead of by arithmetic.
 */
function summaryBar(slices: readonly AreaSlice[], fill = 1): HTMLElement {
  const outer = document.createElement("span");
  outer.className = "summary-track";
  const bar = document.createElement("span");
  bar.className = "summary-bar";
  // Width relative to the busiest group in view, so magnitude is visible at a
  // glance. Proportion alone made a twenty-minute day and a twelve-hour day
  // draw identical bars — the shape was right and the scale was a lie.
  bar.style.width = `${Math.max(fill * 100, 1).toFixed(1)}%`;
  for (const slice of slices) {
    // Below this a segment is a sliver nobody can read or hover.
    if (slice.share < 0.02) {
      continue;
    }
    const seg = document.createElement("span");
    seg.className = slice.color === "" ? "summary-seg is-unsorted" : "summary-seg";
    seg.style.width = `${(slice.share * 100).toFixed(1)}%`;
    if (slice.color !== "") {
      seg.style.background = slice.color;
    }
    seg.title = `${slice.name} · ${dwellLabel(slice.dwellMs)}`;
    bar.appendChild(seg);
  }
  outer.appendChild(bar);
  return outer;
}

/**
 * Per-area totals for a group, at whatever zoom it sits.
 *
 * The bar shows shape; this names it. Together they answer "which life was
 * this week" without expanding anything — the rollup a scope-level summary
 * exists to give.
 */
function rollupLine(slices: readonly AreaSlice[]): HTMLElement {
  const line = document.createElement("div");
  line.className = "group-rollup";
  const parts: string[] = [];
  for (const slice of slices) {
    if (slice.share < 0.02) {
      continue;
    }
    parts.push(`${slice.name} ${dwellLabel(slice.dwellMs)}`);
  }
  line.textContent = parts.join("  ·  ");
  return line;
}

/** A collapsible header: label, colour summary, total. */
function groupHead(
  label: string,
  slices: readonly AreaSlice[],
  dwellMs: number,
  open: boolean,
  level: "week" | "day",
  fill: number,
  onToggle: () => void
): HTMLElement {
  const head = document.createElement("button");
  head.className = `group-head is-${level}${open ? " is-open" : ""}`;
  head.type = "button";
  head.setAttribute("aria-expanded", String(open));

  const name = document.createElement("span");
  name.className = "group-label";
  name.textContent = label;

  const total = document.createElement("span");
  total.className = "group-total";
  total.textContent = dwellLabel(dwellMs);

  head.append(name, summaryBar(slices, fill), total);
  head.addEventListener("click", onToggle);

  const wrap = document.createElement("div");
  wrap.className = "group-head-wrap";
  wrap.append(head, rollupLine(slices));
  return wrap;
}

/** Chromium's own favicon cache. No network request, no host permission. */
function faviconUrl(domain: string): string {
  const url = new URL(browser.runtime.getURL("/_favicon/" as never));
  url.searchParams.set("pageUrl", `https://${domain}`);
  url.searchParams.set("size", "32");
  return url.toString();
}

function areaOption(area: AreaInfo): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = area.id;
  option.textContent = `${area.emoji} ${area.name}`.trim();
  return option;
}

/** One thing you did: when, how long, where, and which part of your life. */
function runRow(
  start: number,
  end: number,
  dwellMs: number,
  domain: string,
  allAreas: readonly AreaInfo[],
  map: Readonly<Record<string, string>>,
  onAssign: (domain: string, areaId: string) => void
): HTMLElement {
  const li = document.createElement("li");
  li.className = "run-row";

  const area = allAreas.find((a) => a.id === map[domain]);
  // The area's colour, and the only colour on the page — a viewer must be able
  // to name which area anything coloured belongs to (kairos/kernel/areas.md).
  if (area?.color) {
    li.style.borderLeftColor = area.color;
    li.classList.add("has-area");
  }

  const time = document.createElement("span");
  time.className = "run-time";
  time.textContent = `${clock(start)}–${clock(end)}`;

  const dwell = document.createElement("span");
  dwell.className = "run-dwell";
  dwell.textContent = dwellLabel(dwellMs);
  // The span can exceed the dwell: a merged sitting covers its detours while
  // its time counts only this domain. Both facts stay available.
  const spanMin = Math.round((end - start) / 60_000);
  const dwellMin = Math.round(dwellMs / 60_000);
  dwell.title =
    spanMin > dwellMin
      ? `${dwellMin}m here, across a ${spanMin}m stretch that included short detours`
      : `${dwellMin}m here`;

  const icon = document.createElement("img");
  icon.className = "run-icon";
  icon.src = faviconUrl(domain);
  icon.alt = "";
  icon.width = 16;
  icon.height = 16;
  icon.addEventListener("error", () => icon.classList.add("is-blank"));

  const name = document.createElement("span");
  name.className = "run-name";
  name.textContent = domain;

  const select = document.createElement("select");
  select.className = "run-select";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "—";
  select.appendChild(none);
  for (const a of allAreas) {
    select.appendChild(areaOption(a));
  }
  select.value = map[domain] ?? "";
  select.addEventListener("change", () => onAssign(domain, select.value));

  li.append(time, dwell, icon, name, select);
  return li;
}

interface Ctx {
  readonly scope: Scope;
  readonly allAreas: readonly AreaInfo[];
  readonly map: Readonly<Record<string, string>>;
  readonly onAssign: (domain: string, areaId: string) => void;
}

function daySection(group: DayGroup, ctx: Ctx, forceOpen: boolean, peak: number): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = "day-section";
  const key = `d:${group.startOfDay}`;
  const open = forceOpen || expanded.has(key);

  wrap.appendChild(
    groupHead(
      dayLabel(group.startOfDay),
      breakdown(group.runs, ctx.map, ctx.allAreas),
      group.dwellMs,
      open,
      "day",
      peak > 0 ? group.dwellMs / peak : 0,
      () => toggle(key)
    )
  );

  if (open) {
    const ul = document.createElement("ul");
    ul.className = "run-list";
    for (const r of group.runs) {
      ul.appendChild(
        runRow(r.startTs, r.endTs, r.dwellMs, r.domain, ctx.allAreas, ctx.map, ctx.onAssign)
      );
    }
    wrap.appendChild(ul);
  }
  return wrap;
}

function weekSection(group: WeekGroup, ctx: Ctx, peak: number): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = "week-section";
  const key = `w:${group.startOfWeek}`;
  const open = expanded.has(key);

  const runs = group.days.flatMap((d) => [...d.runs]);
  wrap.appendChild(
    groupHead(
      weekLabel(group.startOfWeek),
      breakdown(runs, ctx.map, ctx.allAreas),
      group.dwellMs,
      open,
      "week",
      peak > 0 ? group.dwellMs / peak : 0,
      () => toggle(key)
    )
  );

  if (open) {
    const inner = document.createElement("div");
    inner.className = "week-days";
    const dayPeak = Math.max(...group.days.map((d) => d.dwellMs), 1);
    for (const day of group.days) {
      inner.appendChild(daySection(day, ctx, false, dayPeak));
    }
    wrap.appendChild(inner);
  }
  return wrap;
}

/**
 * Zoom, not tabs.
 *
 * One axis with a step either way, because that is what the control does: the
 * same life at a coarser or finer grain. Three labelled tabs implied three
 * unrelated views; `−  this week  +` says there is one view and you are
 * standing at a distance from it.
 */
function zoomControl(current: Scope): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "zoom-control";

  const step = (target: Scope | null, glyph: string, title: string): HTMLElement => {
    const btn = document.createElement("button");
    btn.className = "zoom-btn";
    btn.type = "button";
    btn.textContent = glyph;
    btn.title = title;
    btn.disabled = target === null;
    if (target !== null) {
      btn.addEventListener("click", () => {
        expanded.clear();
        void scopePref.setValue(target.id).then(() => render());
      });
    }
    return btn;
  };

  const label = document.createElement("span");
  label.className = "zoom-label";
  label.textContent = current.label;

  // Out widens the window (less detail); in narrows it (more).
  wrap.append(
    step(wider(current), "−", "Zoom out"),
    label,
    step(narrower(current), "+", "Zoom in")
  );
  return wrap;
}

/** Everything on this page came off this machine and stays on it. */
function localNote(): HTMLElement {
  const p = document.createElement("p");
  p.className = "local-note";
  p.textContent =
    "Read from your own log on this machine. Nothing here is uploaded, synced, or shared.";
  return p;
}

async function render(): Promise<void> {
  if (root === null) {
    return;
  }
  root.replaceChildren();

  const scope = scopeById(await scopePref.getValue());
  const [allAreas, map, events] = await Promise.all([
    areas.getValue(),
    areaMap.getValue(),
    queryEvents(scopeSince(scope, Date.now())),
  ]);

  root.appendChild(zoomControl(scope));
  root.appendChild(localNote());

  if (allAreas.length === 0) {
    const empty = document.createElement("p");
    empty.className = "areas-empty";
    empty.textContent =
      "No areas yet. Areas are defined in zenborg and read from ~/.kairos/areas.json.";
    root.appendChild(empty);
    return;
  }

  const days = byDay(runs(events));
  if (days.length === 0) {
    const empty = document.createElement("p");
    empty.className = "areas-empty";
    empty.textContent =
      scope.id === "day" ? "Nothing yet today." : `Nothing recorded in ${scope.phrase}.`;
    root.appendChild(empty);
    return;
  }

  // Optimistic: update the mirror so the row responds, then reconcile with the
  // host. A picker that waits on a round-trip feels broken.
  const onAssign = (domain: string, areaId: string): void => {
    void (async () => {
      const current = await areaMap.getValue();
      const next = { ...current };
      if (areaId === "") {
        delete next[domain];
      } else {
        next[domain] = areaId;
      }
      await areaMap.setValue(next);
      await setArea(domain, areaId);
      await render();
    })();
  };

  const ctx: Ctx = { scope, allAreas, map, onAssign };

  // The zoom decides the unit: a day of runs, a week of days, a month of weeks.
  // Each level folds into a colour summary, so widening the scope trades detail
  // for shape rather than producing a longer list.
  if (scope.id === "month" || scope.id === "all") {
    const weeks = byWeek(days);
    const peak = Math.max(...weeks.map((w) => w.dwellMs), 1);
    for (const week of weeks) {
      root.appendChild(weekSection(week, ctx, peak));
    }
  } else {
    const peak = Math.max(...days.map((d) => d.dwellMs), 1);
    for (const group of days) {
      root.appendChild(daySection(group, ctx, scope.id === "day", peak));
    }
  }
}

// ── Activity log export (local download only — a Blob URL, no network) ──

const exportBtn = document.getElementById("export-log-btn") as HTMLButtonElement | null;
const exportStatus = document.getElementById("export-log-status");

async function exportLog(): Promise<void> {
  if (!exportBtn || !exportStatus) {
    return;
  }
  exportBtn.disabled = true;
  exportStatus.textContent = "reading log…";
  try {
    const events = await readAllEvents();
    const blob = new Blob([toJsonl(events)], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportFileName(Date.now());
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    exportStatus.textContent = `${events.length} events exported`;
  } catch {
    exportStatus.textContent = "export failed";
  } finally {
    exportBtn.disabled = false;
  }
}

exportBtn?.addEventListener("click", () => void exportLog());

void render();

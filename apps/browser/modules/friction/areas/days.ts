/**
 * Group runs into days — the spine of the history view.
 *
 * Pure. Everything here is arithmetic over what `runs()` already derived.
 *
 * Days rather than a continuous scroll because a day is the unit a person
 * recalls in. "Wednesday" is a thing you can check against memory; "the 41
 * hours ending now" is not.
 */

import type { Run } from "../../domain";

export interface DayGroup {
  /** Local midnight of the day, as the stable key and sort value. */
  readonly startOfDay: number;
  /** Attended ms across the day. */
  readonly dwellMs: number;
  /** Chronological within the day — earliest first, as history reads. */
  readonly runs: readonly Run[];
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Group runs by local day, newest day first.
 *
 * Days descend because the recent past is what you check; runs *within* a day
 * ascend because a day is read forwards. Browser history does the same, and it
 * is right for the same reason.
 */
export function byDay(runs: readonly Run[]): readonly DayGroup[] {
  const groups = new Map<number, Run[]>();
  for (const run of runs) {
    const key = startOfLocalDay(run.startTs);
    const list = groups.get(key);
    if (list === undefined) {
      groups.set(key, [run]);
    } else {
      list.push(run);
    }
  }

  const out: DayGroup[] = [];
  for (const [startOfDay, list] of groups) {
    let dwellMs = 0;
    for (const run of list) {
      dwellMs += run.dwellMs;
    }
    out.push({
      startOfDay,
      dwellMs,
      runs: [...list].sort((a, b) => a.startTs - b.startTs),
    });
  }
  return out.sort((a, b) => b.startOfDay - a.startOfDay);
}

/** "Today" / "Yesterday" / "Wednesday 5 August" — recall beats precision. */
export function dayLabel(startOfDay: number, now: number = Date.now()): string {
  const today = startOfLocalDay(now);
  const day = 24 * 60 * 60 * 1000;
  if (startOfDay === today) {
    return "Today";
  }
  if (startOfDay === today - day) {
    return "Yesterday";
  }
  return new Date(startOfDay).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Compact duration. Blank at zero, never "0m" — absence is not a measurement. */
export function dwellLabel(ms: number): string {
  if (ms <= 0) {
    return "";
  }
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** `14:18` — no seconds; a run boundary is never that precise anyway. */
export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ── Weeks ────────────────────────────────────────────────────────
// The unit above a day, so a month zoom has something to be an index OF.
// Without it, "month" is thirty day-headers, which is a list rather than a
// summary.

export interface WeekGroup {
  /** Local midnight of the Monday, as key and sort value. */
  readonly startOfWeek: number;
  readonly dwellMs: number;
  readonly days: readonly DayGroup[];
}

/** Monday. ISO, and the week a European actually plans in. */
function startOfLocalWeek(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // Sunday(0) → 6, Monday(1) → 0
  d.setDate(d.getDate() - shift);
  return d.getTime();
}

/** Group days into weeks, newest first, days inside kept newest-first too. */
export function byWeek(days: readonly DayGroup[]): readonly WeekGroup[] {
  const groups = new Map<number, DayGroup[]>();
  for (const day of days) {
    const key = startOfLocalWeek(day.startOfDay);
    const list = groups.get(key);
    if (list === undefined) {
      groups.set(key, [day]);
    } else {
      list.push(day);
    }
  }
  const out: WeekGroup[] = [];
  for (const [startOfWeek, list] of groups) {
    let dwellMs = 0;
    for (const day of list) {
      dwellMs += day.dwellMs;
    }
    out.push({
      startOfWeek,
      dwellMs,
      days: [...list].sort((a, b) => b.startOfDay - a.startOfDay),
    });
  }
  return out.sort((a, b) => b.startOfWeek - a.startOfWeek);
}

/** "This week" / "Last week" / "27 Jul – 2 Aug". */
export function weekLabel(startOfWeek: number, now: number = Date.now()): string {
  const thisWeek = startOfLocalWeek(now);
  const week = 7 * 24 * 60 * 60 * 1000;
  if (startOfWeek === thisWeek) {
    return "This week";
  }
  if (startOfWeek === thisWeek - week) {
    return "Last week";
  }
  const end = new Date(startOfWeek + 6 * 24 * 60 * 60 * 1000);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${new Date(startOfWeek).toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

// ── Colour summary ───────────────────────────────────────────────

export interface AreaSlice {
  /** Null for domains with no area yet. */
  readonly areaId: string | null;
  readonly name: string;
  /** Empty when unassigned; the renderer supplies a neutral. */
  readonly color: string;
  readonly dwellMs: number;
  /** 0..1 of the group's total — the bar's width. */
  readonly share: number;
}

export interface AreaLike {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly color?: string;
}

/**
 * What a collapsed group was made of, as area slices.
 *
 * This is what lets a folded week say something. A total tells you how long you
 * were online; the colours tell you *which life* it was — and since area colour
 * is the one sanctioned channel in the design grammar, a stacked bar is legible
 * without a legend or a number.
 *
 * Largest first, so the bar reads dominant-to-marginal and comparing two
 * collapsed rows is a glance rather than a calculation.
 */
export function breakdown(
  runs: readonly Run[],
  areaMap: Readonly<Record<string, string>>,
  areas: readonly AreaLike[]
): readonly AreaSlice[] {
  const byArea = new Map<string | null, number>();
  let total = 0;
  for (const run of runs) {
    const id = areaMap[run.domain] ?? null;
    byArea.set(id, (byArea.get(id) ?? 0) + run.dwellMs);
    total += run.dwellMs;
  }
  if (total === 0) {
    return [];
  }
  const out: AreaSlice[] = [];
  for (const [areaId, dwellMs] of byArea) {
    const area = areaId === null ? undefined : areas.find((a) => a.id === areaId);
    out.push({
      areaId,
      name: area ? `${area.emoji} ${area.name}`.trim() : "unsorted",
      color: area?.color ?? "",
      dwellMs,
      share: dwellMs / total,
    });
  }
  return out.sort((a, b) => b.dwellMs - a.dwellMs);
}

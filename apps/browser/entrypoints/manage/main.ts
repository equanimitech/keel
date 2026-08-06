/**
 * Areas page — sort your own history into the parts of your life.
 *
 * Replaces the Watchlist/Blocklist tabs (2026-08-06). Those asked you to type
 * domains into a list; this shows you where your attention actually went and
 * asks only where each site belongs. The work is the same, but the page brings
 * the evidence instead of a blank field.
 *
 * Ranked by attended dwell so the biggest pulls come first — an alphabetical
 * list makes you find the important ones yourself.
 *
 * Assignments are written through the native host into `~/.keel/area-map.json`,
 * the same file the tray and MCP read. The extension holds a mirror, never the
 * source.
 */

import { bouts } from "@keel/domain";
import { toJsonl, exportFileName } from "@/modules/activity/events";
import { readAllEvents, readEventsSince } from "@/modules/activity/log";
import { areaMap, areas, type AreaInfo } from "@/modules/friction/policy/store";
import { setArea } from "@/modules/relay/client";
import { visitsByDomain, type VisitInventory } from "@/modules/friction/areas/history";
import {
  dwellLabel,
  partition,
  rollup,
  visitsLabel,
  type DomainRow,
} from "@/modules/friction/areas/rollup";
import "./style.css";

const root = document.getElementById("areas-root");

/**
 * How far back dwell is reported.
 *
 * Must stay inside the local retention guard (MAX_LOG_EVENTS ≈ 100 days at
 * current rates) or the page would claim a window the store cannot cover —
 * which is the failure this page was rebuilt to remove.
 */
const DWELL_WINDOW_DAYS = 30;
const DWELL_WINDOW_MS = DWELL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Chromium's own favicon cache. No network request, no host permission.
 *
 * `/_favicon/` is a browser-provided path rather than a bundled asset, so WXT's
 * `PublicPath` union — derived from files in the output — cannot include it.
 * The cast is the only way to reach it.
 */
function faviconUrl(domain: string): string {
  const url = new URL(browser.runtime.getURL("/_favicon/" as never));
  url.searchParams.set("pageUrl", `https://${domain}`);
  url.searchParams.set("size", "32");
  return url.toString();
}

/**
 * Attended ms per domain over the dwell window, via the shared derivation.
 *
 * Bounded by `DWELL_WINDOW_MS` so the number matches the label it is shown
 * under. It previously read the whole store and was displayed unlabelled,
 * which invited being read as all-time — and the store had been emptied by the
 * relay, so it was neither.
 */
async function dwellByDomain(now: number = Date.now()): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const bout of bouts(await readEventsSince(now - DWELL_WINDOW_MS))) {
    for (const [domain, ms] of bout.byDomain) {
      out[domain] = (out[domain] ?? 0) + ms;
    }
  }
  return out;
}

function areaOption(area: AreaInfo): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = area.id;
  option.textContent = `${area.emoji} ${area.name}`.trim();
  return option;
}

function buildRow(
  row: DomainRow,
  allAreas: readonly AreaInfo[],
  onAssign: (key: string, areaId: string) => void,
  keyOverride?: string
): HTMLElement {
  const key = keyOverride ?? row.domain;
  const li = document.createElement("li");
  li.className = "area-row";

  const icon = document.createElement("img");
  icon.className = "area-row-icon";
  icon.src = faviconUrl(row.domain);
  icon.alt = "";
  icon.width = 16;
  icon.height = 16;
  // A missing favicon is normal (never visited in this profile, or no icon).
  icon.addEventListener("error", () => icon.classList.add("is-blank"));

  const name = document.createElement("span");
  name.className = "area-row-name";
  name.textContent = key;

  // Two numbers, two windows, each stated. Neither is readable without its
  // window: "38m" of what period was the whole complaint.
  const stats = document.createElement("span");
  stats.className = "area-row-stats";

  const visits = document.createElement("span");
  visits.className = "area-row-visits";
  if (row.visits > 0) {
    visits.textContent = visitsLabel(row.visits);
    visits.title = "All-time visits, from browser history";
  }

  const dwell = document.createElement("span");
  if (row.hasActivity) {
    dwell.className = "area-row-dwell";
    dwell.textContent = dwellLabel(row.dwellMs);
    dwell.title = `Attended time in the last ${DWELL_WINDOW_DAYS} days, measured by keel`;
  } else {
    // Absence, not a zero. A "0m" implies a measurement was taken and came
    // back empty; this domain simply has no activity in the window.
    dwell.className = "area-row-dwell is-quiet";
    dwell.textContent = "no recent activity";
    dwell.title = `Nothing in the last ${DWELL_WINDOW_DAYS} days`;
  }

  stats.append(visits, dwell);

  const select = document.createElement("select");
  select.className = "area-row-select";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "—";
  select.appendChild(none);
  for (const area of allAreas) {
    select.appendChild(areaOption(area));
  }
  select.value = row.areaId ?? "";
  select.addEventListener("change", () => onAssign(key, select.value));

  li.append(icon, name, stats, select);
  if (!row.hasActivity) {
    li.classList.add("is-inventory");
  }
  return li;
}

async function render(): Promise<void> {
  if (root === null) {
    return;
  }
  root.replaceChildren();

  const [allAreas, map, dwell, inventory] = await Promise.all([
    areas.getValue(),
    areaMap.getValue(),
    dwellByDomain(),
    visitsByDomain(),
  ]);

  if (allAreas.length === 0) {
    const empty = document.createElement("p");
    empty.className = "areas-empty";
    empty.textContent =
      "No areas yet. Areas are defined in zenborg and read from ~/.kairos/areas.json.";
    root.appendChild(empty);
    return;
  }

  root.appendChild(legend(inventory));

  const rows = rollup(dwell, map, inventory.counts);
  const { assigned, unsorted } = partition(rows);

  // Optimistic: update the mirror immediately so the list responds, and let the
  // host's reply reconcile. A dropdown that waits on a round-trip feels broken.
  const onAssign = (key: string, areaId: string): void => {
    void (async () => {
      const current = await areaMap.getValue();
      const next = { ...current };
      if (areaId === "") {
        delete next[key];
      } else {
        next[key] = areaId;
      }
      await areaMap.setValue(next);
      await setArea(key, areaId);
      await render();
    })();
  };

  for (const area of allAreas) {
    const list = assigned.get(area.id);
    if (list === undefined || list.length === 0) {
      continue;
    }
    root.appendChild(
      section(`${area.emoji} ${area.name}`.trim(), `${list.length} sites`, list, allAreas, onAssign, false, area.color)
    );
  }

  if (unsorted.length > 0) {
    root.appendChild(
      section("Unsorted", `${unsorted.length} sites`, unsorted, allAreas, onAssign, true)
    );
  }
}

/**
 * States what the two columns mean, once, at the top.
 *
 * The page's original fault was an unlabelled number. Per-row tooltips help
 * on hover; this makes the windows legible on a scan, which is what an
 * Operate surface needs.
 */
function legend(inventory: VisitInventory): HTMLElement {
  const p = document.createElement("p");
  p.className = "areas-legend";
  p.textContent = inventory.available
    ? `Visits are all-time, from browser history. Time is attended time in the last ${DWELL_WINDOW_DAYS} days, measured by keel.`
    : `Time is attended time in the last ${DWELL_WINDOW_DAYS} days, measured by keel. Browser history is unavailable, so all-time visits are not shown.`;

  if (inventory.truncated) {
    // Never let a capped list read as a complete one.
    const warn = document.createElement("span");
    warn.className = "areas-legend-warn";
    warn.textContent = " Showing the most recent slice of history — older sites may be missing.";
    p.appendChild(warn);
  }
  return p;
}

function section(
  title: string,
  count: string,
  rows: readonly DomainRow[],
  allAreas: readonly AreaInfo[],
  onAssign: (key: string, areaId: string) => void,
  isUnsorted = false,
  color?: string
): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = isUnsorted ? "area-section is-unsorted" : "area-section";

  const head = document.createElement("div");
  head.className = "area-section-head";
  const h2 = document.createElement("h2");
  // The area's own colour, and the only colour on the page. A viewer must be
  // able to name which area anything coloured belongs to (areas.md).
  if (color !== undefined && color !== "") {
    const dot = document.createElement("span");
    dot.className = "area-dot";
    dot.style.background = color;
    h2.appendChild(dot);
  }
  h2.appendChild(document.createTextNode(title));
  const badge = document.createElement("span");
  badge.className = "area-section-count";
  badge.textContent = count;
  head.append(h2, badge);

  const ul = document.createElement("ul");
  ul.className = "area-list";
  for (const row of rows) {
    ul.appendChild(buildRow(row, allAreas, onAssign));
    // A path that disagrees with its host is shown nested — the split case.
    for (const path of row.paths) {
      const nested = buildRow(
        {
          ...row,
          dwellMs: path.dwellMs,
          visits: 0, // visits are per-host; a path has no separate all-time count
          hasActivity: path.dwellMs > 0,
          areaId: path.areaId,
          paths: [],
        },
        allAreas,
        onAssign,
        path.key
      );
      nested.classList.add("is-path");
      ul.appendChild(nested);
    }
  }

  wrap.append(head, ul);
  return wrap;
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

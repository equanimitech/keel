/**
 * Manage page — the browser surface's two self-authored lists + export.
 *
 * Watchlist: the observe tier (deep sensors). Mirror of
 * `~/.keel/config.json` `watchlist.observe` — extensions can't read the
 * filesystem, so keep the two in sync by hand until a relay exists.
 *
 * Blocklist: the drogue (commitment device) — the one survivor of the
 * 2026-06-12 intervention retirement.
 */

import { SEED_BLOCKED_DOMAINS } from "@/modules/drogues/blocklist/seed";
import {
  addDomain,
  removeDomain,
  userBlockedDomains,
} from "@/modules/drogues/blocklist/store";
import {
  addObserveDomain,
  observeDomains,
  removeObserveDomain,
} from "@/modules/watchlist/store";
import { toJsonl, exportFileName } from "@/modules/activity/events";
import { readAllEvents } from "@/modules/activity/log";
import "./style.css";

// ── Tab switching ─────────────────────────────────────────────────

const tabButtons = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
for (const btn of tabButtons) {
  btn.addEventListener("click", () => {
    for (const other of tabButtons) {
      other.classList.toggle("active", other === btn);
    }
    for (const panel of document.querySelectorAll(".tab-content")) {
      panel.classList.toggle("active", panel.id === `tab-${btn.dataset.tab}`);
    }
  });
}

// ── Shared add-row + list rendering for a domain list ─────────────

interface DomainListSpec {
  readonly panel: HTMLElement;
  readonly intro: string;
  readonly addLabel: string;
  readonly placeholder: string;
  readonly entries: () => Promise<{ domain: string; removable: boolean; tag?: string }[]>;
  readonly add: (input: string) => Promise<string | null>;
  readonly remove: (domain: string) => Promise<void>;
}

async function renderDomainList(spec: DomainListSpec): Promise<void> {
  spec.panel.replaceChildren();

  const intro = document.createElement("p");
  intro.className = "budget-intro";
  intro.textContent = spec.intro;
  spec.panel.appendChild(intro);

  const addRow = document.createElement("div");
  addRow.className = "blocklist-add";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "number-input blocklist-input";
  input.placeholder = spec.placeholder;
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;

  const addBtn = document.createElement("button");
  addBtn.className = "blocklist-add-btn";
  addBtn.textContent = spec.addLabel;

  const err = document.createElement("span");
  err.className = "blocklist-err";

  async function submit(): Promise<void> {
    err.textContent = "";
    const result = await spec.add(input.value);
    if (result === null) {
      err.textContent = "not a valid domain";
      return;
    }
    input.value = "";
    await renderDomainList(spec);
  }

  addBtn.addEventListener("click", () => void submit());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      void submit();
    }
  });

  addRow.appendChild(input);
  addRow.appendChild(addBtn);
  spec.panel.appendChild(addRow);
  spec.panel.appendChild(err);

  const list = document.createElement("div");
  list.className = "blocklist-items";

  for (const { domain, removable, tag } of await spec.entries()) {
    const item = document.createElement("div");
    item.className = "blocklist-item";

    const name = document.createElement("span");
    name.className = "blocklist-domain";
    name.textContent = domain;
    item.appendChild(name);

    if (tag !== undefined) {
      const tagEl = document.createElement("span");
      tagEl.className = "blocklist-tag";
      tagEl.textContent = tag;
      item.appendChild(tagEl);
    }
    if (removable) {
      const remove = document.createElement("button");
      remove.className = "blocklist-remove";
      remove.textContent = "remove";
      remove.addEventListener("click", async () => {
        await spec.remove(domain);
        await renderDomainList(spec);
      });
      item.appendChild(remove);
    }

    list.appendChild(item);
  }

  spec.panel.appendChild(list);
}

// ── Watchlist (observe tier — deep sensors) ───────────────────────

const watchlistSpec: DomainListSpec = {
  panel: document.getElementById("watchlist-panel")!,
  intro:
    "Domains that get deep sensors (opens, key actions, durations). " +
    "Self-authored — keel never adds entries. Mirror of " +
    "~/.keel/config.json watchlist.observe; keep them in sync until the relay exists.",
  addLabel: "Observe",
  placeholder: "add a domain (e.g. youtube.com)",
  entries: async () => {
    const domains = await observeDomains.getValue();
    return domains.map((domain) => ({ domain, removable: true }));
  },
  add: addObserveDomain,
  remove: removeObserveDomain,
};

// ── Blocklist (drogue — commitment device) ────────────────────────

const blocklistSpec: DomainListSpec = {
  panel: document.getElementById("blocklist-panel")!,
  intro:
    "Full-drag targets. Page never loads — f = 1, no skip. " +
    "Holds in incognito once you allow keel there.",
  addLabel: "Block",
  placeholder: "add a domain (e.g. example.com)",
  entries: async () => {
    const user = await userBlockedDomains.getValue();
    return [
      ...SEED_BLOCKED_DOMAINS.map((domain) => ({
        domain,
        removable: false,
        tag: "seed · edit in code",
      })),
      ...user.map((domain) => ({ domain, removable: true })),
    ];
  },
  add: addDomain,
  remove: removeDomain,
};

// ── Activity log export (transport stopgap until the desktop relay) ──
// Local download only: a Blob URL on this extension page — no network.

const exportBtn = document.getElementById(
  "export-log-btn"
) as HTMLButtonElement | null;
const exportStatus = document.getElementById("export-log-status");

async function exportLog(): Promise<void> {
  if (!exportBtn || !exportStatus) {
    return;
  }
  exportBtn.disabled = true;
  exportStatus.textContent = "reading log…";
  try {
    const events = await readAllEvents();
    const blob = new Blob([toJsonl(events)], {
      type: "application/x-ndjson",
    });
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

// ── Init ──────────────────────────────────────────────────────────

void renderDomainList(watchlistSpec);
void renderDomainList(blocklistSpec);

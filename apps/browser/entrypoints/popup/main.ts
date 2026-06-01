import { shields } from "@/modules/shields/registry";
import { signals } from "@/modules/signals/registry";
import { shieldEnabled, signalEnabled, domainCooldown } from "@/utils/storage";

// ── Unified intervention type for popup rendering ─────────────────

type Intervention = {
  id: string;
  name: string;
  description: string;
  domain: string;
  icon: string;
  defaultEnabled: boolean;
  kind: "shield" | "signal";
  getStore: () => ReturnType<typeof shieldEnabled>;
};

const allInterventions: Intervention[] = [
  ...shields.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    domain: s.domain,
    icon: s.icon,
    defaultEnabled: s.defaultEnabled,
    kind: "shield" as const,
    getStore: () => shieldEnabled(s.id, s.defaultEnabled),
  })),
  ...signals.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    domain: s.domain,
    icon: s.icon,
    defaultEnabled: s.defaultEnabled,
    kind: "signal" as const,
    getStore: () => signalEnabled(s.id, s.defaultEnabled),
  })),
];

// ── Cooldown options ─────────────────────────────────────────────

const COOLDOWN_OPTIONS = [
  { label: "5m", seconds: 5 * 60 },
  { label: "10m", seconds: 10 * 60 },
  { label: "15m", seconds: 15 * 60 },
  { label: "30m", seconds: 30 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "1d", seconds: 24 * 60 * 60 },
  { label: "3d", seconds: 3 * 24 * 60 * 60 },
  { label: "7d", seconds: 7 * 24 * 60 * 60 },
];

/** Domains that support cooldown. */
const COOLDOWN_DOMAINS = ["chess.com", "youtube.com", "linkedin.com"];

// ── Group interventions by domain ─────────────────────────────────

type DomainGroup = { domain: string; interventions: Intervention[] };

function groupByDomain(items: Intervention[]): DomainGroup[] {
  const map = new Map<string, Intervention[]>();
  for (const item of items) {
    const arr = map.get(item.domain) ?? [];
    arr.push(item);
    map.set(item.domain, arr);
  }
  return [...map.entries()].map(([domain, interventions]) => ({
    domain,
    interventions,
  }));
}

// ── Current tab domain detection ──────────────────────────────────

async function getCurrentDomain(): Promise<string> {
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.url) {
      return new URL(tab.url).hostname.replace(/^www\./, "");
    }
  } catch (e) {
    console.error("[keel] popup: failed to query active tab", e);
  }
  return "";
}

// ── DOM references ────────────────────────────────────────────────

const cooldownSection = document.getElementById("cooldown-section")!;
const shieldList = document.getElementById("shield-list")!;
const emptyState = document.getElementById("empty-state")!;
const manageLink = document.getElementById("manage-link")!;

manageLink.addEventListener("click", () => {
  browser.tabs.create({ url: browser.runtime.getURL("/manage.html") });
  window.close();
});

// ── Cooldown section ──────────────────────────────────────────────

let cooldownInterval: ReturnType<typeof setInterval> | null = null;

async function renderCooldown(currentDomain: string): Promise<void> {
  // Find the matching cooldown domain
  const matchedDomain = COOLDOWN_DOMAINS.find((d) =>
    currentDomain.includes(d)
  );
  if (!matchedDomain) return;

  const store = domainCooldown(matchedDomain);
  const until = await store.getValue();
  const isActive = until > Date.now();

  const card = document.createElement("div");
  card.className = "cooldown-card";

  // Header row
  const header = document.createElement("div");
  header.className = "cooldown-header";

  const icon = document.createElement("span");
  icon.className = "cooldown-icon";
  icon.textContent = "\u23F8"; // ⏸

  const title = document.createElement("span");
  title.className = "cooldown-title";
  title.textContent = "Cooldown";

  const timerEl = document.createElement("span");
  timerEl.className = "cooldown-timer-display";

  header.appendChild(icon);
  header.appendChild(title);
  header.appendChild(timerEl);
  card.appendChild(header);

  // Actions area
  const actions = document.createElement("div");
  actions.className = "cooldown-actions";
  card.appendChild(actions);

  cooldownSection.appendChild(card);

  // ── Render state ───────────────────────────────────────────
  function renderState(active: boolean, remaining: number): void {
    actions.innerHTML = "";
    timerEl.textContent = "";

    if (active && remaining > 0) {
      card.classList.add("cooldown-card--active");
      timerEl.textContent = formatTime(remaining);

      // No cancel — cooldown is non-bypassable
      const info = document.createElement("span");
      info.style.fontSize = "11px";
      info.style.color = "#64748b";
      info.textContent = "Cooldown active — take a break.";
      actions.appendChild(info);
    } else {
      card.classList.remove("cooldown-card--active");

      for (const opt of COOLDOWN_OPTIONS) {
        const btn = document.createElement("button");
        btn.className = "cooldown-option";
        btn.textContent = opt.label;
        btn.addEventListener("click", async () => {
          const newUntil = Date.now() + opt.seconds * 1000;
          await store.setValue(newUntil);
          renderState(true, opt.seconds);
        });
        actions.appendChild(btn);
      }
    }
  }

  // Initial render
  const remaining = isActive ? Math.ceil((until - Date.now()) / 1000) : 0;
  renderState(isActive, remaining);

  // Tick the timer while popup is open
  cooldownInterval = setInterval(async () => {
    const now = Date.now();
    const currentUntil = await store.getValue();
    if (currentUntil > now) {
      const secs = Math.ceil((currentUntil - now) / 1000);
      timerEl.textContent = formatTime(secs);
    } else if (card.classList.contains("cooldown-card--active")) {
      // Cooldown just expired
      renderState(false, 0);
    }
  }, 1000);
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "0s";

  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts: string[] = [];
  if (d > 0) { parts.push(`${d}d`); }
  if (h > 0) { parts.push(`${h}h`); }
  if (m > 0) { parts.push(`${m}m`); }
  if (s > 0 || parts.length === 0) { parts.push(`${s}s`); }
  return parts.join(" ");
}

// ── Rendering ─────────────────────────────────────────────────────

async function render(): Promise<void> {
  const currentDomain = await getCurrentDomain();

  // Cooldown section (above interventions)
  await renderCooldown(currentDomain);

  const groups = groupByDomain(allInterventions);
  const matchingGroups = groups.filter((g) =>
    currentDomain.includes(g.domain)
  );

  if (matchingGroups.length === 0) {
    emptyState.style.display = "block";
    emptyState.textContent = currentDomain
      ? `No interventions for ${currentDomain}`
      : "Navigate to a site to see interventions";
    return;
  }

  emptyState.style.display = "none";

  for (const group of matchingGroups) {
    shieldList.appendChild(renderDomainGroup(group));
  }
}

// ── Domain group component ────────────────────────────────────────

type ToggleEntry = { intervention: Intervention; input: HTMLInputElement };

function renderDomainGroup(group: DomainGroup): HTMLElement {
  const section = document.createElement("section");
  section.className = "domain-group";

  // ── Header ──────────────────────────────────────────────────
  const header = document.createElement("div");
  header.className = "domain-header";

  const headerLeft = document.createElement("div");
  headerLeft.className = "domain-header-left";

  const domainLabel = document.createElement("span");
  domainLabel.className = "domain-label";
  domainLabel.textContent = group.domain;

  const countBadge = document.createElement("span");
  countBadge.className = "active-count";
  countBadge.textContent = `0/${group.interventions.length}`;

  headerLeft.appendChild(domainLabel);
  headerLeft.appendChild(countBadge);

  const allToggle = createToggle(`all-${group.domain}`);
  header.appendChild(headerLeft);
  header.appendChild(allToggle.label);
  section.appendChild(header);

  // ── Individual intervention rows ────────────────────────────
  const toggles: ToggleEntry[] = [];

  for (const intervention of group.interventions) {
    const row = document.createElement("div");
    row.className = "shield-row";

    const info = document.createElement("div");
    info.className = "shield-info";

    const nameRow = document.createElement("div");
    nameRow.className = "shield-name-row";

    const nameEl = document.createElement("span");
    nameEl.className = "shield-name";
    nameEl.textContent = `${intervention.icon} ${intervention.name}`;

    const kindBadge = document.createElement("span");
    kindBadge.className = `kind-badge ${intervention.kind}`;
    kindBadge.textContent = intervention.kind;

    nameRow.appendChild(nameEl);
    nameRow.appendChild(kindBadge);

    const descEl = document.createElement("span");
    descEl.className = "shield-desc";
    descEl.textContent = intervention.description;

    info.appendChild(nameRow);
    info.appendChild(descEl);

    const toggle = createToggle(intervention.id);
    row.appendChild(info);
    row.appendChild(toggle.label);
    section.appendChild(row);

    toggles.push({ intervention, input: toggle.input });
  }

  // ── Wire up storage ─────────────────────────────────────────

  function syncDomainToggle(): void {
    const enabledCount = toggles.filter(({ input }) => input.checked).length;
    allToggle.input.checked = enabledCount === toggles.length;
    countBadge.textContent = `${enabledCount}/${toggles.length}`;
    countBadge.classList.toggle("all-active", enabledCount === toggles.length);
  }

  for (const { intervention, input } of toggles) {
    const store = intervention.getStore();

    store.getValue().then((value) => {
      input.checked = value;
      syncDomainToggle();
    });

    input.addEventListener("change", async () => {
      await store.setValue(input.checked);
      syncDomainToggle();
    });

    store.watch((value) => {
      input.checked = value;
      syncDomainToggle();
    });
  }

  // "Enable all" toggle logic.
  allToggle.input.addEventListener("change", async () => {
    const newState = allToggle.input.checked;
    for (const { intervention, input } of toggles) {
      input.checked = newState;
      await intervention.getStore().setValue(newState);
    }
    syncDomainToggle();
  });

  return section;
}

// ── Toggle helper ─────────────────────────────────────────────────

function createToggle(id: string): {
  label: HTMLLabelElement;
  input: HTMLInputElement;
} {
  const label = document.createElement("label");
  label.className = "switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = `toggle-${id}`;

  const slider = document.createElement("span");
  slider.className = "slider";

  label.appendChild(input);
  label.appendChild(slider);

  return { label, input };
}

// ── Init ──────────────────────────────────────────────────────────
render();

import { shields } from "@/modules/shields/registry";
import { signals } from "@/modules/signals/registry";
import {
  shieldEnabled,
  shieldSetting,
  signalEnabled,
  signalSetting,
  budgetDefinition,
} from "@/utils/storage";
import type {
  BudgetDimension,
  BudgetDefinition,
  SessionUnit,
} from "@/modules/budgets/types";
import { createBudgetDefinition } from "@/modules/budgets/types";
import { SEED_BLOCKED_DOMAINS } from "@/modules/drogues/blocklist/seed";
import {
  userBlockedDomains,
  addDomain,
  removeDomain,
} from "@/modules/drogues/blocklist/store";
import "./style.css";

// ── Unified intervention type ─────────────────────────────────────

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

// ── Watch time settings ──────────────────────────────────────────

type WatchTimePosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
const watchTimePositionStore = signalSetting<WatchTimePosition>(
  "youtube-watch-time",
  "position",
  "bottom-right"
);

const tunnelMinStore = signalSetting<number>("youtube-stain", "tunnel-min-minutes", 5);
const tunnelMaxStore = signalSetting<number>("youtube-stain", "tunnel-max-minutes", 60);

const POSITIONS: { value: WatchTimePosition; label: string }[] = [
  { value: "top-left", label: "\u2196" },
  { value: "top-right", label: "\u2197" },
  { value: "bottom-left", label: "\u2199" },
  { value: "bottom-right", label: "\u2198" },
];

// ── Chess cooldown settings ────────────────────────────────────

const cooldownSecondsStore = shieldSetting<number>(
  "chess-post-game-cooldown",
  "cooldown-seconds",
  30
);
const escalateOnLossStore = shieldSetting<boolean>(
  "chess-post-game-cooldown",
  "escalate-on-loss",
  true
);

// ── Budget configuration per domain ────────────────────────────

type AvailableDimension = {
  kind: BudgetDimension["kind"];
  label: string;
  unitLabel: string;
  min: number;
  max: number;
  defaultValue: number;
  sessionUnit?: SessionUnit;
};

const DOMAIN_BUDGET_CONFIG: Record<string, AvailableDimension[]> = {
  "chess.com": [
    {
      kind: "sessions-per-day",
      label: "Games per day",
      unitLabel: "games",
      min: 1,
      max: 50,
      defaultValue: 5,
      sessionUnit: "game",
    },
    {
      kind: "time-per-day",
      label: "Time per day",
      unitLabel: "min",
      min: 5,
      max: 480,
      defaultValue: 60,
    },
    {
      kind: "days-per-week",
      label: "Days per week",
      unitLabel: "days",
      min: 1,
      max: 7,
      defaultValue: 5,
    },
  ],
  "youtube.com": [
    {
      kind: "time-per-day",
      label: "Time per day",
      unitLabel: "min",
      min: 5,
      max: 480,
      defaultValue: 60,
    },
    {
      kind: "sessions-per-day",
      label: "Videos per day",
      unitLabel: "videos",
      min: 1,
      max: 100,
      defaultValue: 10,
      sessionUnit: "video",
    },
    {
      kind: "days-per-week",
      label: "Days per week",
      unitLabel: "days",
      min: 1,
      max: 7,
      defaultValue: 5,
    },
  ],
};

// ── Tab switching ───────────────────────────────────────────────

const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
const tabContents = document.querySelectorAll<HTMLElement>(".tab-content");

for (const btn of tabBtns) {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
    tabContents.forEach((c) =>
      c.classList.toggle("active", c.id === `tab-${tab}`)
    );
  });
}

// ── Group by domain ───────────────────────────────────────────────

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

// ── DOM ───────────────────────────────────────────────────────────

const domainList = document.getElementById("domain-list")!;
const budgetsList = document.getElementById("budgets-list")!;

async function render(): Promise<void> {
  const groups = groupByDomain(allInterventions);

  for (const group of groups) {
    domainList.appendChild(await renderDomainGroup(group));
  }
}

// ── Domain group component ────────────────────────────────────────

type ToggleEntry = { intervention: Intervention; input: HTMLInputElement };

async function renderDomainGroup(group: DomainGroup): Promise<HTMLElement> {
  const section = document.createElement("section");
  section.className = "domain-group";

  // ── Header ──────────────────────────────────────────────────
  const header = document.createElement("div");
  header.className = "domain-header";

  const headerLeft = document.createElement("div");
  headerLeft.className = "domain-header-left";
  headerLeft.style.cursor = "pointer";

  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.textContent = "\u25B8";

  const domainLabel = document.createElement("span");
  domainLabel.className = "domain-label";
  domainLabel.textContent = group.domain;

  const countBadge = document.createElement("span");
  countBadge.className = "active-count";
  countBadge.textContent = `0/${group.interventions.length}`;

  headerLeft.appendChild(chevron);
  headerLeft.appendChild(domainLabel);
  headerLeft.appendChild(countBadge);

  const allToggle = createToggle(`all-${group.domain}`);
  header.appendChild(headerLeft);
  header.appendChild(allToggle.label);
  section.appendChild(header);

  // ── Collapsible body ────────────────────────────────────────
  const body = document.createElement("div");
  body.className = "domain-body";

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
    body.appendChild(row);

    if (intervention.id === "youtube-watch-time") {
      const settingsPanel = document.createElement("div");
      settingsPanel.className = "settings-panel";

      const store = intervention.getStore();
      store.getValue().then((v) => settingsPanel.classList.toggle("hidden", !v));
      toggle.input.addEventListener("change", () => {
        settingsPanel.classList.toggle("hidden", !toggle.input.checked);
      });
      store.watch((v) => settingsPanel.classList.toggle("hidden", !v));

      // ── Position picker ───────────────────────────────────────
      const posRow = document.createElement("div");
      posRow.className = "settings-row";

      const posLabel = document.createElement("span");
      posLabel.className = "settings-label";
      posLabel.textContent = "Timer position";

      const posGroup = document.createElement("div");
      posGroup.className = "position-picker";

      const currentPosition = await watchTimePositionStore.getValue();

      for (const pos of POSITIONS) {
        const btn = document.createElement("button");
        btn.className = `pos-btn${pos.value === currentPosition ? " active" : ""}`;
        btn.textContent = pos.label;
        btn.title = pos.value;
        btn.addEventListener("click", async () => {
          await watchTimePositionStore.setValue(pos.value);
          posGroup.querySelectorAll(".pos-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        });
        posGroup.appendChild(btn);
      }

      posRow.appendChild(posLabel);
      posRow.appendChild(posGroup);
      settingsPanel.appendChild(posRow);
      body.appendChild(settingsPanel);
    }

    // ── Settings panel for stain (nested under toggle) ────
    if (intervention.id === "youtube-stain") {
      const settingsPanel = document.createElement("div");
      settingsPanel.className = "settings-panel";

      const store = intervention.getStore();
      store.getValue().then((v) => settingsPanel.classList.toggle("hidden", !v));
      toggle.input.addEventListener("change", () => {
        settingsPanel.classList.toggle("hidden", !toggle.input.checked);
      });
      store.watch((v) => settingsPanel.classList.toggle("hidden", !v));

      // ── Tunnel time range ─────────────────────────────────────
      const timeRow = document.createElement("div");
      timeRow.className = "settings-row";

      const timeLabel = document.createElement("span");
      timeLabel.className = "settings-label";
      timeLabel.textContent = "Stain range (min)";

      const timeGroup = document.createElement("div");
      timeGroup.className = "time-range-picker";

      const currentMin = await tunnelMinStore.getValue();
      const currentMax = await tunnelMaxStore.getValue();

      const minInput = createNumberInput("stain-starts-at", "Starts at", currentMin);
      const maxInput = createNumberInput("stain-full-at", "Full at", currentMax);

      minInput.input.addEventListener(
        "input",
        debounce(async () => {
          const val = Math.max(0, parseInt(minInput.input.value, 10) || 0);
          await tunnelMinStore.setValue(val);
        }, 400),
      );

      maxInput.input.addEventListener(
        "input",
        debounce(async () => {
          const val = Math.max(1, parseInt(maxInput.input.value, 10) || 1);
          await tunnelMaxStore.setValue(val);
        }, 400),
      );

      timeGroup.appendChild(minInput.wrapper);
      timeGroup.appendChild(maxInput.wrapper);
      timeRow.appendChild(timeLabel);
      timeRow.appendChild(timeGroup);
      settingsPanel.appendChild(timeRow);
      body.appendChild(settingsPanel);
    }

    // ── Settings panel for chess cooldown (nested under toggle) ────
    if (intervention.id === "chess-post-game-cooldown") {
      const settingsPanel = document.createElement("div");
      settingsPanel.className = "settings-panel";

      const store = intervention.getStore();
      store
        .getValue()
        .then((v) => settingsPanel.classList.toggle("hidden", !v));
      toggle.input.addEventListener("change", () => {
        settingsPanel.classList.toggle("hidden", !toggle.input.checked);
      });
      store.watch((v) => settingsPanel.classList.toggle("hidden", !v));

      // ── Cooldown seconds ──────────────────────────────────────
      const cdRow = document.createElement("div");
      cdRow.className = "settings-row";

      const cdLabel = document.createElement("span");
      cdLabel.className = "settings-label";
      cdLabel.textContent = "Cooldown (seconds)";

      const currentCd = await cooldownSecondsStore.getValue();
      const cdInput = createNumberInput("cooldown-secs", "Seconds", currentCd);
      cdInput.input.min = "5";
      cdInput.input.max = "300";

      cdInput.input.addEventListener(
        "input",
        debounce(async () => {
          const val = Math.max(
            5,
            Math.min(300, parseInt(cdInput.input.value, 10) || 30)
          );
          await cooldownSecondsStore.setValue(val);
        }, 400)
      );

      cdRow.appendChild(cdLabel);
      cdRow.appendChild(cdInput.wrapper);
      settingsPanel.appendChild(cdRow);

      // ── Escalate on loss toggle ─────────────────────────────
      const lossRow = document.createElement("div");
      lossRow.className = "settings-row";

      const lossLabel = document.createElement("span");
      lossLabel.className = "settings-label";
      lossLabel.textContent = "Double on loss";

      const lossToggle = createToggle("escalate-on-loss");
      const currentEscalate = await escalateOnLossStore.getValue();
      lossToggle.input.checked = currentEscalate;
      lossToggle.input.addEventListener("change", async () => {
        await escalateOnLossStore.setValue(lossToggle.input.checked);
      });

      lossRow.appendChild(lossLabel);
      lossRow.appendChild(lossToggle.label);
      settingsPanel.appendChild(lossRow);

      body.appendChild(settingsPanel);
    }

    toggles.push({ intervention, input: toggle.input });
  }

  section.appendChild(body);

  // ── Collapse / expand ───────────────────────────────────────
  headerLeft.addEventListener("click", () => {
    section.classList.toggle("collapsed");
  });

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

// ── Budgets tab rendering ──────────────────────────────────────────

async function renderBudgets(): Promise<void> {
  // Motto
  const intro = document.createElement("p");
  intro.className = "budget-intro";
  intro.textContent = "Compass, not cage. Set aspirational limits per domain.";
  budgetsList.appendChild(intro);

  const domains = Object.keys(DOMAIN_BUDGET_CONFIG);

  for (const domain of domains) {
    const card = await renderBudgetCard(
      domain,
      DOMAIN_BUDGET_CONFIG[domain]
    );
    budgetsList.appendChild(card);
  }
}

async function renderBudgetCard(
  domain: string,
  dimensions: AvailableDimension[]
): Promise<HTMLElement> {
  const store = budgetDefinition<BudgetDefinition | null>(domain, null);
  const current = await store.getValue();

  const card = document.createElement("section");
  card.className = "budget-card";

  // Header
  const header = document.createElement("div");
  header.className = "budget-card-header";
  header.textContent = domain;
  card.appendChild(header);

  // Dimension rows
  const inputs: { dim: AvailableDimension; input: HTMLInputElement }[] = [];

  for (const dim of dimensions) {
    const row = document.createElement("div");
    row.className = "budget-row";

    const label = document.createElement("span");
    label.className = "budget-label";
    label.textContent = dim.label;

    const inputGroup = document.createElement("div");
    inputGroup.className = "budget-input-group";

    const input = document.createElement("input");
    input.type = "number";
    input.className = "number-input";
    input.min = String(dim.min);
    input.max = String(dim.max);
    input.placeholder = "\u2014"; // em dash

    // Load current value
    const currentDim = current?.dimensions.find((d) => d.kind === dim.kind);
    if (currentDim) {
      const val =
        currentDim.kind === "time-per-day" || currentDim.kind === "session-duration"
          ? currentDim.limitMinutes
          : currentDim.limit;
      input.value = String(val);
    }

    const unit = document.createElement("span");
    unit.className = "budget-unit";
    unit.textContent = dim.unitLabel;

    inputGroup.appendChild(input);
    inputGroup.appendChild(unit);

    row.appendChild(label);
    row.appendChild(inputGroup);
    card.appendChild(row);

    inputs.push({ dim, input });

    // Save on change
    input.addEventListener(
      "input",
      debounce(async () => {
        await saveBudget(domain, inputs, store);
      }, 600)
    );
  }

  return card;
}

async function saveBudget(
  domain: string,
  inputs: { dim: AvailableDimension; input: HTMLInputElement }[],
  store: ReturnType<typeof budgetDefinition<BudgetDefinition | null>>
): Promise<void> {
  const dimensions: BudgetDimension[] = [];

  for (const { dim, input } of inputs) {
    const val = parseInt(input.value, 10);
    if (isNaN(val) || val <= 0) continue;

    switch (dim.kind) {
      case "days-per-week":
        dimensions.push({ kind: "days-per-week", limit: Math.min(val, 7) });
        break;
      case "time-per-day":
        dimensions.push({ kind: "time-per-day", limitMinutes: val });
        break;
      case "sessions-per-day":
        dimensions.push({
          kind: "sessions-per-day",
          limit: val,
          unit: dim.sessionUnit!,
        });
        break;
      case "sessions-per-week":
        dimensions.push({
          kind: "sessions-per-week",
          limit: val,
          unit: dim.sessionUnit!,
        });
        break;
    }
  }

  if (dimensions.length > 0) {
    await store.setValue(createBudgetDefinition(domain, dimensions));
  } else {
    await store.setValue(null);
  }
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

// ── Number input helper ───────────────────────────────────────────

function createNumberInput(
  id: string,
  label: string,
  value: number
): { wrapper: HTMLElement; input: HTMLInputElement } {
  const wrapper = document.createElement("div");
  wrapper.className = "number-field";

  const labelEl = document.createElement("label");
  labelEl.className = "number-label";
  labelEl.htmlFor = `input-${id}`;
  labelEl.textContent = label;

  const input = document.createElement("input");
  input.type = "number";
  input.id = `input-${id}`;
  input.className = "number-input";
  input.min = "0";
  input.value = String(value);

  wrapper.appendChild(labelEl);
  wrapper.appendChild(input);

  return { wrapper, input };
}

// ── Debounce helper ───────────────────────────────────────────────

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── Blocklist tab rendering ────────────────────────────────────────

const blocklistPanel = document.getElementById("blocklist-panel")!;

async function renderBlocklist(): Promise<void> {
  blocklistPanel.replaceChildren();

  const intro = document.createElement("p");
  intro.className = "budget-intro";
  intro.textContent =
    "Full-drag targets. Page never loads — f = 1, no skip. Holds in incognito once you allow keel there.";
  blocklistPanel.appendChild(intro);

  // ── Add row ─────────────────────────────────────────────────
  const addRow = document.createElement("div");
  addRow.className = "blocklist-add";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "number-input blocklist-input";
  input.placeholder = "add a domain (e.g. example.com)";
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;

  const addBtn = document.createElement("button");
  addBtn.className = "blocklist-add-btn";
  addBtn.textContent = "Block";

  const err = document.createElement("span");
  err.className = "blocklist-err";

  async function submit(): Promise<void> {
    err.textContent = "";
    const result = await addDomain(input.value);
    if (result === null) {
      err.textContent = "not a valid domain";
      return;
    }
    input.value = "";
    await renderBlocklist();
  }

  addBtn.addEventListener("click", () => void submit());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      void submit();
    }
  });

  addRow.appendChild(input);
  addRow.appendChild(addBtn);
  blocklistPanel.appendChild(addRow);
  blocklistPanel.appendChild(err);

  // ── Current list ────────────────────────────────────────────
  const user = await userBlockedDomains.getValue();
  const list = document.createElement("div");
  list.className = "blocklist-items";

  const entries: { domain: string; seed: boolean }[] = [
    ...SEED_BLOCKED_DOMAINS.map((d) => ({ domain: d, seed: true })),
    ...user.map((d) => ({ domain: d, seed: false })),
  ];

  for (const { domain, seed } of entries) {
    const item = document.createElement("div");
    item.className = "blocklist-item";

    const name = document.createElement("span");
    name.className = "blocklist-domain";
    name.textContent = domain;
    item.appendChild(name);

    if (seed) {
      const tag = document.createElement("span");
      tag.className = "blocklist-tag";
      tag.textContent = "seed · edit in code";
      tag.title = "Defined in seed.ts — remove there + rebuild (deliberate friction)";
      item.appendChild(tag);
    } else {
      const remove = document.createElement("button");
      remove.className = "blocklist-remove";
      remove.textContent = "remove";
      remove.addEventListener("click", async () => {
        await removeDomain(domain);
        await renderBlocklist();
      });
      item.appendChild(remove);
    }

    list.appendChild(item);
  }

  blocklistPanel.appendChild(list);
}

// ── Init ──────────────────────────────────────────────────────────
render();
renderBudgets();
renderBlocklist();

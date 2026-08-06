# YouTube Watch Time Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix cross-tab watch time accumulation, make the stain independently toggleable, and increase max stain opacity.

**Architecture:** Three changes to the existing YouTube watch time content script. The cross-tab fix adds a re-read on visibility change. The stain toggle adds a new storage key and decouples stain lifecycle from counter lifecycle. The manage page gets a stain toggle in the existing watch time settings panel.

**Tech Stack:** WXT content scripts, `wxt/storage`, vanilla TS DOM for manage page.

---

### Task 1: Fix cross-tab sync — re-read on visibility change

**Files:**
- Modify: `apps/browser/entrypoints/youtube-watch-time.content/index.ts:408-412`

**Step 1: Update `handleVisibility` to re-read storage when tab becomes visible**

Replace the current `handleVisibility` function:

```ts
async function handleVisibility(): Promise<void> {
  if (document.hidden) {
    dailySecondsStore.setValue(dailySeconds);
  } else {
    // Catch up with time accumulated by other tabs while we were hidden.
    const stored = await dailySecondsStore.getValue();
    if (stored > dailySeconds) {
      dailySeconds = stored;
      updateDisplay();
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/browser/entrypoints/youtube-watch-time.content/index.ts
git commit -m "fix(signals): re-read stored watch time on tab visibility change

Fixes cross-tab accumulation bug where switching tabs lost time
counted by other tabs (last-writer-wins race condition)."
```

---

### Task 2: Bump stain max opacity

**Files:**
- Modify: `apps/browser/entrypoints/youtube-watch-time.content/index.ts:87`

**Step 1: Change `BLOB_ALPHA_MAX` from `0.92` to `0.96`**

```ts
const BLOB_ALPHA_MAX = 0.96; // core opacity at t→∞
```

**Step 2: Commit**

```bash
git add apps/browser/entrypoints/youtube-watch-time.content/index.ts
git commit -m "feat(signals): increase stain max opacity to 0.96"
```

---

### Task 3: Add stain-enabled storage key and decouple stain lifecycle

**Files:**
- Modify: `apps/browser/entrypoints/youtube-watch-time.content/index.ts`

**Step 1: Add the `stainEnabledStore` storage item**

After the existing `tunnelMaxStore` declaration (around line 68), add:

```ts
export const stainEnabledStore = signalSetting<boolean>(
  youtubeWatchTime.id,
  "stain-enabled",
  true
);
```

**Step 2: Track stain state independently in `activate`/`deactivate`**

Add a module-level variable alongside the existing state:

```ts
let stainActive = false;
```

Extract stain creation/removal into helper functions:

```ts
function activateStain(): void {
  if (stainActive || !active) return;
  stainActive = true;
  randomizeBlobPosition();
  stainEl = document.createElement("div");
  stainEl.className = "equanimi-watch-stain";
  stainEl.style.left = `${blobX}%`;
  stainEl.style.top = `${blobY}%`;

  const player = findPlayerContainer();
  if (player) {
    player.appendChild(stainEl);
  } else {
    document.body.appendChild(stainEl);
    waitForPlayer();
  }
  updateDisplay();
}

function deactivateStain(): void {
  if (!stainActive) return;
  stainActive = false;
  stainEl?.remove();
  stainEl = null;
}
```

**Step 3: Update `createOverlay` to only create the counter; stain creation deferred**

The counter always gets created when the signal is enabled. The stain depends on `stainEnabledStore`:

```ts
async function createOverlay(): Promise<void> {
  const position = await positionStore.getValue();

  // Counter lives on body — visible in the page corner at all times.
  counterEl = document.createElement("div");
  counterEl.className = "equanimi-watch-counter";
  counterEl.textContent = "0:00";
  counterEl.dataset.position = position;
  document.body.appendChild(counterEl);

  // Stain creation depends on its own toggle.
  const stainOn = await stainEnabledStore.getValue();
  if (stainOn) {
    activateStain();
  }
}
```

**Step 4: Update `removeOverlay` to handle both**

```ts
function removeOverlay(): void {
  counterEl?.remove();
  counterEl = null;
  deactivateStain();
}
```

**Step 5: Add `stainEnabledStore.watch()` in `activate`**

Inside the `activate` function, after the existing tunnel watchers, add:

```ts
stainEnabledStore.watch(async (newValue) => {
  if (newValue) {
    activateStain();
  } else {
    deactivateStain();
  }
});
```

**Step 6: Guard stain access in `updateDisplay`**

The stain-related block in `updateDisplay` already checks `if (!stainEl)` via the top guard. Change the top guard to only require `counterEl`:

```ts
function updateDisplay(): void {
  if (!counterEl) return;
  // ... counter text logic stays the same ...

  // Stain interpolation — only if stain is active
  if (stainEl) {
    const t = stainProgress(dailySeconds);
    if (t <= 0) {
      stainEl.style.width = "0";
      stainEl.style.paddingBottom = "0";
      stainEl.style.opacity = "0";
    } else {
      const size = lerp(BLOB_SIZE_MIN, BLOB_SIZE_MAX, t);
      const alpha = lerp(BLOB_ALPHA_MIN, BLOB_ALPHA_MAX, t);
      const edgeAlpha = alpha * 0.5;

      stainEl.style.width = `${size.toFixed(1)}%`;
      stainEl.style.paddingBottom = `${size.toFixed(1)}%`;
      stainEl.style.opacity = "1";
      stainEl.style.background = [
        `radial-gradient(circle,`,
        `  rgba(0, 0, 0, ${alpha.toFixed(3)}) 0%,`,
        `  rgba(0, 0, 0, ${alpha.toFixed(3)}) 40%,`,
        `  rgba(0, 0, 0, ${edgeAlpha.toFixed(3)}) 70%,`,
        `  transparent 100%)`,
      ].join(" ");
    }
  }

  // Counter styling — compute t even without stain for counter growth
  const t = stainProgress(dailySeconds);
  const fontSize = lerp(COUNTER_FONT_MIN, COUNTER_FONT_MAX, t);
  const textAlpha = lerp(0.55, 1.0, t);
  const bgAlpha = lerp(0.3, 0.55, t);

  counterEl.style.fontSize = `${fontSize.toFixed(1)}px`;
  counterEl.style.color = `rgba(255, 255, 255, ${textAlpha.toFixed(2)})`;
  counterEl.style.background = `rgba(0, 0, 0, ${bgAlpha.toFixed(2)})`;
  counterEl.style.padding = "6px 12px";
  counterEl.style.borderRadius = "8px";
  counterEl.style.fontWeight = t > 0.5 ? "600" : "400";
}
```

**Step 7: Commit**

```bash
git add apps/browser/entrypoints/youtube-watch-time.content/index.ts
git commit -m "feat(signals): decouple stain lifecycle from watch time counter

The stain now has its own stain-enabled storage key. Counter and stain
can be toggled independently."
```

---

### Task 4: Add stain toggle to manage page

**Files:**
- Modify: `apps/browser/entrypoints/manage/main.ts`

**Step 1: Add the `stainEnabledStore` import and declaration**

After the existing `tunnelMaxStore` declaration (around line 72), add:

```ts
const stainEnabledStore = signalSetting<boolean>(
  "youtube-watch-time",
  "stain-enabled",
  true
);
```

**Step 2: Add a stain toggle row in the watch time settings panel**

Inside the `if (intervention.id === "youtube-watch-time")` block, before the position picker, add:

```ts
// ── Stain toggle ──────────────────────────────────────────
const stainRow = document.createElement("div");
stainRow.className = "settings-row";

const stainLabel = document.createElement("span");
stainLabel.className = "settings-label";
stainLabel.textContent = "Dark stain overlay";

const stainToggle = createToggle("stain-enabled");
const currentStain = await stainEnabledStore.getValue();
stainToggle.input.checked = currentStain;
stainToggle.input.addEventListener("change", async () => {
  await stainEnabledStore.setValue(stainToggle.input.checked);
});
stainEnabledStore.watch((v) => {
  stainToggle.input.checked = v;
});

stainRow.appendChild(stainLabel);
stainRow.appendChild(stainToggle.label);
settingsPanel.appendChild(stainRow);
```

**Step 3: Commit**

```bash
git add apps/browser/entrypoints/manage/main.ts
git commit -m "feat(manage): add stain toggle to watch time settings panel"
```

---

### Task 5: Typecheck

**Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

**Step 2: If errors, fix them and amend the relevant commit.**

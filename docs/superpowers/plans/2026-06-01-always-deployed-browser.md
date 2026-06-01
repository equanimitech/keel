# Always-Deployed Browser Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `apps/browser` WXT extension a permanent fixture of Brave — installed once, surviving browser restarts and code rebuilds without a dev server, with all stored shield state preserved across rebuilds.

**Architecture:** Give the extension a stable identity via a committed `manifest.key` (base64 SPKI DER public key). Chromium derives a deterministic extension ID from it, so `chrome.storage` contents and granted permissions persist across every reload, rebuild, and restart. Ship a `deploy:browser` script that builds and prints the load-unpacked path, plus a one-time install runbook. The HMR dev flow (`pnpm dev:browser`) is untouched.

**Tech Stack:** WXT 0.19 (Chromium MV3), pnpm 10.7 workspace, OpenSSL for keypair generation.

**Spec:** `docs/superpowers/specs/2026-05-31-always-deployed-browser-design.md`

**Note on testing:** This slice has no unit-testable runtime code — it is manifest config, npm scripts, and a docs runbook. The canonical TDD loop does not apply. Each task instead ends in a concrete, runnable verification (a build, a file check, or a manual browser step). Manual browser verification (Task 5) is unavoidable and is the spec's own acceptance gate; do not claim success without performing it.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `.keys/equanimi.pem` | Private RSA key (CRX signing, future no-nag path only) | Create, gitignored — never committed |
| `.gitignore` (root) | Exclude `.keys/` from version control | Modify |
| `apps/browser/wxt.config.ts` | Stable extension identity + build output dir | Modify (add `manifest.key`; keep existing `outDir: "dist"`) |
| `apps/browser/package.json` | Per-package `deploy` script | Modify |
| `package.json` (root) | Workspace `deploy:browser` script | Modify |
| `docs/deploy-browser.md` | One-time install + update runbook | Create |

Build output `apps/browser/dist/chrome-mv3` is already gitignored by the root `dist` rule — no change needed there.

---

## Task 1: Generate the stable keypair and gitignore it

**Files:**
- Create: `.keys/equanimi.pem` (generated, gitignored — not committed)
- Modify: `.gitignore` (root)

The private `.pem` is generated once and never committed. Only its derived public key (Task 2) is committed. Gitignore the `.keys/` directory **before** generating the key so it can never be accidentally staged.

- [ ] **Step 1: Add `.keys/` to `.gitignore`**

Append to the end of the root `.gitignore`:

```gitignore

# Extension signing key (private — never commit)
.keys/
```

- [ ] **Step 2: Verify `.keys/` is ignored**

Run: `git check-ignore .keys/equanimi.pem`
Expected: prints `.keys/equanimi.pem` (proves the path is ignored before the key exists).

- [ ] **Step 3: Generate the private key**

Run from repo root:

```bash
mkdir -p .keys
openssl genrsa 2048 > .keys/equanimi.pem
```

Expected: `.keys/equanimi.pem` exists; no output to stdout besides OpenSSL's `Generating RSA private key` notice on stderr.

- [ ] **Step 4: Confirm the key is NOT staged and NOT tracked**

Run: `git status --porcelain .keys/`
Expected: **empty output** (the directory is ignored). If anything prints, STOP — the gitignore rule did not take; do not proceed.

- [ ] **Step 5: Commit the gitignore change**

```bash
git add .gitignore
git commit -m "chore(browser): gitignore extension signing key dir"
```

---

## Task 2: Add the stable `manifest.key` to the WXT config

**Files:**
- Modify: `apps/browser/wxt.config.ts`

Chromium derives the extension ID from `manifest.key`. The value is the **public** key as base64-encoded SPKI DER — safe to commit. This task also folds in the pre-existing uncommitted `outDir: "dist"` edit (the spec depends on that output path).

- [ ] **Step 1: Derive the public key string**

Run from repo root:

```bash
openssl rsa -in .keys/equanimi.pem -pubout -outform DER | openssl base64 -A
```

Expected: a single long base64 line (no line breaks, ~392 chars), e.g. `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...IDAQAB`. Copy this exact string — it is the value for `manifest.key` in the next step.

- [ ] **Step 2: Add `manifest.key` to the config**

Edit `apps/browser/wxt.config.ts`. Add a `key` field as the **first** property inside `manifest`, pasting the base64 string from Step 1 in place of `<PASTE_BASE64_PUBLIC_KEY_HERE>`. Leave the existing `outDir: "dist"` line in place. Result:

```typescript
import { defineConfig } from "wxt";

export default defineConfig({
  outDir: "dist",
  manifest: {
    key: "<PASTE_BASE64_PUBLIC_KEY_HERE>",
    name: "Equanimi",
    description:
      "Stopping cues for the internet. Modular attention shields for YouTube, LinkedIn, Chess.com and more.",
    permissions: ["storage", "tabs", "activeTab"],
    icons: {
      "16": "/icons/icon-16.png",
      "32": "/icons/icon-32.png",
      "48": "/icons/icon-48.png",
      "128": "/icons/icon-128.png",
    },
  },
});
```

- [ ] **Step 3: Build and confirm the key lands in the generated manifest**

Run from repo root:

```bash
pnpm build:browser
```

Then inspect the built manifest:

Run: `grep -o '"key"' apps/browser/dist/chrome-mv3/manifest.json`
Expected: prints `"key"` — confirms WXT passed the field through to the production manifest. Build must exit 0.

- [ ] **Step 4: Typecheck stays green**

Run: `pnpm --filter @equanimi/browser typecheck`
Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/browser/wxt.config.ts
git commit -m "feat(browser): add stable manifest.key for persistent extension ID"
```

---

## Task 3: Add the `deploy` scripts

**Files:**
- Modify: `apps/browser/package.json`
- Modify: `package.json` (root)

`deploy` builds the production bundle and echoes the absolute load-unpacked path so the user can copy it straight into Brave. The root `deploy:browser` delegates to the package script, matching the existing `dev:browser` / `build:browser` pattern.

- [ ] **Step 1: Add the per-package `deploy` script**

Edit `apps/browser/package.json`. Add a `deploy` entry to `scripts`, immediately after the existing `build` line:

```json
    "build": "wxt build",
    "deploy": "wxt build && echo \"\\nLoad unpacked from: $(pwd)/dist/chrome-mv3\\n\"",
```

- [ ] **Step 2: Add the root `deploy:browser` script**

Edit the root `package.json`. Add a `deploy:browser` entry to `scripts`, immediately after the existing `build:browser` line:

```json
    "build:browser": "pnpm --filter @equanimi/browser build",
    "deploy:browser": "pnpm --filter @equanimi/browser deploy",
```

- [ ] **Step 3: Run the deploy script and confirm it prints the path**

Run from repo root:

```bash
pnpm deploy:browser
```

Expected: build exits 0 and the final lines include `Load unpacked from: /Users/rafa/Developer/equanimitech/keel/apps/browser/dist/chrome-mv3`.

- [ ] **Step 4: Confirm the build output directory exists**

Run: `test -f apps/browser/dist/chrome-mv3/manifest.json && echo OK`
Expected: prints `OK`.

- [ ] **Step 5: Commit**

```bash
git add apps/browser/package.json package.json
git commit -m "feat(browser): add deploy:browser script that prints load-unpacked path"
```

---

## Task 4: Write the one-time install runbook

**Files:**
- Create: `docs/deploy-browser.md`

A short runbook the user follows once to install, and thereafter to update. No code — verification is a content/lint check plus a human read.

- [ ] **Step 1: Create `docs/deploy-browser.md`**

```markdown
# Deploying the Equanimi browser extension (Brave)

The extension is installed **once** as a load-unpacked build. It then survives
Brave restarts and code rebuilds without a dev server, and keeps all stored
shield toggles across rebuilds (thanks to the stable `manifest.key`).

## First install

1. Build the extension:

   ```bash
   pnpm deploy:browser
   ```

   On success it prints the absolute load-unpacked path, e.g.
   `.../apps/browser/dist/chrome-mv3`.

2. Open `brave://extensions`.
3. Toggle **Developer mode** ON (top-right).
4. Click **Load unpacked** and select the printed folder
   (`apps/browser/dist/chrome-mv3`).

The folder path is now fixed. Rebuilds overwrite it in place.

## Updating to new code

1. Rebuild: `pnpm deploy:browser`.
2. Go to `brave://extensions` and click the **reload** icon on the Equanimi card.

No dev server, no reinstall, stored toggles intact.

## Notes

- Brave persists load-unpacked extensions across restarts. Any
  "developer-mode extensions" prompt on startup is benign — this is not a
  store install.
- The extension ID is stable because `manifest.key` is committed in
  `apps/browser/wxt.config.ts`. The matching private key lives at
  `.keys/equanimi.pem` (gitignored); it is only needed to pack a signed CRX
  for the future no-nag managed-policy install path.
- `pnpm dev:browser` still works for HMR development and shares the same
  extension ID, so stored state carries over between dev and deployed builds.
  Only load one at a time.
```

- [ ] **Step 2: Verify the doc references the real build path**

Run: `grep -q 'apps/browser/dist/chrome-mv3' docs/deploy-browser.md && echo OK`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add docs/deploy-browser.md
git commit -m "docs(browser): add one-time load-unpacked install runbook"
```

---

## Task 5: Manual verification in Brave (acceptance gate)

**Files:** none — this is the spec's acceptance test. It must be performed by hand; there is no automated substitute. The user runs Brave manually (per CLAUDE.md, do not run dev/build-and-launch flows for them — hand them the steps).

- [ ] **Step 1: Build is clean**

Run: `pnpm deploy:browser`
Expected: exits 0, prints the `dist/chrome-mv3` path.

- [ ] **Step 2: Load unpacked + toggle a shield**

Follow `docs/deploy-browser.md` first-install steps. Open the popup, toggle one shield OFF. Note which one.

- [ ] **Step 3: Restart persistence**

Quit Brave fully, reopen. Confirm: extension still present **and** the toggle from Step 2 is still OFF. (Proves stable ID + persisted storage survive a restart.)

- [ ] **Step 4: Rebuild persistence**

Edit any source file under `apps/browser/` (a trivial change is fine), run `pnpm deploy:browser`, click **reload** on the extension card in `brave://extensions`. Confirm: the change is present **and** the toggle from Step 2 is still OFF. (Proves ID stability + state survive a rebuild.)

- [ ] **Step 5: Confirm dev flow unaffected**

Run: `pnpm dev:browser`. Confirm the extension still loads under the same ID with HMR. Stop the dev server.

---

## Self-Review

**Spec coverage:**
- Change 1 (stable `manifest.key`) → Task 2. ✅
- Change 1 private `.pem` at `.keys/`, gitignored → Task 1. ✅
- Change 2 (`deploy` + `deploy:browser` scripts) → Task 3. ✅
- Change 2 build output `dist/chrome-mv3` → relies on `outDir: "dist"`, folded into Task 2 Step 2; already-gitignored `dist` confirmed (no task needed). ✅
- Change 3 (`docs/deploy-browser.md` runbook) → Task 4. ✅
- Change 4 (keep dev flow) → Task 5 Step 5 verifies it. ✅
- `.gitignore` `.keys/` entry → Task 1 Step 1. ✅
- Spec Verification steps 1–4 → Task 5 Steps 1–4 (one-to-one). ✅
- Out of scope (no-nag CRX, auto-reload, sync, other surfaces) → not implemented, correctly. ✅

**Placeholders:** Only `<PASTE_BASE64_PUBLIC_KEY_HERE>` remains, and that is intentional — the value is a freshly generated key that cannot be hardcoded in a plan. Task 2 Steps 1–2 give the exact command to produce it and where to paste it.

**Type/name consistency:** Script names (`deploy`, `deploy:browser`), path (`apps/browser/dist/chrome-mv3`), and key file (`.keys/equanimi.pem`) are used identically across Tasks 1–5 and the runbook.

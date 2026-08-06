# Rename `equanimi` → `keel` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product from `equanimi` to `keel` across the monorepo — package scope (`@equanimi/*`→`@keel/*`), root package name, all imports and pnpm filters, the user-visible display name (`Equanimi`→`Keel`), and runtime CSS/DOM identifiers (`equanimi-*` class prefixes, `dataset.equanimiLocked`) — while preserving the parent company name `EquanimiTech`, the English word `equanimity`, the desktop `monotask` Tauri identity, and all historical `docs/` prose.

**Architecture:** Scoped sweeps, one per token class, each its own commit so review and rollback are clean: (1) package identity, (2) display name, (3) runtime CSS/DOM ids, (4) signing-key file, (5) desktop rebrand + Tauri identity, (6) desktop state directory, (7) Rust crate, (8) verification. Replacements use `perl` with negative lookahead to protect `equanimity` / `EquanimiTech` / `equanimitech`. The desktop app — currently branded `monotask` — is rebranded to `keel`: Rust crate (`monotask`/`monotask_lib`→`keel`/`keel_lib`), Tauri `productName`/window/tray/error UI, bundle identifier `tech.equinami.monotask`→`tech.equanimi.keel`, and the `~/.monotask/` state directory→`~/.keel/` with **no** migration (existing local data is orphaned and the app starts fresh — accepted per decision).

**Tech Stack:** pnpm 10.7 workspace, WXT 0.19, `perl` for protected in-place substitution, `rg` for verification.

---

## Decisions locked in (from brainstorm)

- **Depth:** code identity + display name + runtime CSS/DOM ids + desktop `monotask` rebrand. **Not** historical doc prose.
- **Company:** keep `EquanimiTech` / `equanimitech` everywhere.
- **Desktop (`monotask`):** rebrand to `keel`; Rust crate `monotask`/`monotask_lib`→`keel`/`keel_lib`; bundle id `tech.equinami.monotask`→`tech.equanimi.keel`; state dir `~/.monotask/`→`~/.keel/` **without migration** (local sessions/captures/config reset — accepted). Display strings use title-case `Keel`; technical identifiers (crate, path, id segment) use lowercase `keel`.
- **Protected tokens (must survive every sweep):** `equanimity` (English word, in READMEs), `EquanimiTech` / `equanimitech` (company).
- **Safety fact (verified):** persisted storage keys are `local:signal:*` / `local:shield:*` / `local:budget:*` — none contain `equanimi`. Renaming runtime CSS/DOM ids therefore does **not** reset shield toggles (consistent with the always-deployed slice-A goal).

## Out of scope (left as-is, intentionally)

- All of `docs/**` and `apps/browser/docs/**` (historical specs, plans, sessions).
- `apps/browser/PITCH.md`, `apps/browser/PROMPT.md`, `PITCH-equanimi-unification.md`, `ROADMAP-equanimi-unification.md` (historical pitch/roadmap prose).
- `PITCH-equanimi-unification.md` / `ROADMAP-equanimi-unification.md` prose mentions of `monotask` / `equinami` (historical — these are the only `equinami` survivors after the rename; the Tauri identity itself **is** in scope, Tasks 5–7).
- The repo directory path `/Users/operator/Developer/equanimitech/keel` (company dir; manual if ever wanted).
- The global `~/.claude/CLAUDE.md` "EquanimiTech" principle reference.

## Pre-flight note — coexisting uncommitted slice-A edits

`apps/browser/wxt.config.ts`, `apps/browser/package.json`, root `package.json`, and `.gitignore` carry **uncommitted** edits from the always-deployed slice-A work (manifest.key, `outDir`, `deploy` scripts, `.keys/`). Tasks 1–4 touch some of the same files. Either:

- **(a)** Commit the slice-A edits first (per `docs/superpowers/plans/2026-06-01-always-deployed-browser.md`), then run this plan — cleanest diffs; **recommended**; or
- **(b)** Let the rename commits sweep them up together — acceptable, but the slice-A and rename changes will share commits.

Pick one before starting. Do **not** use `git checkout`/`stash`/`restore` to separate them (see global CLAUDE.md git rule).

---

## File Structure

Two file sets. The **rename set** (code/config/README/CLAUDE.md — gets edited) and the **leave set** (docs prose — untouched).

**Rename set — code & config:**
- `package.json` (root), `apps/browser/package.json`, `apps/desktop/package.json`, `packages/domain/package.json`
- `apps/browser/wxt.config.ts`
- `apps/browser/entrypoints/**/{index.ts,main.ts,index.html,style.css}` (all 14 content scripts + popup + manage)
- `apps/browser/modules/{budgets,shields,signals}/types.ts`
- `packages/domain/src/{index,behavior,budget,drift,intervention,session,value-objects}.ts`
- `apps/desktop/src/domain/valueObjects/{AppName,Duration,InterventionMetadata,InterventionType,TriggerCondition}.ts`
- `pnpm-lock.yaml` (2 lines, or regenerate via `pnpm install`)

**Rename set — README & CLAUDE.md (display + functional refs):**
- `README.md` (root), `apps/browser/README.md`
- `CLAUDE.md` (root), `apps/browser/CLAUDE.md`, `apps/desktop/CLAUDE.md`

**Rename set — signing key:**
- `.keys/equanimi.pem` → `.keys/keel.pem` (gitignored file; `mv`, not `git mv`)

---

## Task 1: Rename package identity (`@equanimi/*` → `@keel/*`)

**Files:** the 4 `package.json` files, all `.ts` files importing `@equanimi/domain`, root `package.json` scripts (pnpm filters), `apps/browser/README.md`, `apps/desktop/README.md` if present, the 3 `CLAUDE.md` files, and `pnpm-lock.yaml`. This is the functional core — package names, imports, and filters must change atomically or the workspace won't resolve.

- [ ] **Step 1: Replace the package scope across all code/config (not docs)**

Run from repo root:

```bash
rg -il '@equanimi/' -g '!docs/**' -g '!**/docs/**' -g '!pnpm-lock.yaml' \
  | xargs perl -pi -e 's{\@equanimi/}{\@keel/}g'
```

This rewrites `@equanimi/domain`, `@equanimi/browser`, `@equanimi/desktop` → `@keel/*` in package `name` fields, every `import ... from "@equanimi/domain"`, and the `pnpm --filter @equanimi/...` invocations in root `package.json`.

- [ ] **Step 2: Rename the root package name**

The root package is named `equanimi` (bare, not scoped). Edit `package.json`:

```json
  "name": "equanimi",
```
→
```json
  "name": "keel",
```

- [ ] **Step 3: Fix the lockfile**

`pnpm-lock.yaml` has two `'@equanimi/domain':` references. Regenerate the lock cleanly (this is not a dev server command; it is allowed):

```bash
pnpm install
```

Expected: install succeeds, workspace links resolve, `pnpm-lock.yaml` now shows `@keel/domain`.

- [ ] **Step 4: Verify no `@equanimi/` survives in code/config**

Run: `rg -n '@equanimi/' -g '!docs/**' -g '!**/docs/**'`
Expected: **no output** (docs are intentionally left; verified separately in Task 5).

- [ ] **Step 5: Typecheck the whole workspace**

Run: `pnpm typecheck`
Expected: exits 0. (Catches any missed import.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename package scope @equanimi/* to @keel/*"
```

---

## Task 2: Rename the display name (`Equanimi` → `Keel`)

**Files:** `apps/browser/wxt.config.ts` (manifest `name`), `apps/browser/entrypoints/popup/index.html` + `apps/browser/entrypoints/manage/index.html` (titles/headings), `README.md`, `apps/browser/README.md`, and the product-title line in the 3 `CLAUDE.md` files. Protect `Equanimity`/`EquanimiTech`.

- [ ] **Step 1: Replace capitalized `Equanimi` → `Keel`, protecting `Equanimity` and `EquanimiTech`**

Run from repo root:

```bash
rg -il 'Equanimi' -g '!docs/**' -g '!**/docs/**' -g '!*PITCH*' -g '!*PROMPT*' -g '!*ROADMAP*' \
  | xargs perl -pi -e 's/Equanimi(?!ty|Tech)/Keel/g'
```

The negative lookahead `(?!ty|Tech)` leaves `Equanimity` and `EquanimiTech` intact. PITCH/PROMPT/ROADMAP files are excluded as historical prose.

- [ ] **Step 2: Confirm the extension manifest name changed**

Run: `rg -n 'name:' apps/browser/wxt.config.ts`
Expected: shows `name: "Keel"`.

- [ ] **Step 3: Confirm protected tokens survived**

Run: `rg -n 'Equanimity|EquanimiTech' README.md apps/browser/README.md`
Expected: any `Equanimity` / `EquanimiTech` that existed is still present, unmodified.

- [ ] **Step 4: Build the extension (manifest sanity)**

Run: `pnpm build:browser`
Then: `rg -n '"name"' apps/browser/dist/chrome-mv3/manifest.json`
Expected: build exits 0; manifest `name` is `"Keel"`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename display name Equanimi to Keel"
```

---

## Task 3: Rename runtime CSS/DOM identifiers

**Files:** all `apps/browser/entrypoints/*.content/{index.ts,style.css}`, `apps/browser/entrypoints/popup/main.ts`, plus any module `.ts` using the prefix. Three token forms: the `equanimi-` class/id prefix (CSS + the `className`/`id` strings and the `CSS_CLASS = \`equanimi-${id}-active\`` template in TS), the `dataset.equanimiLocked` attribute, and the `[equanimi]` console log tag. CSS and TS must change together so selectors keep matching. Safe vs storage (verified — no `equanimi` storage keys).

- [ ] **Step 1: Replace the three runtime token forms across browser code**

Run from repo root:

```bash
rg -il 'equanimi' apps/browser -g '!**/docs/**' -g '!*.md' \
  | xargs perl -pi -e 's/equanimiLocked/keelLocked/g; s/equanimi-/keel-/g; s/\[equanimi\]/[keel]/g; s/equanimi(?!ty|tech)/keel/g'
```

Order matters: `equanimiLocked`, `equanimi-`, and `[equanimi]` are handled first; the trailing `equanimi(?!ty|tech)` catches any remaining bare lowercase occurrence (e.g. a stray comment) without touching `equanimity`/`equanimitech`.

- [ ] **Step 2: Confirm CSS prefix and TS class string still agree**

Spot-check one shield pair (cooldown overlay):

Run: `rg -n 'keel-yt-cooldown-overlay' apps/browser/entrypoints/youtube-cooldown.content/`
Expected: matches appear in **both** `style.css` (the `.keel-yt-cooldown-overlay` rule) and `index.ts` (the `className`/string that applies it). If only one side matches, STOP — the selector is broken.

- [ ] **Step 3: Confirm the dataset rename is internally consistent**

Run: `rg -n 'equanimiLocked|keelLocked' apps/browser/entrypoints/youtube-shorts.content/index.ts`
Expected: all three sites now read `keelLocked`; zero `equanimiLocked`.

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build:browser`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(browser): rename runtime CSS/DOM identifiers equanimi-* to keel-*"
```

---

## Task 4: Rename the signing key file

**Files:** `.keys/equanimi.pem` → `.keys/keel.pem`; the comment in `apps/browser/wxt.config.ts` and the runbook `docs/deploy-browser.md` reference the old name. (`docs/deploy-browser.md` is current operational doc, not historical prose, so its path reference is updated here for accuracy.)

- [ ] **Step 1: Move the (gitignored) private key**

```bash
test -f .keys/equanimi.pem && mv .keys/equanimi.pem .keys/keel.pem || echo "no key file present — skip"
```

Expected: either the file is renamed, or a clear skip message (the key may not have been generated yet — harmless; regenerate later as `.keys/keel.pem`).

- [ ] **Step 2: Update path references in code/runbook**

Run from repo root:

```bash
perl -pi -e 's{\.keys/equanimi\.pem}{.keys/keel.pem}g' apps/browser/wxt.config.ts docs/deploy-browser.md
```

- [ ] **Step 3: Verify no `equanimi.pem` reference remains**

Run: `rg -n 'equanimi\.pem' -g '!docs/superpowers/**'`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(browser): rename signing key to keel.pem"
```

---

## Task 5: Desktop rebrand — display strings + Tauri identity (`monotask` → `Keel`)

**Files:** `apps/desktop/src-tauri/tauri.conf.json` (productName, window title, identifier), `apps/desktop/index.html` (`<title>`), `apps/desktop/src/bootstrap.ts`, `apps/desktop/src/main.tsx`, `apps/desktop/src/ui/windows/PreferencesPane.tsx`, `apps/desktop/src/ui/hooks/useTrayIcon.ts`. User-facing strings become title-case `Keel`. Does **not** touch the Rust crate (Task 7) or the `~/.monotask/` storage path (Task 6) — those have specific targets and are committed separately.

- [ ] **Step 1: Rename the in-app display strings (`Monotask` → `Keel`)**

```bash
perl -pi -e 's/Monotask/Keel/g' \
  apps/desktop/src/bootstrap.ts \
  apps/desktop/src/main.tsx \
  apps/desktop/src/ui/windows/PreferencesPane.tsx \
  apps/desktop/src/ui/hooks/useTrayIcon.ts
```

Covers "Bootstrapping Monotask…", "Failed to start Monotask", "Monotask v0.1.0", and the tray tooltip "Monotask".

- [ ] **Step 2: Fix the remaining lowercase user-facing strings to `Keel`**

These are lowercase `monotask` but still user-visible, so they go title-case (not the lowercase technical form):

- `apps/desktop/src/ui/hooks/useTrayIcon.ts`: the quit label `"Quit monotask"` → `"Quit Keel"`.
- `apps/desktop/index.html`: `<title>monotask</title>` → `<title>Keel</title>`.

```bash
perl -pi -e 's/Quit monotask/Quit Keel/g' apps/desktop/src/ui/hooks/useTrayIcon.ts
perl -pi -e 's{<title>monotask</title>}{<title>Keel</title>}' apps/desktop/index.html
```

- [ ] **Step 3: Update `tauri.conf.json` — productName, window title, bundle identifier**

Edit `apps/desktop/src-tauri/tauri.conf.json`:

```json
  "productName": "monotask",
```
→
```json
  "productName": "Keel",
```

```json
  "identifier": "tech.equinami.monotask",
```
→
```json
  "identifier": "tech.equanimi.keel",
```

```json
        "title": "monotask",
```
→
```json
        "title": "Keel",
```

- [ ] **Step 4: Confirm no `monotask`/`equinami` survives in these files**

Run: `rg -in 'monotask|equinami' apps/desktop/src-tauri/tauri.conf.json apps/desktop/index.html apps/desktop/src/bootstrap.ts apps/desktop/src/main.tsx apps/desktop/src/ui/windows/PreferencesPane.tsx apps/desktop/src/ui/hooks/useTrayIcon.ts`
Expected: **no output**.

- [ ] **Step 5: Frontend typechecks**

Run: `pnpm --filter @keel/desktop typecheck`
Expected: exits 0. (Package is already `@keel/desktop` after Task 1.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(desktop): rebrand monotask to Keel + set bundle id tech.equanimi.keel"
```

---

## Task 6: Desktop state directory `~/.monotask/` → `~/.keel/` (no migration)

**Files:** `apps/desktop/src/application/ServiceContainer.ts`, `apps/desktop/src/infrastructure/persistence/filesystem/FileSystemConfigRepository.ts`, `apps/desktop/src-tauri/capabilities/desktop.json`, plus comment-only references in `apps/desktop/src/types/AppConfig.ts`, `apps/desktop/src/infrastructure/ports/IConfigRepository.ts`, the three `apps/desktop/src/infrastructure/persistence/tauri-store/*.ts` files, and `apps/desktop/CLAUDE.md`. **No migration** — existing `~/.monotask/` data is orphaned (not deleted); the app creates a fresh `~/.keel/` on next launch. This is accepted per decision.

- [ ] **Step 1: Rewrite every `.monotask` path reference**

```bash
rg -il '\.monotask' apps/desktop -g '!**/docs/**' \
  | xargs perl -pi -e 's/\.monotask/.keel/g'
```

This updates the functional paths (`Store.load(".keel/store.bin")`, the `.keel/config.json` constant + `mkdir`/`exists` calls in `FileSystemConfigRepository`, and the `$HOME/.keel` / `$HOME/.keel/**` entries in the Tauri capability scope) and the doc-comments that name the path.

- [ ] **Step 2: Confirm the capability scope and the store path agree**

Run: `rg -n '\.keel' apps/desktop/src-tauri/capabilities/desktop.json apps/desktop/src/application/ServiceContainer.ts apps/desktop/src/infrastructure/persistence/filesystem/FileSystemConfigRepository.ts`
Expected: capability scope shows `$HOME/.keel` (+ `/**`); `ServiceContainer` loads `.keel/store.bin`; `FileSystemConfigRepository` uses `.keel/config.json`. If the capability scope still says `.monotask` while code says `.keel`, filesystem access will be denied at runtime — STOP and fix.

- [ ] **Step 3: No `.monotask` path remains**

Run: `rg -n '\.monotask' apps/desktop -g '!**/docs/**'`
Expected: **no output**.

- [ ] **Step 4: Frontend typechecks**

Run: `pnpm --filter @keel/desktop typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(desktop): move state dir ~/.monotask to ~/.keel (no migration)"
```

---

## Task 7: Rename the Rust crate (`monotask`/`monotask_lib` → `keel`/`keel_lib`)

**Files:** `apps/desktop/src-tauri/Cargo.toml` (package `name`, lib `name`), `apps/desktop/src-tauri/src/main.rs` (lib call), `apps/desktop/src-tauri/Cargo.lock` (regenerated). Crate names are lowercase technical identifiers.

- [ ] **Step 1: Rename in `Cargo.toml`**

Edit `apps/desktop/src-tauri/Cargo.toml`:

```toml
name = "monotask"
```
→
```toml
name = "keel"
```

and the `[lib]` name:

```toml
name = "monotask_lib"
```
→
```toml
name = "keel_lib"
```

- [ ] **Step 2: Update the library call in `main.rs`**

Edit `apps/desktop/src-tauri/src/main.rs`:

```rust
    monotask_lib::run()
```
→
```rust
    keel_lib::run()
```

- [ ] **Step 3: Regenerate `Cargo.lock` and confirm it compiles**

Run from `apps/desktop/src-tauri`:

```bash
cargo check
```

Expected: exits 0; `Cargo.lock` now contains `name = "keel"` and no `name = "monotask"`. (`cargo check` is a compile check, not a dev server — safe to run. If the user prefers to run Rust builds themselves, instead hand-edit the `name = "monotask"` line in `Cargo.lock` to `name = "keel"` and have them run `cargo check` at their convenience.)

- [ ] **Step 4: No crate-name `monotask` remains**

Run: `rg -n 'monotask' apps/desktop/src-tauri`
Expected: **no output**.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(desktop): rename Rust crate monotask to keel"
```

---

## Task 8: Verification sweep (acceptance gate)

**Files:** none — confirms only the intended survivors remain and the build is green.

- [ ] **Step 1: Only protected/intentional tokens survive in code**

Run: `rg -in 'equanimi|monotask|equinami' -g '!docs/**' -g '!**/docs/**' -g '!*PITCH*' -g '!*PROMPT*' -g '!*ROADMAP*'`
Expected: matches are **only** `equanimity` (READMEs) and `EquanimiTech`/`equanimitech` (company). **Zero** functional `@equanimi/`, `equanimi-`, `equanimiLocked`, `[equanimi]`, bare product `equanimi`, any `monotask`, or any `equinami`. List anything unexpected and fix it in the appropriate task above.

- [ ] **Step 2: Protected tokens definitely intact**

Run: `rg -cn 'equanimity|EquanimiTech|equanimitech' README.md apps/browser/README.md CLAUDE.md`
Expected: counts match what existed before the rename (these were never targeted).

- [ ] **Step 3: Workspace is consistent**

Run: `pnpm install && pnpm typecheck`
Expected: both exit 0; lockfile shows `@keel/domain`, no `@equanimi`.

- [ ] **Step 4: All builds succeed**

Run: `pnpm build:browser`, `pnpm build:desktop`, and `cargo check` in `apps/desktop/src-tauri`.
Expected: browser build exits 0 and emits `apps/browser/dist/chrome-mv3/manifest.json` with `"name": "Keel"`; desktop frontend + Rust check both exit 0.

- [ ] **Step 5: Manual browser smoke (depends on slice-A install)**

If the extension is already loaded unpacked (per the always-deployed runbook): `pnpm deploy:browser`, reload the card in `brave://extensions`, open a shielded site (e.g. a YouTube cooldown). Confirm the overlay still renders correctly (proves the `keel-*` CSS/TS rename kept selectors matching) and that previously-set shield toggles are still intact (proves no storage key was renamed).

- [ ] **Step 6: Manual desktop smoke (optional, user-run)**

If the desktop app is run (`pnpm dev:desktop` + Tauri): confirm the window title and tray read "Keel", and that a fresh `~/.keel/` directory is created (old `~/.monotask/` left untouched on disk).

---

## Self-Review

**Token-class coverage:**
- `@equanimi/*` scope (names, imports, filters, lock) → Task 1. ✅
- Root bare package name `equanimi` → Task 1 Step 2. ✅
- Display `Equanimi` (manifest, HTML, READMEs, CLAUDE.md titles) → Task 2, with `(?!ty|Tech)` guard. ✅
- Runtime `equanimi-` CSS/DOM prefix + `CSS_CLASS` template → Task 3. ✅
- `dataset.equanimiLocked` → Task 3, verified self-consistent. ✅
- `[equanimi]` log tag → Task 3. ✅
- `.keys/equanimi.pem` + path refs → Task 4. ✅
- Desktop `monotask`→`Keel` display + bundle id `tech.equanimi.keel` → Task 5. ✅
- Desktop state dir `~/.monotask/`→`~/.keel/`, no migration, capability scope kept in sync → Task 6. ✅
- Rust crate `monotask`/`monotask_lib`→`keel`/`keel_lib` + `main.rs` call + `Cargo.lock` → Task 7. ✅

**Protected-token guards:** `equanimity` guarded by `(?!ty)` in Tasks 2 & 3; `EquanimiTech`/`equanimitech` guarded by `(?!Tech)`/`(?!tech)` and confirmed absent from the code/config rename set. Desktop `equinami` typo is corrected only inside `tauri.conf.json` (Task 5); its only survivors are the historical PITCH/ROADMAP prose. Verified in Task 8 Steps 1–2.

**Case discipline:** display strings → `Keel` (browser manifest, desktop productName/window/tray/error UI); technical identifiers → lowercase `keel` (package scope, Rust crate, `~/.keel/` path, `tech.equanimi.keel` id segment). Task 5 Step 2 explicitly bumps the lowercase-but-user-visible strings to title case.

**State-reset risk:** browser ruled out — storage keys (`local:signal/shield/budget:*`) contain no `equanimi`; Task 8 Step 5 confirms toggles persist. Desktop state-reset is **intended** (no migration) per decision; Task 8 Step 6 confirms a fresh `~/.keel/` and that capability scope matches the code path (else filesystem access breaks).

**Placeholders:** none — every step is a runnable command with expected output. The only non-literal is the generated key file in Task 4 (handled with a presence test + skip branch).

**Ordering:** Task 1 first (functional, must precede builds); display and runtime are independent and commute; key rename last; verification gate closes. Perl rule order within Task 3 (specific tokens before the bare catch-all) is correct.

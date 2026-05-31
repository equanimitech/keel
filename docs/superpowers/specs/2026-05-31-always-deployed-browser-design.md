# Slice A — Always-deployed browser extension (design)

**Date:** 2026-05-31
**Status:** approved, ready for implementation plan
**Surface:** `apps/browser` (WXT extension)
**Daily browser:** Brave (Chromium MV3)

## Context

This is the first slice of a larger revamp of keel (always-deployed ext → episode-logging
daemon → UX revamp → dynamic interventions). Repo direction: **keel standalone**, with domain
types kept surface-agnostic for a cheap future fold into the zenborg consolidation.

Slice A is intentionally tiny: make the extension a permanent fixture of the browser instead of
something that only works while a dev server runs.

## Problem

The extension only lives while `pnpm dev:browser` runs. Two failures follow:

1. **Not persistent.** Stop the dev server and the extension goes stale / stops working.
2. **Storage resets.** Each reload (and each load method) mints a new random extension ID. All
   shield toggles live in `chrome.storage` keyed by that ID, so they reset whenever the ID changes.

Root cause: there is no stable extension identity, and no production build the user installs once.

## Goal

Install the extension once in Brave, have it survive browser restarts and code rebuilds without a
dev server, and keep all stored state across rebuilds. Keep the existing HMR dev flow intact for
development.

## Approach (selected)

Load-unpacked production build + stable manifest `key`. Chosen over no-nag policy force-install
(more setup, deferred) and Chrome Web Store unlisted (overkill, semi-public). The private key saved
now keeps the policy/CRX upgrade cheap if zero-nag is wanted later.

## Changes

### 1. Stable extension ID — `manifest.key`

Add a `key` field (base64-encoded SPKI DER public key) to the manifest in
`apps/browser/wxt.config.ts`. Chromium derives a deterministic extension ID from it, so the ID —
and therefore `chrome.storage` contents and granted permissions — survive every rebuild, reload,
and Brave restart.

Keypair is generated once:

```bash
mkdir -p .keys
openssl genrsa 2048 > .keys/equanimi.pem
# public key → base64 SPKI DER → value for manifest.key:
openssl rsa -in .keys/equanimi.pem -pubout -outform DER | openssl base64 -A
```

- The **private** `.pem` is stored at repo-root `.keys/equanimi.pem` and gitignored. It is only
  needed to pack a signed CRX later (the policy / no-nag upgrade path).
- The **public** key string is committed in `wxt.config.ts` as `manifest.key`. Public keys are safe
  to commit; the derived ID is not a secret.

The same key applies to both dev and production builds, so the ID is identical across them and
stored state carries over between `pnpm dev:browser` and the deployed build. The two share an ID, so
only one is loaded at a time.

### 2. `deploy:browser` script

- `apps/browser/package.json`: keep `build` (`wxt build`). Add a `deploy` alias that builds and
  echoes the absolute load-unpacked path (`.../apps/browser/dist/chrome-mv3`) on success.
- Root `package.json`: add `deploy:browser` → `pnpm --filter @equanimi/browser deploy`.

Build output is `apps/browser/dist/chrome-mv3` (from the existing `outDir: "dist"` config). It is
already gitignored via the root `dist` rule.

### 3. One-time install doc — `docs/deploy-browser.md`

Short runbook:

- First install: `pnpm deploy:browser` → `brave://extensions` → Developer mode ON → **Load
  unpacked** → select `apps/browser/dist/chrome-mv3`.
- The folder path is then fixed. Rebuilds overwrite in place.
- Updating to new code: `pnpm deploy:browser`, then click the reload icon on the extension card.
  No dev server, no reinstall, stored toggles intact.
- Note: Brave persists load-unpacked extensions across restarts. Any "developer-mode extensions"
  prompt is benign; this is not a store install.

### 4. Keep dev flow

`pnpm dev:browser` is unchanged for HMR iteration. No changes to entrypoints, shields, signals, or
storage code.

## Out of scope (Slice A)

- No-nag managed-policy force-install / CRX self-host (the saved `.pem` makes this cheap later).
- Auto-reload-on-rebuild.
- Cross-machine sync.
- UX revamp, episode daemon, dynamic interventions (later slices).
- Any change to `apps/desktop` or `packages/domain`.

## Verification

1. `pnpm deploy:browser` builds without error; prints the `dist/chrome-mv3` path.
2. Load unpacked in Brave. Open the popup; toggle a shield off.
3. Quit Brave fully, reopen. Extension still present; toggle still off (proves stable ID + persisted
   storage).
4. Edit a source file; `pnpm deploy:browser`; click reload on the card. Change is present; the
   toggle from step 2 is still off (proves ID stability across rebuilds).

## Files touched

- `apps/browser/wxt.config.ts` — add `manifest.key` (preserve the existing uncommitted
  `outDir: "dist"` edit).
- `apps/browser/package.json` — add `deploy` script.
- `package.json` (root) — add `deploy:browser` script.
- `.gitignore` (root) — add `.keys/`.
- `docs/deploy-browser.md` — new runbook.
- `.keys/equanimi.pem` — new, gitignored (not committed).

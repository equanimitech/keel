# Deploy the browser extension to Brave

The extension is installed once as a load-unpacked production build with a stable
extension ID. It survives Brave restarts and code rebuilds with `chrome.storage`
state intact — no dev server required. HMR dev (`pnpm dev:browser`) is unchanged.

## First install

```bash
pnpm deploy:browser
```

Then:

1. Open `brave://extensions`.
2. Toggle **Developer mode** ON (top right).
3. Click **Load unpacked**.
4. Select `apps/browser/dist/chrome-mv3` (the deploy command prints the absolute path).

The folder path is now fixed. Rebuilds overwrite it in place.

## Updating to new code

```bash
pnpm deploy:browser
```

Then click the **reload** icon on the extension card in `brave://extensions`.
No dev server, no reinstall — stored toggles stay intact (stable manifest `key`
keeps the extension ID constant across rebuilds).

## Notes

- Brave persists load-unpacked extensions across restarts. Any "developer-mode
  extensions" prompt on startup is benign — this is not a store install.
- Dev and production builds share the same ID (same `manifest.key`), so stored
  state carries over between `pnpm dev:browser` and the deployed build. Only load
  one at a time.
- The private signing key (`.keys/equanimi.pem`) is gitignored. It is only needed
  to pack a signed CRX later (the no-nag managed-policy upgrade path).

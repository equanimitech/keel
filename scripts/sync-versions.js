#!/usr/bin/env node

/**
 * Syncs the version from apps/tray/package.json into its tauri.conf.json.
 * Called automatically by changesets during `pnpm version-packages`.
 * (Was apps/desktop until that surface was removed — see
 * docs/decisions/2026-06-13-remove-desktop-preserve-compass-gems.md.)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const trayPkgPath = resolve(root, "apps/tray/package.json");
const tauriConfPath = resolve(root, "apps/tray/src-tauri/tauri.conf.json");

const trayPkg = JSON.parse(readFileSync(trayPkgPath, "utf-8"));
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));

if (tauriConf.version !== trayPkg.version) {
  tauriConf.version = trayPkg.version;
  writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
  console.log(`Synced tauri.conf.json version to ${trayPkg.version}`);
} else {
  console.log(`tauri.conf.json already at ${trayPkg.version}`);
}

// apps/agent/native-host-install.mjs
// @ts-check
// Install the native-messaging manifest so Brave can spawn `keel native-host`.
// Run: node apps/agent/native-host-install.mjs <extension-id>

import { writeFileSync, mkdirSync, chmodSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const HOST_NAME = "tech.equanimi.keel";
// Brave on macOS reads native-messaging host manifests from CHROME's host dir,
// NOT its own BraveSoftware path. Verified via fs_usage: a connectNative call
// makes Brave stat() ~/Library/Application Support/Google/Chrome/
// NativeMessagingHosts/<host>.json (plus the /Library system path). Brave reuses
// Chrome's location so hosts installed for Chrome work in Brave too.
const BRAVE_NM_DIR = join(
  homedir(),
  "Library/Application Support/Google/Chrome/NativeMessagingHosts"
);

const extId = process.argv[2];
if (!extId || !/^[a-p]{32}$/.test(extId)) {
  console.error("usage: node native-host-install.mjs <32-char-extension-id>");
  process.exit(1);
}

// A tiny launcher so the manifest's "path" is a single executable.
const keelDir = join(homedir(), ".keel");
const launcher = join(keelDir, "native-host.sh");
const keelMjs = resolve(import.meta.dirname, "keel.mjs");
mkdirSync(keelDir, { recursive: true });
if ((statSync(keelDir).mode & 0o002) !== 0) {
  console.error(`refusing to install: ${keelDir} is world-writable`);
  process.exit(1);
}
writeFileSync(launcher, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "${keelMjs}" native-host\n`);
chmodSync(launcher, 0o755);

const manifest = {
  name: HOST_NAME,
  description: "keel observability native host",
  path: launcher,
  type: "stdio",
  allowed_origins: [`chrome-extension://${extId}/`],
};

mkdirSync(BRAVE_NM_DIR, { recursive: true });
const manifestPath = join(BRAVE_NM_DIR, `${HOST_NAME}.json`);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
chmodSync(manifestPath, 0o644);

console.log(`Installed native-messaging host:\n  ${manifestPath}\n  launcher: ${launcher}\n  allowed extension: ${extId}`);

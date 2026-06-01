/**
 * Seed blocklist — the code-defined baseline of blocked domains.
 *
 * PUBLIC REPO: this committed file holds NO real domains. Personal entries
 * (and anything Claude adds on your behalf) live in `seed.local.ts`, which is
 * gitignored — see seed.local.example.ts for the shape. They are merged in
 * below at build time via Vite's optional-file glob (zero matches → empty).
 *
 * The runtime, user-editable half lives in chrome.storage.local (store.ts).
 * The effective blocklist is `unique(seed ∪ user)`.
 *
 * Each entry is a Drogue *target* at the deepest notch — `block`, friction
 * f = 1, no skip — enforced at the network layer (declarativeNetRequest dynamic
 * rules, see sync.ts) so the page never loads, in normal and incognito windows.
 */

// Optional, gitignored local override. import.meta.glob tolerates the file
// being absent (resolves to an empty record), so the public build is clean.
const localModules = import.meta.glob<{
  SEED_BLOCKED_DOMAINS?: readonly string[];
}>("./seed.local.ts", { eager: true });

const fromLocal: string[] = Object.values(localModules).flatMap(
  (m) => [...(m.SEED_BLOCKED_DOMAINS ?? [])]
);

export const SEED_BLOCKED_DOMAINS: readonly string[] = [...new Set(fromLocal)];

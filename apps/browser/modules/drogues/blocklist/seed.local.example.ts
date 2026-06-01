/**
 * Template for seed.local.ts (which is gitignored).
 *
 * Copy this file to `seed.local.ts` in the same folder and add your domains.
 * seed.ts merges it in automatically at build time; if seed.local.ts is absent,
 * the baseline is simply empty and you define everything from the manage page →
 * Blocklist tab instead.
 *
 *   cp seed.local.example.ts seed.local.ts
 */

export const SEED_BLOCKED_DOMAINS: readonly string[] = [
  // "example.com",
];

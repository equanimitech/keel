---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:87dbc300a4d693b3f85c02c66ad1fe9995987324257375b8861a22bfcc0be83b
  signedAt: 2026-06-14T19:28:55.009999Z
  signature: ed25519:XwPUomPJUx7WHE2P8akjn9hTDJ94o3qgoBb24N9qjklfncBnOtE4uoVO45lsEdEfcWZzzG3Bg7Wu1QSaI6uvCw==
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:87dbc300a4d693b3f85c02c66ad1fe9995987324257375b8861a22bfcc0be83b
  docFilename: 2026-06-14-ponytail-audit-over-engineering-cut-list.md
  stampedAt: 2026-06-14T19:37:15.872930Z
  signature: ed25519:LSJrtcVrU0erLBwlrh1nk9AjOn+kniCbkctripr3thDOz/1kGn0c/waKLVrdRyOkHs4IaBwu4F7lBUEK7+p7Dg==
---
> Over-engineering audit (ponytail-audit, repo-wide). Complexity only. Correctness, security, and performance are out of scope and belong to a normal review pass. Lists findings; applies nothing.

## Summary

keel is lean at the core. The agent core (`apps/agent/core.mjs`) is dense functional code with no speculative layers, and the time-helper overlap with `@keel/domain` is deliberate (the agent deploys standalone with no TS imports). The fat lives in one place: the shared UI package ships a full shadcn component set, of which only three components are ever used.

Net opportunity: roughly 910 fewer lines and 11 fewer dependencies.

## Findings (ranked, biggest cut first)

### 1. delete: 11 unused shadcn components (894 lines)

Only `Button`, `Badge`, and `Card` are ever imported, from a single site (`apps/browser/entrypoints/popup/Popup.tsx`). The remaining eleven are dead:

`input`, `label`, `separator`, `switch`, `tabs`, `slider`, `scroll-area`, `tooltip`, `dialog`, `select`, `dropdown-menu`.

Location: `packages/ui/src/components/`. Also drop their lines from `packages/ui/src/index.ts`.

### 2. native: 11 dependencies go with them

The dead components are the only consumers of these deps:

`@radix-ui/react-{dialog, dropdown-menu, label, scroll-area, select, separator, slider, switch, tabs, tooltip}` plus `lucide-react` (imported only by the dead dialog, select, and dropdown-menu).

The surviving components (Button, Badge, Card) need only `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, and `tailwind-merge`.

Location: `packages/ui/package.json`.

### 3. delete: BCT taxonomy data (about 37 KB, 3 CSVs)

No code reads `bct_taxonomy.csv`, `mechanisms_of_action.csv`, or `groupings.csv`. They are remnants of the intervention layer retired on 2026-06-12. The layer returns as a separate P5 module on personal baselines; this seed data does not need to wait in the tree until then.

Location: `packages/domain/data/`.

### 4. yagni: half of value-objects.ts

`Duration`, `AppName`, `createDuration`, `fromMinutes`, `toMinutes`, and `createAppName` are exported but never consumed. Only `createDomain` and the `Domain` type are used (by `apps/browser/modules/activity/events.ts`). Keep the Domain value object, drop the rest.

Location: `packages/domain/src/value-objects.ts`.

### 5. yagni: orphaned taxonomy exports

`canonicalKind` and `LEGACY_KIND_ALIASES` are exported from the domain barrel with zero external callers. Verify there is no internal use in `activity.ts` before cutting the alias map.

Location: `packages/domain/src/index.ts`.

### 6. shrink: duplicated log-filename helpers

`browserLogFileName` duplicates `logFileName` verbatim except for the `.browser` versus `.agent` suffix. One `logFileName(ts, surface)` collapses both.

Location: `apps/agent/core.mjs:451-462`.

## What to keep

- `apps/agent/core.mjs`: clean. The duplication with `@keel/domain` time helpers is intentional (standalone deploy, no TS imports, per CLAUDE.md). Left untouched.
- `@keel/ui` as a package: housing three used components in a shared package is borderline, but there is real stated intent for the tray frontend to consume it. Keep the package, cut only the dead components inside it.
- `geist`: declared, and appears only in a doc comment, but `fonts.css` likely loads it. Verify before dropping; not counted in the net.

## Next steps

- Apply finding 1 plus 2 first (mechanical, reversible via `shadcn add`): delete the eleven component files, trim `index.ts`, remove the eleven deps from `packages/ui/package.json`, reinstall.
- Apply findings 3 through 6 as a follow-up pass.
- Out of scope here and worth a normal review later: the friction and lockdown state machine, the `matchDispatch` stack logic, and the Rust tray core.

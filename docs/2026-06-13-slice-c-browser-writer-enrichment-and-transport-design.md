---
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:a7262514f353780b097a5df748b861365b44c941c6f5c3d48616bbb73f19a882
  docFilename: 2026-06-13-slice-c-browser-writer-enrichment-and-transport-design.md
  stampedAt: 2026-06-13T16:03:57.981463Z
  signature: ed25519:ARBTZPplKuPPYJR/z4Zj8DdNT59iwRJSrAlH+NmP6oF5oQH9O7zG30zSUa2+GW409ls3gW/8VBV1puCDzO3BAg==
---
# keel slice C — browser writer enrichment + observability transport

**Date:** 2026-06-13
**Status:** Design (approved in brainstorm). `equanimitech` not under git here — written, not committed.
**Roadmap:** Implements pitch-queue **slice C** ("Browser event writer, transport decided") from the stamped 2026-06-12 observability-first roadmap, and answers its open **Decision #1** (browser transport).
**Companion:** `docs/2026-06-13-watchlist-seeding-from-history-design.md` (the cold-start bootstrap; this slice is the steady-state observer it hands off to).

## Why

The browser is **Writer #3** of the observability substrate, but today it is both *impoverished* and *siloed*:

- **Impoverished schema.** Live event data (`~/.keel/log/*.browser.jsonl`) carries `{domain}` only — no tab identity, and same-domain route changes are never logged. Real symptom from a captured log: a burst of `tab_activated{google}`/`{github}` ~0.5 s apart is uninterpretable (which tab? how many?), and `youtube.com/shorts/A → /shorts/B` is **invisible** (`shouldLogNavigation` fires on domain *change* only). So the live writer is structurally blind to the exact **route-level compulsion** (Shorts binge) the history spike proved is the unit of analysis.
- **Siloed transport.** Browser events sit in extension IndexedDB; `watchlist.observe` is hand-mirrored into the extension (`manage/main.ts`: *"keep them in sync… until the relay exists"*). Extensions can't touch the filesystem.

This slice fixes both — enrich the schema (the value) and ship a secure transport (the delivery) — staying inside the observe-only baseline window (no interventions; the 2026-06-12 retirement holds).

## Scope

**In:** tab identity, observe-tier route visibility, span integrity across SW churn; a native-messaging transport (events out, observe-list in); a hardened native-messaging host.
**Out (descoped in brainstorm):** realtime park→browser-block (commitment-device feature; near the retired-intervention line — deferred); any intervention; Safari; multi-machine sync.

## 1. Schema enrichment

All additions conform to the stamped event taxonomy (`packages/domain/docs/event-taxonomy.md`): span / switch / completion grammar, **domains never full URLs**, `logDetail` dials depth, kinds accrete (open set).

### 1a. Tab identity (all tiers — opaque, content-free)

- Mint an **opaque per-tab uuid** the first time a tab is seen; carry it as `payload.tab` on `tab_activated`, `navigation_committed`, and the focus events.
- The `tabId → uuid` map lives in **`chrome.storage.session`** (survives MV3 service-worker recycling within a browser session; cleared on browser restart — a new behavioral day anyway).
- Read-side gains: reconstruct per-tab journeys; disambiguate concurrent same-domain tabs; attribute focus spans to a tab.
- Gradient: a uuid is not content. Safe at every tier.

### 1b. Route visibility (observe-tier + `logDetail` only — normalized)

- `navigation_committed` payload gains optional **`route`**, and a new completion event **`route_changed`** is emitted on **same-domain** route hops (fixing the SPA blindness).
- **Gated:** emitted **only** when the domain is on the observe tier *and* `logDetail` is on. Default behavior (every non-observed domain) is unchanged: domain-only.
- **Normalized, never raw:** `route` is a route-registry match (`/shorts`, `/watch`, `/feed`) or the first path segment — **never** the full path, query, fragment, or title.
- **Trusted extraction:** `route` is derived in the background service worker from the browser-attested `tab.url` (via `chrome.tabs`/`webNavigation`) — **never** from page-script-claimed data. The hostile-page boundary (already enforced for sensor messages) extends to routes.

### 1c. Span integrity across writer churn

- Persist open **focus/idle span state** in `chrome.storage.session` so a span survives a SW restart instead of orphaning (the captured log shows `focus_end` with no matching `focus_start` in-epoch).
- `writer_started` stays the epoch marker (`sessionId` = writer epoch, mechanical). Bouts remain **read-side** derived; consumers stitch across epochs (existing `canonicalKind` + bout derivation).
- Rule honored: never fabricate a span; a span end with an unobserved start is emitted **without** `durationMs`.

## 2. Transport — native-messaging host (observability-only)

Native messaging chosen over a localhost server for security (below) and ethos (no network, no standing daemon). The host is **`keel.mjs`** (the agent — already the `~/.keel/` filesystem authority; tray-as-host is the roadmap's eventual home, deferred).

### Protocol

- Standard Chrome native messaging: 32-bit-length-prefixed JSON on stdio; ≤1 MB/message (batch under the cap, chunk if needed).
- **Up (extension → host):** `{ type: "events", events: ActivityEvent[] }`. Host validates, appends to `~/.keel/log/YYYY-MM-DD.browser.jsonl`, replies `{ type: "ack", ids: string[] }`. Extension prunes acked events from IndexedDB → at-least-once, no loss on SW death.
- **Observe pull (extension → host → extension):** extension sends `{ type: "request_observe" }` on connect; host replies `{ type: "observe", domains: string[] }` (read from `config.json`). Extension replaces its `chrome.storage` observe list → retires the manual mirror. (Request/response keeps the host's inbound surface to exactly two message types — see Security.)

### Lifecycle / cadence

- Extension opens the port on SW startup and on a `chrome.alarms` tick (~5 min) to flush even when idle. Connect → drain buffer up, receive observe snapshot down, close. Eventual-consistency; nothing latency-sensitive.
- Host is spawned by the browser per connect, exits on disconnect. No daemon.

## 3. Security (first-class)

**Principle: the host is a dumb, append-only writer that treats every extension message as hostile and exposes no command surface.**

| Threat | Mitigation |
|---|---|
| Any local process / web page reaching the channel | **No listening port.** Native messaging is a private stdin/stdout pipe Chrome spawns — not connectable by other processes. Manifest `allowed_origins` pins the **exact extension id**; only our extension can connect. (This is the core security win over a localhost server.) |
| Hostile-page-adjacent extension sends poisoned input | Host treats **all inbound as untrusted**: strict **schema validation** — `type` allowlist, `kind` allowlist, payload field allowlist, type + per-field size caps. Off-schema → dropped, logged to the host's own stderr, never written. |
| Command / path injection | Host is **command-less** — only `events` (append) and `request_observe` (read). The log **path is computed by the host** (date-derived), never taken from a message. No `delete`/`overwrite` surface. No shell-out with message-derived data; `keel.mjs` never invoked with extension-supplied args. |
| Log-flood DoS / disk exhaustion | Per-message event cap, per-field size cap, **rate limit** (events/min), retention guard on the JSONL. |
| Privilege escalation | Host runs **as the user, never root** — explicitly *not* the `vice-block.sh` root daemon. **No network calls**, ever (consistent with the whole substrate). |
| Manifest / host-binary tampering → code-exec on connect | Manifest + host entry in **user-owned, non-world-writable** paths (`~/.keel/`, manifest 0644, host 0755); install script asserts perms and that `~/.keel` is not world-writable. |
| Poisoned observe-list → extension deep-senses a sensitive domain | The observe list originates only from the user's own `config.json` (host reads it); write access to `config.json` is the user's. Extension validates it is a domain array; ignores malformed. |
| Torn reads vs the agent surface | **Single writer** (`keel.mjs`) + **atomic append / temp-rename** — `store.mjs`'s plain `writeFileSync` is hardened to atomic temp+rename first (prerequisite, flagged in the relay idea doc). |

**Net:** a fully-compromised extension can still *only* append schema-valid `ActivityEvent`s to one computed file and read the observe list. Nothing else is reachable.

## Degradation (fail-open, matching `writer.ts`)

- Host absent / not installed → extension keeps buffering to IndexedDB + the export button remains the manual fallback; browsing never breaks.
- Observe sync unavailable → extension uses last-known list (or its self-authored mirror); deep sensors degrade to whatever it last had.
- A dropped/invalid event → dropped silently; never breaks the browsing session.

## Testing

- **Schema validation** — malformed / oversized / unknown-kind / unknown-type messages are rejected and never written; valid batch is appended verbatim.
- **Path safety** — a message attempting to influence the path has no effect; the host writes only the date-derived file.
- **Tab identity** — uuid persists across a simulated SW restart (storage.session); concurrent same-domain tabs get distinct uuids.
- **Route gating** — `route`/`route_changed` emitted *only* for observe-tier + `logDetail`; non-observed domains stay domain-only; `route` never contains query/fragment.
- **Same-domain hop** — `youtube.com/shorts/A → /shorts/B` now emits `route_changed` (previously silent).
- **Ack/prune round-trip** — events survive SW death (buffered), are acked once, pruned once; at-least-once, no duplicates after prune.
- **Rate/size caps** — flooding is throttled; over-cap messages rejected.
- **Atomic append** — concurrent agent read never sees a torn line.

## Phasing within slice C

- **C1 — schema enrichment** (ships on the export stopgap; no transport dependency): tab uuid + observe-tier route + `route_changed` + span persistence. This alone recovers the route-level signal in the live writer.
- **C2 — native-messaging transport**: the host + manifest + install step + atomic-write hardening + observe-list push. Retires the manual mirror and the manual export.

## Open questions

- Native-messaging host id / manifest name (`tech.equanimi.keel.host`?) and install path per Chromium-family browser (Brave dir differs from Chrome).
- `route_changed` volume on heavy SPA use — may need a same-route debounce (mirror the existing 30s-bin discipline) so a Shorts binge doesn't flood; cap is fine since it's observe-tier-only.
- Whether the route registry is shared with the bootstrap's registry (`watchlist_scan.py`) — yes, factor it into `@keel/domain` so both surfaces normalize routes identically.
- Tray-as-host migration trigger (when the tray owns enough to justify moving the host off `keel.mjs`).

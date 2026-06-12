# keel — desktop as the browser↔gate relay

_Captured 2026-06-05. Parked for later. Not started._

## Why this exists

`keel park` (shipped today in `packages/keel-gate`) blocks **Claude coding tools** until the
05:00 reset. Open question: make **one park** also block YouTube / chess / etc. in the browser.

Those live on a different surface (browser Drogue, Chrome DNR). The two surfaces don't share
runtime state today. The relay question: who bridges them?

## The answer

Desktop (Tauri) is the relay **for the browser** — not for the Claude gate.

Three processes, who can reach the truth (`~/.keel/state.json`):

```
  keel-gate (Node hook)   desktop (Tauri)        browser ext (Chrome)
  ephemeral, per-call     long-lived, native     long-lived, SANDBOXED
  reads file direct  ✓    reads file direct  ✓    CANNOT touch file  ✗
  writes nights/park ✓    fs-watch + serve   ✓    only HTTP / native-msg
```

- **keel-gate ↔ file**: trivial. Hook reads `state.json` per spawn. No relay needed. Already works.
- **browser ↔ file**: impossible (sandbox). Needs a live native peer.
- **desktop**: only process that is long-lived AND native-filesystem AND can serve
  localhost/native-messaging. So it's the extension's window into the gate.

## Shape

```
~/.keel/state.json  ◄── keel-gate writes (park, nights)
        │ fs-watch
        ▼
   desktop (Tauri)  ──localhost WS / native-msg──►  browser ext → DNR block YouTube/chess
```

`keel park 21:00` writes file → desktop sees change → pushes "park on" to extension → sites blocked.

## Get right before building

1. **Single writer.** keel-gate already writes `state.json`. If desktop also writes
   (browser-initiated park) → race. Fix: desktop writes by shelling `node keel.mjs park` — one
   write path. Also: `store.mjs` uses plain `writeFileSync`, not atomic temp+rename — harden
   before two readers.
2. **Degrade clean.** Desktop is a soft dep for *browser*-park, never for *Claude*-park.
   Desktop closed → Claude still gated (hook reads file), browser just misses the signal.
   Keep this failure mode.

## Shortcut (no desktop)

Register `keel.mjs` as a Chrome **native-messaging host** — extension ↔ keel.mjs direct, skip
Tauri. Fiddly manifest (allowed_origins = ext id, host manifest in Chrome's NativeMessagingHosts
dir). Desktop is still the right long-term home (owns Compass UI anyway).

## Related

- [[2026-06-04-keel-allow-scheduling-when-parked]]
- park feature: `packages/keel-gate` — `park` / `unpark` / soft-skippable via credit

# keel browser

**See where your attention goes — privately, on your own device.**

The web surface of keel. It observes; it does not (yet) intervene. Three things:

- **Activity writer** — coarse attention events on every site you visit (tab switches, navigations, focus/idle spans), so you can see where your time goes and how your focus fragments.
- **Watchlist sensors** — on the domains you put on the *observe tier*, type-based sensors record key-action completions (a video started/finished, a post seen, a game finished). Counts and timings, never content.
- **The blocklist drogue** — a user-owned commitment device that blocks domains at the network layer. The lone survivor of the retired intervention layer.

keel is observability-first: it accumulates the raw signal now; gentle steering toward what helps you flourish comes later, built on your own baselines (see the root `README` and `docs/decisions/`).

## Build & load

```bash
pnpm install
pnpm build        # production build → .output/chrome-mv3/
```

Then in a Chromium browser:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select `.output/chrome-mv3/`

Dev: `pnpm dev` (hot-reload, fresh profile). Built with [WXT](https://wxt.dev).

## What it logs

- **Coarse events** (every site): `tab_activated`, `navigation_committed`, `focus_start` / `focus_end`, `idle_start` / `idle_end`.
- **Sensor completions** (observe tier only): `video_started` / `video_ended`, `post_seen`, `product_seen`, `game_finished` — domain + capped scalars, gated behind the watchlist and the hostile-page boundary (see `modules/sensors/`).

Everything lands in extension-local IndexedDB; the manage page exports it as JSONL on demand. The popup mirrors today's tally and which domains are deep-sensed.

## Sovereignty & privacy

keel is built foundation-first: **sovereignty before everything**. The privacy
properties below aren't a policy you have to trust — they're structural, enforced
by what the extension is *capable* of.

**Local-First Ownership.** All state lives in `chrome.storage.local` and
extension-local IndexedDB. No account, no server, no sync. keel works fully
offline and nothing breaks if equanimitech disappears tomorrow — there is no
equanimitech server in any code path.

**keel cannot read your browsing.** The manifest requests `declarativeNetRequest`
— *not* `declarativeNetRequestWithHostAccess`, *not* `webRequest`, and *no*
`host_permissions`. Blocking happens by static rule inside the browser engine;
the extension never sees request contents or page bodies. keel makes **no network
calls at all** — events stay in local IndexedDB until you manually export them.

**Modification Rights.** Open source, forkable. Your blocklist is yours to read
and reason about — a small, legible list, not a black box. Pin any version via
load-unpacked + the stable extension `key`.

### The blocklist Drogue

A **simple, user-owned blocker**. Each domain is a full-drag target — notch
`block`, friction `f = 1`, **no skip** — enforced at the network layer
(`declarativeNetRequest` dynamic rules) so the page never loads, in normal and
incognito windows alike.

**One source: `~/.keel/rules/*.json`.** A rule carrying a `standing` cooldown
contributes its domains; the relay mirrors them into `chrome.storage.local`, and
`modules/drogues/blocklist/sync.ts` projects that mirror onto DNR. Nothing is
blocked from anywhere else.

Until 2026-08-06 there were three sources — a gitignored build-time seed, a
`chrome.storage` list you edited in a manage tab, and the rules file — unioned
together. Adding a domain took one edit; *removing* one took three, in places
you had to remember existed. The seed and the storage list are gone.

**Holistic Control — by design, not by black box.** Every block is a domain you
chose, readable in one plain JSON file you own. Removing one means editing that
file and reloading the extension: **compassionate friction**, a door you open
with deliberate effort, never a locked one. The friction is the point; the fact
that you *can* is the sovereignty.

## Incognito

For the porn Drogue (or any keel block) to hold in incognito — where porn is most
often browsed — you must flip the switch once:

1. `chrome://extensions` → keel → **Details**
2. Enable **Allow in Incognito**

keel runs `incognito: "spanning"` (one shared instance, shared local storage), so
your blocks carry over with no separate setup.

## Philosophy

Buddhism speaks of three poisons: lobha (craving), dosa (aversion), moha (delusion). Platforms have industrialized these poisons at global scale. keel is named after equanimity (upekkhā) — the balanced awareness that interrupts compulsive cycles.

First it helps you **see** the pattern in your own attention; the gentle steering toward what helps you flourish comes later, on your terms.

## License

MIT

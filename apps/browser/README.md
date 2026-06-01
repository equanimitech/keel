# keel

**Stopping cues for the internet.**

A modular attention intervention platform. Part of the [mindful tech](https://github.com/topics/mindful-tech) ecosystem — tools that help humanity regenerate its attention span.

## Why

Digital experiences have removed every stopping cue that physical experiences provide naturally. Books end. Meals finish. Even Pringles cans eventually empty. But Netflix never runs out, ChatGPT never stops talking, and the feed is bottomless.

keel puts stopping cues back. Each module targets a specific compulsion pattern on a specific platform — and you toggle exactly what you need.

## Modules

### YouTube Shorts Shield (v0.1 — active)

Prevents compulsive scrolling on YouTube Shorts.

| Layer | What it does |
|-------|-------------|
| **CSS scroll-snap override** | Disables `scroll-snap-type` and `overflow-y` on the Shorts container |
| **Navigation button hiding** | Removes the "Previous video" / "Next video" buttons |
| **JS event interception** | Blocks `wheel`, `touchmove`, `keydown` (arrows, j/k, space, page up/down) and locks `scrollTop` |

### Chess.com Shield (planned)

Stopping cue after games. Cooldown before rematch.

### LinkedIn Shield (planned)

Disables infinite scroll on the main feed. Hides algorithmic noise.

## Install

### From source (developer mode)

```bash
git clone https://github.com/rafaelbatistab/equanimi.git
cd equanimi
pnpm install
pnpm build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `.output/chrome-mv3` folder

### From the Chrome Web Store

_Coming soon._

## Development

```bash
pnpm dev          # dev mode with hot-reload (opens a fresh Chrome profile)
pnpm build        # production build → .output/chrome-mv3/
pnpm zip          # zip for Chrome Web Store submission
```

Built with [WXT](https://wxt.dev).

## Features

- **Per-module toggles** via popup — changes apply immediately, no reload
- **Badge indicator** — green "ON" badge when active
- **Persistent state** — remembers your preferences across sessions
- **Lightweight** — ~65 KB total, no external dependencies at runtime

## Roadmap

- [ ] Chess.com shield (post-game stopping cue + cooldown)
- [ ] LinkedIn shield (feed scroll blocking + sidebar hiding)
- [ ] Cheat days / blocked days scheduling
- [ ] Compulsion cooldown timers
- [ ] Usage time tracking / weekly reflection
- [ ] Firefox support

## Philosophy

Buddhism speaks of three poisons: lobha (craving), dosa (aversion), moha (delusion). Platforms have industrialized these poisons at global scale. keel is named after equanimity (upekkhā) — the balanced awareness that interrupts compulsive cycles.

We don't block the internet. We put gaps back where platforms removed them. Gaps where awareness can enter.

Learn more at [equanimi.tech](https://equanimi.tech).

## Tags

`mindful-tech` · `attention` · `digital-wellbeing` · `stopping-cues` · `browser-extension` · `equanimity` · `wxt`

## License

MIT

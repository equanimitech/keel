---
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:86b93ee88ac4dece091af8d2bfeb31cab1a1625f679513826847970d894fb85f
  docFilename: 2026-06-08-keel-alfred-workflow-design.md
  stampedAt: 2026-06-08T16:51:07.135115Z
  signature: ed25519:VvAGh5d7WtGOaeugvWD25Cdi1LLnNoa0GofBuN+nDvxovTH/EF4PPRDa/bIxbcNKAVOvSlfBhYW8CgDcVqzdDQ==
---
# keel — Alfred workflow (ritual launcher)

**Date:** 2026-06-08
**Status:** design approved, pre-implementation

## Purpose

Make the keel ritual system invocable globally without hunting for a terminal or
remembering shell aliases. One Alfred keyword surfaces every ritual and keel
action; picking one either opens Claude on that ritual or runs an instant keel
command and reports the result.

Today the only entry points are `~/.keel/aliases.zsh` (require a focused terminal)
and raw `node ~/.keel/keel.mjs …`. Alfred gives a calm, global, discoverable surface.

## Decisions (resolved)

- **Invocation:** a single `keel` Script Filter — type `keel`, get a filterable
  list of all rituals/actions. One Alfred object; discoverable; version-controllable.
  (Not keyword-per-ritual: ~12 objects, no discovery, keyword collisions.)
- **Instant actions** (vices, panic, status, lock): run in the **background** and
  report via an Alfred **notification** — no window steals focus. (Rituals that need
  Claude still open a terminal; they are interactive.)
- **Vice surface:** use the new `keel vice <on|off|skip|status|panic>` (sudoers
  handles privilege), **not** the stale `sudo vice-block.sh` aliases.
- **Source of truth:** the bundle lives in the keel repo (`packages/keel-alfred/`),
  installed into Alfred by a script — matching keel's source-in-repo pattern.
- **Audience:** built for the operator now, but with a **generalization seam** — the menu is
  a declarative item-table and the environment knobs are variables at the top of the
  scripts. Going generic later (externalize the table to a config file + a README) is
  cheap and additive. No speculative config engine now (YAGNI; matches the
  keel-generalization memo's stance that generalization is a deliberate later effort).

## Architecture

```
packages/keel-alfred/
  info.plist     keyword `keel` (Script Filter) ──wired──> Run Script
  menu.sh        Script Filter: emit the item list as Alfred JSON (filterable)
  run.sh         receive the selected item's `arg`, dispatch by prefix
  install.sh     copy bundle -> Alfred workflows dir, reload Alfred
```

Each unit has one job: `menu.sh` only *describes* the menu; `run.sh` only
*dispatches*; `info.plist` only *wires* the two; `install.sh` only *deploys*.
The dispatcher shells out to existing `~/.keel/keel.mjs` and `claude` — it adds no
keel logic of its own.

### Generalization seam

Both scripts open with a small config block so personalization lives in one place,
not scattered through logic:

```sh
TERMINAL="iTerm"                 # which terminal to open for interactive rituals
KEEL_DIR="$HOME/.keel"           # keel install location
CLAUDE="claude"                  # the Claude Code launch command
```

`menu.sh` holds the menu as a single declarative `ITEMS` table (`title | subtitle |
arg` rows) — adding/removing a ritual is a one-line edit, and the table is the exact
thing that later moves to an external `menu.json` to make the workflow generic. No
config-loading machinery is built now; the seam is just "data separated from
dispatch + knobs at the top."

### Arg scheme (`run.sh` dispatches by prefix)

| Prefix | Action |
|---|---|
| `ritual:<prompt>` | `osascript` → open **iTerm**, run `claude "<prompt>"` (interactive) |
| `keel:<args>` | `node ~/.keel/keel.mjs <args>` in background → `display notification` with stdout |
| `py:<path>` | open iTerm, run the python pipeline (long-running, wants a window) |

`menu.sh` receives the text typed after `keel `. Empty → full menu. A leading
`intention` / `appetite` / `sidenote` → emit a single live item carrying the rest
as the prompt (`ritual:/intention ship the export feature`).

### Menu contents

| Group | Items → arg |
|---|---|
| Rituals → Claude/iTerm | Morning `ritual:good morning` · Wind-down `ritual:wind down` · Sign-off `ritual:/sign-off` · Weekly `ritual:/weekly-review` · Recall `ritual:/recall` · Wake-up `ritual:/wake-up` |
| With args → Claude | Intention `ritual:/intention <x>` · Appetite `ritual:/appetite <x>` · Sidenote `ritual:/sidenote <x>` |
| Instant → bg + notify | Vices on/off/skip/status `keel:vice …` · 🛑 Panic `keel:vice panic` · Status `keel:status` · Lock now `keel:signoff` |
| Pipelines → iTerm | Journal review `py:~/.keel/journal-review.py` · Jungian distill `py:~/.keel/jungian-distill.py` |

## Install / storage

- Bundle id `pro.themia.keel`. `install.sh` copies `packages/keel-alfred/` into
  `~/Library/Application Support/Alfred/Alfred.alfredpreferences/workflows/<id>/`
  and asks Alfred to reload (`osascript`/`AppleScript` reload, or relaunch).
- Reinstall = re-copy. Source edits happen in the repo, never in the Alfred copy.

## Testing

- `plutil -lint info.plist` — valid plist.
- Run `menu.sh ""` and `menu.sh "intention foo"` standalone — assert valid Alfred
  JSON (pipe through a JSON validator).
- Run `run.sh "keel:status"` and `run.sh "keel:vice status"` standalone — assert it
  invokes keel and emits a notification (no error).
- `run.sh "ritual:good morning"` opens iTerm with the command (manual check).
- Then install + fire one item of each of the three kinds.

## Out of scope (YAGNI)

- Keyword-per-ritual shortcuts, hotkey triggers, the keel-console TUI (separate idea).
- Editing keel state/config from Alfred beyond the existing `keel.mjs` commands.
- Auto-detecting terminal app — iTerm is assumed (the only non-default terminal installed).
- **Full generic/distributable version** — externalizing the menu to a config file,
  a README, an importable bundle for other keel+Claude users. Deferred until keel
  itself ships; the seam above keeps it cheap. (Tracked with the keel-generalization memo.)

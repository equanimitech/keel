# keel — Alfred workflow

Global launcher for the keel ritual system. Type `keel` in Alfred → a menu of
every ritual and keel action.

- **Rituals** (Morning, Wind-down, Sign-off, Weekly, Recall, Wake-up, and
  Intention/Appetite/Sidenote with inline text) open Claude in iTerm.
- **Instant actions** (Vices on/off/skip/status, Panic, Status, Lock now) run in
  the background via `keel.mjs` and report through a notification.
- **Pipelines** (Journal review, Jungian distill) open in iTerm.

## Install / update

    packages/keel-alfred/install.sh

Source of truth is this directory; the installer copies it into Alfred. Edit here,
re-run the installer. Requires Alfred 5 Powerpack, iTerm, and keel at `~/.keel`.

## Personalize

`run.sh` top: `TERMINAL` / `KEEL_DIR` / `CLAUDE`. `menu.sh`: the `ITEMS` table.
(Later: move `ITEMS` to a `menu.json` to make this generic — see the design spec.)

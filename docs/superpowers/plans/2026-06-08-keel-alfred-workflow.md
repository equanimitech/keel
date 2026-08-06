# keel — Alfred workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a global Alfred launcher for the keel ritual system — one `keel` keyword opens a filterable menu; rituals launch Claude in iTerm, instant keel actions run in the background and report via notification.

**Architecture:** One Alfred Script Filter (`menu.sh`) feeds a Run Script (`run.sh`) that dispatches by an `arg` prefix scheme (`ritual:` / `keel:` / `py:`). The dispatcher only shells out to the existing `~/.keel/keel.mjs` and `claude`. Source lives in `packages/keel-alfred/`; `install.sh` deploys it into Alfred. Built personal-now with a generalization seam: menu is a declarative table, env knobs sit at the top of each script.

**Tech Stack:** bash, AppleScript (osascript), Alfred 5 Powerpack workflow (plist), Node (only via `keel.mjs`).

**Spec:** `docs/superpowers/specs/2026-06-08-keel-alfred-workflow-design.md` (stamped).

---

## File structure

```
packages/keel-alfred/
  menu.sh      Script Filter — emit Alfred JSON item list; own filtering + live arg preview
  run.sh       Run Script — parse selected arg, dispatch by prefix (ritual:/keel:/py:)
  info.plist   wire keyword `keel` (Script Filter) → Run Script
  install.sh   copy bundle → Alfred workflows dir, reload Alfred
  README.md    one-paragraph: what it is, how to (re)install
```

Conventions: every script starts `#!/usr/bin/env bash` + `set -euo pipefail` + the env-knob block. `run.sh` honors `DRY_RUN=1` (print the resolved command instead of executing) so dispatch is testable without spawning iTerm.

---

### Task 1: `menu.sh` — the Script Filter menu

**Files:**
- Create: `packages/keel-alfred/menu.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# keel Alfred — Script Filter. Emits the ritual menu as Alfred JSON.
# Owns its own filtering (Script Filter is configured alfredfiltersresults=false).
set -euo pipefail

# ── generalization seam: knobs (menu only needs labels; run.sh holds the rest) ──
ARG_VERBS="intention appetite sidenote"   # rituals that take inline free text

q="${1:-}"

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

emit_item() { # title | subtitle | arg
  local title="$1" subtitle="$2" arg="$3"
  printf '{"uid":"%s","title":"%s","subtitle":"%s","arg":"%s","match":"%s"}' \
    "$(json_escape "$arg")" "$(json_escape "$title")" "$(json_escape "$subtitle")" \
    "$(json_escape "$arg")" "$(json_escape "$title $subtitle")"
}

# Live free-text preview: "intention ship the export" → one item carrying the rest.
verb="${q%% *}"; rest="${q#* }"
if printf '%s' "$ARG_VERBS" | grep -qw "$verb" && [ "$rest" != "$q" ] && [ -n "$rest" ]; then
  printf '{"items":[%s]}' \
    "$(emit_item "Set ${verb}: ${rest}" "→ Claude /${verb}" "ritual:/${verb} ${rest}")"
  exit 0
fi

# The declarative menu table: title | subtitle | arg   (the seam → later a menu.json)
ITEMS=(
  "Morning|good morning → Claude|ritual:good morning"
  "Wind-down|wind down → Claude|ritual:wind down"
  "Sign-off (ritual)|/sign-off → Claude|ritual:/sign-off"
  "Weekly review|/weekly-review → Claude|ritual:/weekly-review"
  "Recall|/recall → Claude|ritual:/recall"
  "Wake-up|/wake-up → Claude|ritual:/wake-up"
  "Intention…|type: keel intention <focus>|ritual:/intention"
  "Appetite…|type: keel appetite <tiny|small|normal|deep>|ritual:/appetite"
  "Sidenote…|type: keel sidenote <thought>|ritual:/sidenote"
  "Vices on|raise the site block till reset|keel:vice on"
  "Vices off|lower the site block|keel:vice off"
  "Vices skip|spend a credit, lift till reset|keel:vice skip"
  "Vices status|is the block up?|keel:vice status"
  "🛑 Panic|block all vices NOW|keel:vice panic"
  "Status|keel phase · credits|keel:status"
  "Lock now|sign off — lock coding till reset|keel:signoff"
  "Journal review|LM-Studio pipeline (iTerm)|py:journal-review.py"
  "Jungian distill|LM-Studio pipeline (iTerm)|py:jungian-distill.py"
)

out=""
ql="$(printf '%s' "$q" | tr '[:upper:]' '[:lower:]')"
for row in "${ITEMS[@]}"; do
  IFS='|' read -r title subtitle arg <<<"$row"
  hay="$(printf '%s' "$title $subtitle $arg" | tr '[:upper:]' '[:lower:]')"
  if [ -z "$ql" ] || printf '%s' "$hay" | grep -qF "$ql"; then
    [ -n "$out" ] && out="$out,"
    out="$out$(emit_item "$title" "$subtitle" "$arg")"
  fi
done
[ -z "$out" ] && out="$(emit_item "no match" "type a ritual name" "keel:status")"
printf '{"items":[%s]}' "$out"
```

- [ ] **Step 2: Make executable + verify full menu is valid Alfred JSON**

Run:
```bash
chmod +x packages/keel-alfred/menu.sh
packages/keel-alfred/menu.sh "" | python3 -m json.tool >/dev/null && echo "JSON OK"
packages/keel-alfred/menu.sh "" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d["items"]),"items")'
```
Expected: `JSON OK` then `18 items`.

- [ ] **Step 3: Verify filtering + live free-text preview**

Run:
```bash
packages/keel-alfred/menu.sh "vice" | python3 -c 'import sys,json; print([i["title"] for i in json.load(sys.stdin)["items"]])'
packages/keel-alfred/menu.sh "intention ship the export" | python3 -c 'import sys,json; d=json.load(sys.stdin); i=d["items"][0]; print(i["title"],"||",i["arg"])'
```
Expected: first prints the 4 "Vices …" + "Panic" titles; second prints `Set intention: ship the export || ritual:/intention ship the export`.

- [ ] **Step 4: Commit**

```bash
git add packages/keel-alfred/menu.sh
git commit -m "feat(keel-alfred): Script Filter menu (menu.sh)"
```

---

### Task 2: `run.sh` — the dispatcher

**Files:**
- Create: `packages/keel-alfred/run.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# keel Alfred — Run Script. Receives the selected item's arg, dispatches by prefix.
# DRY_RUN=1 prints the resolved action instead of executing (for tests).
set -euo pipefail

# ── generalization seam: environment knobs ──
TERMINAL="iTerm"                 # terminal app for interactive rituals
KEEL_DIR="${KEEL_DIR:-$HOME/.keel}"
CLAUDE="${CLAUDE:-claude}"

arg="${1:-}"
prefix="${arg%%:*}"
rest="${arg#*:}"

notify() { # message  (title fixed = keel)
  local msg; msg="$(printf '%s' "$1" | tr '\n' ' ' | sed 's/"/\\"/g')"
  osascript -e "display notification \"${msg}\" with title \"keel\""
}

open_iterm() { # shell-command-string
  local cmd="$1"
  if [ "${DRY_RUN:-}" = "1" ]; then printf 'ITERM: %s\n' "$cmd"; return; fi
  local esc; esc="$(printf '%s' "$cmd" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  osascript <<EOF
tell application "${TERMINAL}"
  activate
  create window with default profile
  tell current session of current window to write text "${esc}"
end tell
EOF
}

case "$prefix" in
  ritual)
    open_iterm "${CLAUDE} \"${rest}\"" ;;
  keel)
    if [ "${DRY_RUN:-}" = "1" ]; then printf 'KEEL: node %s/keel.mjs %s\n' "$KEEL_DIR" "$rest"; exit 0; fi
    out="$(node "${KEEL_DIR}/keel.mjs" ${rest} 2>&1 || true)"
    notify "${out:-done}" ;;
  py)
    script="${rest/#\~/$HOME}"; [ "${script#/}" = "$script" ] && script="${KEEL_DIR}/${script}"
    open_iterm "python3 \"${script}\"" ;;
  *)
    notify "keel: unknown action '${arg}'" ; exit 1 ;;
esac
```

- [ ] **Step 2: Make executable + verify ritual dispatch (dry run, no iTerm)**

Run:
```bash
chmod +x packages/keel-alfred/run.sh
DRY_RUN=1 packages/keel-alfred/run.sh "ritual:good morning"
DRY_RUN=1 packages/keel-alfred/run.sh "py:journal-review.py"
```
Expected:
```
ITERM: claude "good morning"
ITERM: python3 "/Users/<you>/.keel/journal-review.py"
```

- [ ] **Step 3: Verify keel dispatch (dry run)**

Run:
```bash
DRY_RUN=1 packages/keel-alfred/run.sh "keel:vice status"
DRY_RUN=1 packages/keel-alfred/run.sh "keel:status"
```
Expected:
```
KEEL: node /Users/<you>/.keel/keel.mjs vice status
KEEL: node /Users/<you>/.keel/keel.mjs status
```

- [ ] **Step 4: Verify a real keel action emits a notification**

Run (this one actually runs keel — safe, read-only):
```bash
packages/keel-alfred/run.sh "keel:status"
```
Expected: a macOS notification titled "keel" showing e.g. `keel[claude-code]: f=0.00 phase=day …`. (No error printed.)

- [ ] **Step 5: Commit**

```bash
git add packages/keel-alfred/run.sh
git commit -m "feat(keel-alfred): arg-prefix dispatcher (run.sh)"
```

---

### Task 3: `info.plist` — wire keyword → Script Filter → Run Script

**Files:**
- Create: `packages/keel-alfred/info.plist`

- [ ] **Step 1: Write the plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>bundleid</key><string>pro.themia.keel</string>
  <key>name</key><string>keel</string>
  <key>createdby</key><string>the operator</string>
  <key>description</key><string>keel ritual launcher — rituals to Claude, instant keel actions to notifications</string>
  <key>webaddress</key><string></string>
  <key>readme</key><string>Type `keel` to open the ritual menu.</string>
  <key>objects</key>
  <array>
    <dict>
      <key>type</key><string>alfred.workflow.input.scriptfilter</string>
      <key>uid</key><string>A1111111-1111-1111-1111-111111111111</string>
      <key>version</key><integer>3</integer>
      <key>config</key>
      <dict>
        <key>keyword</key><string>keel</string>
        <key>title</key><string>keel</string>
        <key>subtext</key><string>ritual launcher</string>
        <key>withspace</key><true/>
        <key>argumenttype</key><integer>1</integer>
        <key>type</key><integer>0</integer>
        <key>scriptfile</key><string></string>
        <key>script</key><string>./menu.sh "$1"</string>
        <key>runningsubtext</key><string>…</string>
        <key>alfredfiltersresults</key><false/>
        <key>alfredfiltersresultsmatchmode</key><integer>0</integer>
        <key>queuedelaymode</key><integer>0</integer>
        <key>queuedelayimmediatelyinitially</key><true/>
        <key>queuemode</key><integer>1</integer>
      </dict>
    </dict>
    <dict>
      <key>type</key><string>alfred.workflow.action.script</string>
      <key>uid</key><string>B2222222-2222-2222-2222-222222222222</string>
      <key>version</key><integer>2</integer>
      <key>config</key>
      <dict>
        <key>concurrently</key><false/>
        <key>escaping</key><integer>102</integer>
        <key>script</key><string>./run.sh "$1"</string>
        <key>scriptargtype</key><integer>1</integer>
        <key>scriptfile</key><string></string>
        <key>type</key><integer>0</integer>
      </dict>
    </dict>
  </array>
  <key>connections</key>
  <dict>
    <key>A1111111-1111-1111-1111-111111111111</key>
    <array>
      <dict>
        <key>destinationuid</key><string>B2222222-2222-2222-2222-222222222222</string>
        <key>modifiers</key><integer>0</integer>
        <key>modifiersubtext</key><string></string>
        <key>vitoclose</key><false/>
      </dict>
    </array>
  </dict>
  <key>uidata</key>
  <dict>
    <key>A1111111-1111-1111-1111-111111111111</key>
    <dict><key>xpos</key><integer>110</integer><key>ypos</key><integer>110</integer></dict>
    <key>B2222222-2222-2222-2222-222222222222</key>
    <dict><key>xpos</key><integer>420</integer><key>ypos</key><integer>110</integer></dict>
  </dict>
  <key>version</key><string>1.0</string>
</dict>
</plist>
```

- [ ] **Step 2: Lint the plist**

Run:
```bash
plutil -lint packages/keel-alfred/info.plist
```
Expected: `packages/keel-alfred/info.plist: OK`

- [ ] **Step 3: Commit**

```bash
git add packages/keel-alfred/info.plist
git commit -m "feat(keel-alfred): info.plist wiring keyword → menu → run"
```

> **Fallback (if Task 5 shows Alfred won't load the workflow or the keyword does nothing):** create the two objects once in the Alfred GUI (Workflows → + → Blank → add a Script Filter keyword `keel` running `./menu.sh "$1"` with "Alfred filters results" OFF → connect to a Run Script `./run.sh "$1"`), then copy the GUI-generated `info.plist` back into `packages/keel-alfred/` and re-commit. The hand-written plist above is the expected-correct version; the GUI export is the safety net.

---

### Task 4: `install.sh` + README

**Files:**
- Create: `packages/keel-alfred/install.sh`
- Create: `packages/keel-alfred/README.md`

- [ ] **Step 1: Write install.sh**

```bash
#!/usr/bin/env bash
# keel Alfred — install the workflow into Alfred by copying the bundle.
# Run: packages/keel-alfred/install.sh   (no sudo)
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ID="pro.themia.keel"
PREFS="$HOME/Library/Application Support/Alfred/Alfred.alfredpreferences"
DEST="$PREFS/workflows/user.workflow.${BUNDLE_ID}"

[ -d "$PREFS" ] || { echo "keel: Alfred prefs not found at $PREFS (Alfred Powerpack required)"; exit 1; }

mkdir -p "$DEST"
# copy only the workflow files (not the dev docs)
for f in info.plist menu.sh run.sh; do
  cp "$SRC/$f" "$DEST/$f"
done
chmod +x "$DEST/menu.sh" "$DEST/run.sh"

# nudge Alfred to rescan workflows
osascript -e 'tell application "Alfred 5" to reload workflow "pro.themia.keel"' 2>/dev/null \
  || osascript -e 'tell application "com.runningwithcrayons.Alfred" to reload workflow "pro.themia.keel"' 2>/dev/null \
  || echo "keel: installed — relaunch Alfred (or it'll pick up on next launch) to see the 'keel' keyword."

echo "keel Alfred: installed to $DEST"
```

- [ ] **Step 2: Write README.md**

```markdown
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
```

- [ ] **Step 3: Make executable + lint**

Run:
```bash
chmod +x packages/keel-alfred/install.sh
bash -n packages/keel-alfred/install.sh && echo "install.sh syntax OK"
```
Expected: `install.sh syntax OK`

- [ ] **Step 4: Commit**

```bash
git add packages/keel-alfred/install.sh packages/keel-alfred/README.md
git commit -m "feat(keel-alfred): installer + README"
```

---

### Task 5: Install + end-to-end smoke

**Files:** none (manual verification)

- [ ] **Step 1: Install**

Run:
```bash
packages/keel-alfred/install.sh
```
Expected: `keel Alfred: installed to …/workflows/user.workflow.pro.themia.keel`

- [ ] **Step 2: Confirm Alfred loaded it**

Open Alfred Preferences → Workflows → confirm a **keel** workflow appears with keyword `keel`. If absent, relaunch Alfred (or apply the Task 3 fallback).

- [ ] **Step 3: Fire one of each kind**

- Type `keel status` → Enter → a **notification** shows keel phase/credits. (instant `keel:`)
- Type `keel vice status` → Enter → notification shows the vice state. (instant `keel:`)
- Type `keel morning` → Enter → **iTerm** opens running `claude "good morning"`. (`ritual:`) — close it after.
- Type `keel intention test the launcher` → Enter → iTerm opens `claude "/intention test the launcher"`. (live free-text)

- [ ] **Step 4: Mark the Things task done**

The Things to-do "Build: Alfred workflow for keel/Claude rituals" (`9Fc4RL2H4EcHf6e78AR4ED`) → complete.

- [ ] **Step 5: Final commit (if any tweaks were needed during smoke)**

```bash
git add packages/keel-alfred
git commit -m "fix(keel-alfred): smoke-test adjustments" || echo "nothing to commit"
```

---

## Notes for the executor

- **No `node_modules`/build** — pure scripts. The only runtime dep is the existing `~/.keel/keel.mjs` (Node) and `claude` on PATH inside iTerm's login shell.
- **Privilege:** vice actions go through `keel vice …`, which uses the already-installed `sudoers.d/keel-vice` (no password prompt). Do **not** call `vice-block.sh` or `sudo` from the workflow.
- **Quoting is the main risk** in `run.sh open_iterm` — the dry-run steps (Task 2) exist to catch it before any real iTerm launch.
- **Commit cadence:** one commit per task as shown. All on `main` (per the repo's current flow); not pushed.

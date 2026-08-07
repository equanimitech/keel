#!/usr/bin/env bash
# keel Alfred — Run Script. Receives the selected item's arg, dispatches by prefix.
# DRY_RUN=1 prints the resolved action instead of executing (for tests).
set -euo pipefail

# ── generalization seam: environment knobs ──
TERMINAL="iTerm"                 # terminal app for interactive rituals
KEEL_DIR="${KEEL_DIR:-${KEEL_HOME:-${KAIROS_HOME:-$HOME/.kairos}/keel}}"
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

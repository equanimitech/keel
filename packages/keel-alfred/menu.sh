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

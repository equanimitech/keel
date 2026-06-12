#!/usr/bin/env bash
# keel vice-block — toggle an /etc/hosts block over a vice-domain list.
# Usage: sudo ~/.keel/vice-block.sh on | off | status
# A self-chosen Ulysses pact: you set this in foresight; it protects the night.
# Reversible by design (off removes the marked block). Needs root for /etc/hosts.
set -euo pipefail

HOSTS=/etc/hosts
BEGIN="# >>> keel vice-block"
END="# <<< keel vice-block"
LIST="${HOME}/.keel/vice-blocklist.txt"
# When run via sudo, $HOME may be root's — fall back to the invoking user's.
[ -f "$LIST" ] || LIST="/Users/${SUDO_USER:-$(whoami)}/.keel/vice-blocklist.txt"

flush() { dscacheutil -flushcache 2>/dev/null || true; killall -HUP mDNSResponder 2>/dev/null || true; }

strip() {  # remove any existing keel block (idempotent)
  if grep -qF "$BEGIN" "$HOSTS"; then
    sed -i '' "/^${BEGIN}/,/^${END}/d" "$HOSTS"
  fi
}

apply() {  # write the block from $LIST (assumes root)
  [ -f "$LIST" ] || { echo "keel: no blocklist at $LIST"; exit 1; }
  strip
  { echo "$BEGIN  (added $(date '+%Y-%m-%d %H:%M'))";
    while IFS= read -r d; do
      d="${d%%#*}"; d="$(echo -n "$d" | tr -d '[:space:]')"; [ -z "$d" ] && continue
      echo "0.0.0.0 $d"; echo "0.0.0.0 www.$d"
      echo ":: $d"; echo ":: www.$d"
    done < "$LIST";
    echo "$END"; } >> "$HOSTS"
  flush
}

# add/remove/list edit the blocklist only (no root needed); on/off/panic touch /etc/hosts (root).
case "${1:-status}" in
  on)
    apply
    echo "keel: vice-block ON — $(grep -c '^0.0.0.0 ' "$HOSTS" || true) entries blocked. \`sudo ~/.keel/vice-block.sh off\` to lift. Restart your browser."
    ;;
  panic)
    apply
    echo "🛑 keel: PANIC — all vices blocked NOW. Doors shut. Breathe. \`sudo ~/.keel/vice-block.sh off\` when it passes."
    ;;
  off)
    strip; flush
    echo "keel: vice-block OFF — doors reopened."
    ;;
  status)
    if grep -qF "$BEGIN" "$HOSTS"; then
      echo "keel: vice-block ACTIVE"; grep "^0.0.0.0 " "$HOSTS" | sed 's/^/  /'
    else echo "keel: vice-block inactive."; fi
    ;;
  add)
    d="$(echo -n "${2:-}" | tr -d '[:space:]')"; [ -z "$d" ] && { echo "usage: vice-block.sh add <domain>"; exit 1; }
    grep -qxF "$d" "$LIST" 2>/dev/null && { echo "keel: $d already in blocklist."; exit 0; }
    echo "$d" >> "$LIST"; echo "keel: added $d. Re-apply with \`sudo ~/.keel/vice-block.sh on\`."
    ;;
  remove|rm)
    d="$(echo -n "${2:-}" | tr -d '[:space:]')"; [ -z "$d" ] && { echo "usage: vice-block.sh remove <domain>"; exit 1; }
    [ -f "$LIST" ] && grep -qxF "$d" "$LIST" || { echo "keel: $d not in blocklist."; exit 0; }
    sed -i '' "/^${d//./\\.}$/d" "$LIST"; echo "keel: removed $d. Re-apply with \`sudo ~/.keel/vice-block.sh on\`."
    ;;
  list|ls)
    echo "keel blocklist ($LIST):"; grep -vE '^\s*(#|$)' "$LIST" 2>/dev/null | sed 's/^/  /' || echo "  (empty)"
    ;;
  *) echo "usage: ~/.keel/vice-block.sh <on|off|panic|status|list|add <d>|remove <d>>  (on/off/panic need sudo)"; exit 1 ;;
esac

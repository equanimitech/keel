#!/usr/bin/env bash
# keel vice-block — toggle an /etc/hosts block over the watchlist's windowed tier.
# Usage: sudo ~/.keel/vice-block.sh on | off | panic | status | list | add <d> | remove <d>
# A self-chosen Ulysses pact: you set this in foresight; it protects the night.
# Reversible by design (off removes the marked block). Needs root for /etc/hosts.
#
# Source of truth: ~/.keel/config.json `watchlist.windowed` (the config spine —
# see `keel rules`). The old vice-blocklist.txt is read only as a legacy
# fallback when the config carries no windowed tier.
set -euo pipefail

HOSTS=/etc/hosts
BEGIN="# >>> keel vice-block"
END="# <<< keel vice-block"
# When run via sudo, $HOME may be root's — fall back to the invoking user's.
USER_HOME="/Users/${SUDO_USER:-$(whoami)}"
[ -d "$USER_HOME" ] || USER_HOME="$HOME"
CONF="${USER_HOME}/.keel/config.json"
LIST="${USER_HOME}/.keel/vice-blocklist.txt"

flush() { dscacheutil -flushcache 2>/dev/null || true; killall -HUP mDNSResponder 2>/dev/null || true; }

# The windowed tier, one domain per line. Config first; legacy file fallback.
domains() {
  if command -v node >/dev/null 2>&1 && [ -f "$CONF" ]; then
    W="$(node -e "try{const c=JSON.parse(require('fs').readFileSync('$CONF','utf8'));const w=(c.watchlist&&c.watchlist.windowed)||[];if(Array.isArray(w)&&w.length)console.log(w.join('\n'))}catch{}")"
    if [ -n "$W" ]; then printf '%s\n' "$W"; return; fi
  fi
  if [ -f "$LIST" ]; then
    grep -vE '^\s*(#|$)' "$LIST" || true
  fi
}

# Mutate watchlist.windowed in config.json (create the key if absent).
edit_windowed() {  # $1 = add|remove, $2 = domain
  command -v node >/dev/null 2>&1 || { echo "keel: node required to edit the watchlist."; exit 1; }
  node -e "
    const fs = require('fs');
    const path = '$CONF';
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
    const w = cfg.watchlist = cfg.watchlist || {};
    const list = Array.isArray(w.windowed) ? w.windowed : [];
    const d = '$2';
    if ('$1' === 'add') {
      if (list.includes(d)) { console.log('keel: ' + d + ' already in the windowed tier.'); process.exit(0); }
      w.windowed = [...list, d];
      console.log('keel: added ' + d + ' to the windowed tier. Re-apply with \`sudo ~/.keel/vice-block.sh on\`.');
    } else {
      if (!list.includes(d)) { console.log('keel: ' + d + ' not in the windowed tier.'); process.exit(0); }
      w.windowed = list.filter((x) => x !== d);
      console.log('keel: removed ' + d + '. Re-apply with \`sudo ~/.keel/vice-block.sh on\`.');
    }
    fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  "
}

strip() {  # remove any existing keel block (idempotent)
  if grep -qF "$BEGIN" "$HOSTS"; then
    sed -i '' "/^${BEGIN}/,/^${END}/d" "$HOSTS"
  fi
}

apply() {  # write the block from the windowed tier (assumes root)
  D="$(domains)"
  [ -n "$D" ] || { echo "keel: windowed tier is empty (see \`keel rules\`; edit $CONF)"; exit 1; }
  strip
  { echo "$BEGIN  (added $(date '+%Y-%m-%d %H:%M'))";
    while IFS= read -r d; do
      d="${d%%#*}"; d="$(echo -n "$d" | tr -d '[:space:]')"; [ -z "$d" ] && continue
      echo "0.0.0.0 $d"; echo "0.0.0.0 www.$d"
      echo ":: $d"; echo ":: www.$d"
    done <<< "$D";
    echo "$END"; } >> "$HOSTS"
  flush
}

# add/remove/list edit the watchlist only (no root needed); on/off/panic touch /etc/hosts (root).
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
    edit_windowed add "$d"
    ;;
  remove|rm)
    d="$(echo -n "${2:-}" | tr -d '[:space:]')"; [ -z "$d" ] && { echo "usage: vice-block.sh remove <domain>"; exit 1; }
    edit_windowed remove "$d"
    ;;
  list|ls)
    echo "keel windowed tier (watchlist):"; domains | sed 's/^/  /'
    [ -n "$(domains)" ] || echo "  (empty)"
    ;;
  *) echo "usage: ~/.keel/vice-block.sh <on|off|panic|status|list|add <d>|remove <d>>  (on/off/panic need sudo)"; exit 1 ;;
esac

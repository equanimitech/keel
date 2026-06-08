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

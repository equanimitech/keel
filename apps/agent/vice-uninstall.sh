#!/usr/bin/env bash
# keel vice — remove the enforcement layer. Run as root:
#   sudo /Users/rafa/.keel/vice-uninstall.sh
# Lifts any active block, unloads the daemon, removes the sudoers rule.
# Leaves the deployed ~/.keel/vice-block.sh in place (harmless; re-deployed on reinstall).
set -euo pipefail
KEEL="/Users/rafa/.keel"
PLIST="/Library/LaunchDaemons/com.keel.vice.plist"
SUDOERS="/etc/sudoers.d/keel-vice"

launchctl bootout system "$PLIST" 2>/dev/null || true
rm -f "$PLIST" "$SUDOERS"
"${KEEL}/vice-block.sh" off 2>/dev/null || true   # leave the doors open
echo "keel vice: uninstalled. Daemon unloaded, sudoers rule removed, block lifted."

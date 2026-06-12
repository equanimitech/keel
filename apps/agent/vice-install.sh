#!/usr/bin/env bash
# keel vice — install the enforcement layer. Run ONCE, as root:
#   osascript -e 'do shell script "/Users/rafa/.keel/vice-install.sh" with administrator privileges'
#
# Source of truth for this script + vice-block.sh is the keel agent package; ~/.keel
# holds symlinks (installers) and a DEPLOYED, root-owned copy of vice-block.sh.
#
# Installs:
#   1. deploys vice-block.sh from the repo → ~/.keel, root-owned (can't be silently no-op'd),
#   2. a root LaunchDaemon that reconciles /etc/hosts to keel's desired vice state every
#      N minutes (the self-healing teeth — a manual `off` gets re-asserted),
#   3. a scoped passwordless-sudo rule so `keel vice on/off/skip` apply instantly.
# Reversible: `sudo /Users/rafa/.keel/vice-uninstall.sh`.
set -euo pipefail

USER_NAME="rafa"
HOME_DIR="/Users/${USER_NAME}"
KEEL="${HOME_DIR}/.keel"
REPO_SRC="${HOME_DIR}/Developer/equanimitech/keel/apps/agent"   # source of truth
NODE="${HOME_DIR}/Library/pnpm/node"      # stable pnpm shim
PLIST="/Library/LaunchDaemons/com.keel.vice.plist"
SUDOERS="/etc/sudoers.d/keel-vice"
INTERVAL=300                               # reassertEveryMin (5) × 60

[ -x "$NODE" ] || { echo "keel: node not found at $NODE — fix NODE path and re-run."; exit 1; }
[ -f "${REPO_SRC}/vice-block.sh" ] || { echo "keel: source ${REPO_SRC}/vice-block.sh missing."; exit 1; }

# 1. Deploy the privileged primitive from source: root-owned, not user-writable.
install -o root -g wheel -m 755 "${REPO_SRC}/vice-block.sh" "${KEEL}/vice-block.sh"

# 2. LaunchDaemon — root, RunAtLoad + every INTERVAL seconds.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.keel.vice</string>
  <key>ProgramArguments</key>
    <array>
      <string>${NODE}</string>
      <string>${KEEL}/keel.mjs</string>
      <string>vice-tick</string>
    </array>
  <key>StartInterval</key><integer>${INTERVAL}</integer>
  <key>RunAtLoad</key><true/>
  <key>UserName</key><string>root</string>
  <key>EnvironmentVariables</key>
    <dict><key>HOME</key><string>${HOME_DIR}</string></dict>
  <key>StandardOutPath</key><string>${KEEL}/vice-daemon.log</string>
  <key>StandardErrorPath</key><string>${KEEL}/vice-daemon.log</string>
</dict>
</plist>
EOF
chown root:wheel "$PLIST"; chmod 644 "$PLIST"

# 3. Passwordless apply, scoped to the one audited (root-owned) script.
echo "${USER_NAME} ALL=(root) NOPASSWD: ${KEEL}/vice-block.sh" > "$SUDOERS"
chown root:wheel "$SUDOERS"; chmod 440 "$SUDOERS"
visudo -c -f "$SUDOERS" >/dev/null || { echo "keel: sudoers validation failed — removing."; rm -f "$SUDOERS"; exit 1; }

# 4. (Re)load the daemon.
launchctl bootout system "$PLIST" 2>/dev/null || true
launchctl bootstrap system "$PLIST"
launchctl enable system/com.keel.vice 2>/dev/null || true

echo "keel vice: installed. vice-block.sh deployed (root); daemon reconciles every $((INTERVAL/60)) min; passwordless apply enabled."

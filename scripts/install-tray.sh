#!/usr/bin/env bash
#
# Build, sign, install and restart the keel tray — the whole path from source to
# a running menubar writer, in one command.
#
# It exists because doing this by hand has three traps, each of which fails
# quietly rather than loudly:
#
#   1. `tauri build` with default targets hands keel.app to the DMG bundler,
#      which MOVES it out of bundle/macos/. A copy step written afterwards finds
#      nothing there. We build `--bundles app` and never make a disk image.
#   2. An ad-hoc signed rebuild has a new code identity, so macOS silently drops
#      the Screen Recording grant: x-win keeps returning Ok, window titles just
#      arrive empty forever. Signing with a stable Developer ID keeps the grant
#      across rebuilds — that is the whole point of this script.
#   3. Bootstrapping launchd while any instance is alive makes its copy hit the
#      single-instance guard and exit 0, and KeepAlive respawns it forever. The
#      only tell is `runs` climbing while `job state = exited`. We bootout, kill
#      strays, then bootstrap.
#
# Usage:  ./scripts/install-tray.sh            build, install, restart, verify
#         ./scripts/install-tray.sh --no-build install the last build
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SRC="$REPO/apps/tray/src-tauri/target/release/bundle/macos/keel.app"
APP_DEST="/Applications/keel.app"
LABEL="com.equanimitech.keel.tray"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BACKUP_DIR="$HOME/Library/Application Support/keel-backups"
UID_NUM="$(id -u)"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ── 1. Signing identity ─────────────────────────────────────────
# Auto-detected rather than hardcoded: the repo should not carry one
# developer's certificate name, and a machine without one should be told
# plainly instead of silently producing an ad-hoc build that will lose the
# Screen Recording grant on every install.
step "Signing identity"
IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
  | grep 'Developer ID Application' \
  | head -1 \
  | sed -n 's/.*"\(.*\)".*/\1/p')"

if [ -z "$IDENTITY" ]; then
  cat >&2 <<'EOF'
No "Developer ID Application" certificate found in the keychain.

Without one the app can only be ad-hoc signed, and every rebuild will drop the
Screen Recording grant (window titles silently arrive empty). Either install the
certificate from your Apple Developer account, or accept re-granting the
permission after each install and run:

    APPLE_SIGNING_IDENTITY="-" ./scripts/install-tray.sh
EOF
  [ "${APPLE_SIGNING_IDENTITY:-}" = "-" ] || die "refusing to install an ad-hoc build unsigned by default"
  IDENTITY="-"
fi
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-$IDENTITY}"
echo "  $APPLE_SIGNING_IDENTITY"

# ── 2. Build ────────────────────────────────────────────────────
if [ "${1:-}" != "--no-build" ]; then
  step "Building (--bundles app: no DMG, so keel.app stays put)"
  # The bundler shells out to `xattr` to strip quarantine attributes before
  # signing, and a broken `xattr` earlier in PATH (a pip install into Homebrew's
  # python is the usual culprit) fails the build with a bare
  # "failed to run xattr". Prefer the system binary, which is a real Mach-O and
  # has no interpreter to break — scoped to the build, not exported.
  if ! xattr -h >/dev/null 2>&1; then
    echo "  note: the \`xattr\` in PATH is broken; using /usr/bin/xattr for the build"
  fi
  # Start from an empty bundle directory so a previous build's output can never
  # be mistaken for this one's — the install step copies whatever sits there.
  rm -rf "$(dirname "$APP_SRC")"
  (cd "$REPO" && PATH="/usr/bin:$PATH" pnpm --filter @keel/tray tauri build --bundles app)
fi
[ -d "$APP_SRC" ] || die "no app at $APP_SRC — did the build fail?"

# Not ceremony: a build that ran without APPLE_SIGNING_IDENTITY comes out
# unsealed (no `_CodeSignature`, "code has no resources but signature indicates
# they must be present"), and installing it would silently drop the Screen
# Recording grant all over again. Fail here instead, before anything is touched.
step "Verifying the signature"
codesign --verify --strict --deep "$APP_SRC" || die "signature does not verify — was the build run without APPLE_SIGNING_IDENTITY?"
codesign -dvv "$APP_SRC" 2>&1 | grep -E 'Identifier=|Authority=|TeamIdentifier=' | sed 's/^/  /'

# ── 3. Stop everything that could hold the single-instance slot ──
step "Stopping the running tray"
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
sleep 2
pkill -f 'keel-tray' 2>/dev/null || true
sleep 2
pgrep -f 'keel-tray' >/dev/null && die "a keel-tray process survived; quit it and re-run" || echo "  stopped"

# ── 4. Install, keeping one rollback ────────────────────────────
if [ -d "$APP_DEST" ]; then
  step "Backing up the installed app"
  mkdir -p "$BACKUP_DIR"
  rm -rf "$BACKUP_DIR/keel.app.previous"
  cp -R "$APP_DEST" "$BACKUP_DIR/keel.app.previous"
  echo "  $BACKUP_DIR/keel.app.previous"
fi

step "Installing to $APP_DEST"
rm -rf "$APP_DEST"
cp -R "$APP_SRC" "$APP_DEST"

# ── 5. Restart under launchd ────────────────────────────────────
step "Starting under launchd"
[ -f "$PLIST" ] || die "no LaunchAgent at $PLIST — see apps/tray/README.md"
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
sleep 5

STATE="$(launchctl print "gui/$UID_NUM/$LABEL" 2>/dev/null | sed -n 's/.*job state = \(.*\)/\1/p')"
RUNS="$(launchctl print "gui/$UID_NUM/$LABEL" 2>/dev/null | sed -n 's/.*runs = \(.*\)/\1/p')"
echo "  job state = ${STATE:-unknown} · runs = ${RUNS:-?}"
[ "${STATE:-}" = "running" ] || die "job is not running — check /tmp/keel-tray.log"

# A respawn loop shows as `runs` climbing while nothing stays alive; one sample
# cannot see it, so take two.
PID1="$(pgrep -f 'keel-tray' | head -1 || true)"
sleep 8
PID2="$(pgrep -f 'keel-tray' | head -1 || true)"
[ -n "$PID1" ] && [ "$PID1" = "$PID2" ] || die "the tray is respawning (single-instance loop) — see apps/tray/README.md"
echo "  pid $PID2 stable"

# ── 6. The check that actually matters ──────────────────────────
step "Screen Recording grant"
echo "  Titles arrive empty when the grant is missing, and x-win reports no error"
echo "  — so verify it rather than trusting the menu:"
echo
echo "      node scripts/tray-title-health.mjs 5"
echo
echo "  If every title is blank: System Settings → Privacy & Security →"
echo "  Screen Recording → enable keel, then re-run this script (a fresh grant"
echo "  cannot take effect in an already-running process)."

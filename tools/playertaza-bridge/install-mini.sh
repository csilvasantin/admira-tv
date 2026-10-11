#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
mkdir -p "$ROOT/sdk" "$ROOT/logs"
curl --fail --silent --show-error https://devstorage.jeejio.com/BubbleSDK/Bot/Bot_0.2.js -o "$ROOT/sdk/Bot_0.2.mjs"
chmod 700 "$ROOT"
if [ ! -f "$ROOT/config.private.json" ]; then
  cp "$ROOT/config.example.json" "$ROOT/config.private.json"
fi
chmod 600 "$ROOT/config.private.json"
TASK_PLIST="$HOME/Library/LaunchAgents/com.admira.playertaza-bubble.plist"
mkdir -p "$(dirname "$TASK_PLIST")"
cat > "$TASK_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.admira.playertaza-bubble</string>
<key>ProgramArguments</key><array><string>$NODE</string><string>$ROOT/bridge.mjs</string></array>
<key>WorkingDirectory</key><string>$ROOT</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>$ROOT/logs/bridge.log</string>
<key>StandardErrorPath</key><string>$ROOT/logs/error.log</string>
</dict></plist>
EOF
plutil -lint "$TASK_PLIST"
launchctl bootout "gui/$(id -u)/com.admira.playertaza-bubble" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TASK_PLIST"
launchctl kickstart "gui/$(id -u)/com.admira.playertaza-bubble"
echo "Servicio instalado. Estado: http://127.0.0.1:4748/health"

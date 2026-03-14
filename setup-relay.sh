#!/usr/bin/env bash
set -euo pipefail

# claude-sync relay server setup script
# Clones, builds, and optionally installs as a system service

REPO_URL="https://github.com/Lithial/ClaudeSync.git"
DEFAULT_INSTALL_DIR="$HOME/.claude-sync"

echo "=== claude-sync relay server setup ==="
echo

# Determine install directory
INSTALL_DIR="${1:-$DEFAULT_INSTALL_DIR}"
echo "Install directory: $INSTALL_DIR"

# Check prerequisites
for cmd in node npm git; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is required but not found in PATH"
    exit 1
  fi
done

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "Error: Node.js 22+ is required (found $(node -v))"
  exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing installation..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "Cloning repository..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

# Install and build
echo "Installing dependencies..."
npm --prefix "$INSTALL_DIR" install

echo "Building..."
npm --prefix "$INSTALL_DIR" run build

# Collect configuration
echo
read -rp "Port (default 8787): " INPUT_PORT
PORT="${INPUT_PORT:-8787}"

read -rp "Host (default 0.0.0.0): " INPUT_HOST
HOST="${INPUT_HOST:-0.0.0.0}"

read -rp "Shared token (leave empty to generate one): " -s INPUT_TOKEN
echo
if [ -z "$INPUT_TOKEN" ]; then
  TOKEN=$(node -e "console.log(crypto.randomUUID())")
  echo "Generated token: $TOKEN"
  echo "Save this token — you'll need it when setting up clients."
else
  TOKEN="$INPUT_TOKEN"
fi

# Test that the server starts
echo
echo "Testing server startup..."
CLAUDE_SYNC_TOKEN="$TOKEN" CLAUDE_SYNC_PORT="$PORT" CLAUDE_SYNC_HOST="$HOST" \
  node -e "
    const m = await import('$INSTALL_DIR/packages/server/dist/index.js');
    setTimeout(() => { m.wss.close(); process.exit(0); }, 1000);
  " 2>&1 && echo "Server starts successfully." || echo "Warning: server test failed, check configuration."

# Offer to install as a system service
echo
OS="$(uname -s)"
case "$OS" in
  Linux)
    read -rp "Install as a systemd service? (y/N): " INSTALL_SERVICE
    if [[ "$INSTALL_SERVICE" =~ ^[Yy]$ ]]; then
      SERVICE_FILE="/etc/systemd/system/claude-sync-relay.service"
      NODE_PATH="$(command -v node)"

      echo "Writing systemd service to $SERVICE_FILE (requires sudo)..."
      sudo tee "$SERVICE_FILE" > /dev/null <<UNIT
[Unit]
Description=claude-sync relay server
After=network.target

[Service]
Type=simple
ExecStart=$NODE_PATH $INSTALL_DIR/packages/server/dist/index.js
Environment=CLAUDE_SYNC_TOKEN=$TOKEN
Environment=CLAUDE_SYNC_PORT=$PORT
Environment=CLAUDE_SYNC_HOST=$HOST
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

      sudo systemctl daemon-reload
      sudo systemctl enable claude-sync-relay
      sudo systemctl start claude-sync-relay

      echo "Service installed and started."
      echo "  sudo systemctl status claude-sync-relay"
      echo "  sudo journalctl -u claude-sync-relay -f"
    fi
    ;;
  Darwin)
    read -rp "Install as a launchd service? (y/N): " INSTALL_SERVICE
    if [[ "$INSTALL_SERVICE" =~ ^[Yy]$ ]]; then
      PLIST_LABEL="com.claude-sync.relay"
      PLIST_FILE="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
      NODE_PATH="$(command -v node)"
      LOG_DIR="$HOME/Library/Logs/claude-sync"
      mkdir -p "$LOG_DIR"

      echo "Writing launchd plist to $PLIST_FILE..."
      cat > "$PLIST_FILE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$INSTALL_DIR/packages/server/dist/index.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CLAUDE_SYNC_TOKEN</key>
    <string>$TOKEN</string>
    <key>CLAUDE_SYNC_PORT</key>
    <string>$PORT</string>
    <key>CLAUDE_SYNC_HOST</key>
    <string>$HOST</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/relay.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/relay.err</string>
</dict>
</plist>
PLIST

      launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
      launchctl bootstrap "gui/$(id -u)" "$PLIST_FILE"

      echo "Service installed and started."
      echo "  launchctl print gui/$(id -u)/$PLIST_LABEL"
      echo "  tail -f $LOG_DIR/relay.log"
    fi
    ;;
  *)
    echo "Automatic service installation is not supported on $OS."
    ;;
esac

echo
echo "=== Relay setup complete ==="
echo
echo "To run manually:"
echo "  CLAUDE_SYNC_TOKEN='$TOKEN' CLAUDE_SYNC_PORT=$PORT node $INSTALL_DIR/packages/server/dist/index.js"
echo
echo "Use this token when running setup.sh on client machines."

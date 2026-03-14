#!/usr/bin/env bash
set -euo pipefail

# claude-sync setup script
# Clones, builds, and registers the MCP server with Claude Code

REPO_URL="https://github.com/Lithial/ClaudeSync.git"
DEFAULT_INSTALL_DIR="$HOME/.claude-sync"

echo "=== claude-sync setup ==="
echo

# Determine install directory
INSTALL_DIR="${1:-$DEFAULT_INSTALL_DIR}"
echo "Install directory: $INSTALL_DIR"

# Check prerequisites
for cmd in node npm git claude; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is required but not found in PATH"
    exit 1
  fi
done

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "Error: Node.js 22+ is required (found v$(node -v))"
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
read -rp "Relay server URL (e.g. ws://your-server:8787): " SYNC_URL
read -rsp "Shared token: " SYNC_TOKEN
echo
read -rp "Peer name for this machine (e.g. macbook-pro): " PEER_NAME

# Register MCP server with Claude Code
echo
echo "Registering MCP server with Claude Code..."
claude mcp add \
  --transport stdio \
  --scope user \
  --env "CLAUDE_SYNC_URL=$SYNC_URL" \
  --env "CLAUDE_SYNC_TOKEN=$SYNC_TOKEN" \
  --env "CLAUDE_SYNC_PEER_NAME=$PEER_NAME" \
  claude-sync -- node "$INSTALL_DIR/packages/mcp/dist/index.js"

echo
echo "=== Setup complete ==="
echo
echo "Claude Code can now use these tools:"
echo "  list_peers, send_task, wait_for_response, send_result, check_inbox, git_sync"
echo
echo "CLI is also available at: $INSTALL_DIR/packages/mcp/dist/cli.js"
echo "  node $INSTALL_DIR/packages/mcp/dist/cli.js list-peers"
echo
echo "To start a relay server:"
echo "  CLAUDE_SYNC_TOKEN='$SYNC_TOKEN' node $INSTALL_DIR/packages/server/dist/index.js"

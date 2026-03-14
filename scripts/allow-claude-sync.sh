#!/usr/bin/env bash
# Manages claude-sync MCP tool permissions in .claude/settings.local.json
#
# Usage:
#   ./allow-claude-sync.sh [options] [target-directory]
#
# Options:
#   --add <tool>       Add a specific tool permission (can be used multiple times)
#   --remove <tool>    Remove a specific tool permission (can be used multiple times)
#   --list             List currently allowed tools
#   --all              Add all default claude-sync tools (default behavior)
#
# Examples:
#   ./allow-claude-sync.sh                          # Add all default tools to current dir
#   ./allow-claude-sync.sh ~/projects/myapp         # Add all default tools to target dir
#   ./allow-claude-sync.sh --add my_custom_tool     # Add a single tool
#   ./allow-claude-sync.sh --remove git_sync        # Remove a tool (partial match supported)
#   ./allow-claude-sync.sh --list                   # Show current permissions

set -euo pipefail

DEFAULT_TOOLS=(
  "mcp__claude-sync__check_inbox"
  "mcp__claude-sync__git_sync"
  "mcp__claude-sync__list_peers"
  "mcp__claude-sync__ping_peer"
  "mcp__claude-sync__send_result"
  "mcp__claude-sync__send_task"
  "mcp__claude-sync__wait_for_response"
)

TARGET_DIR=""
ADD_TOOLS=()
REMOVE_TOOLS=()
ACTION="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --add)
      ACTION="add"
      shift
      # Auto-prefix if not already prefixed
      if [[ "$1" == mcp__claude-sync__* ]]; then
        ADD_TOOLS+=("$1")
      else
        ADD_TOOLS+=("mcp__claude-sync__$1")
      fi
      shift
      ;;
    --remove)
      ACTION="remove"
      shift
      REMOVE_TOOLS+=("$1")
      shift
      ;;
    --list)
      ACTION="list"
      shift
      ;;
    --all)
      ACTION="all"
      shift
      ;;
    *)
      TARGET_DIR="$1"
      shift
      ;;
  esac
done

TARGET_DIR="${TARGET_DIR:-.}"
SETTINGS_DIR="$TARGET_DIR/.claude"
SETTINGS_FILE="$SETTINGS_DIR/settings.local.json"

ensure_settings() {
  mkdir -p "$SETTINGS_DIR"
  if [ ! -f "$SETTINGS_FILE" ]; then
    echo '{"permissions":{"allow":[]}}' > "$SETTINGS_FILE"
  fi
}

get_allow_list() {
  python3 -c "
import json
with open('$SETTINGS_FILE') as f:
    data = json.load(f)
for tool in data.get('permissions', {}).get('allow', []):
    print(tool)
"
}

update_settings() {
  local tools_json="$1"
  local remove_json="${2:-[]}"
  python3 -c "
import json

with open('$SETTINGS_FILE') as f:
    data = json.load(f)

perms = data.setdefault('permissions', {})
allow = perms.setdefault('allow', [])

to_add = json.loads('$tools_json')
to_remove = json.loads('$remove_json')

# Remove matching tools
if to_remove:
    allow = [t for t in allow if not any(r in t for r in to_remove)]

# Add new tools (dedup)
for tool in to_add:
    if tool not in allow:
        allow.append(tool)

perms['allow'] = sorted(allow)
data['permissions'] = perms

with open('$SETTINGS_FILE', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"
}

to_json_array() {
  local arr=("$@")
  python3 -c "import json; print(json.dumps($(printf '"%s" ' "${arr[@]}" | sed 's/^/[/;s/ $/]/;s/ /, /g')))"
}

case "$ACTION" in
  list)
    if [ ! -f "$SETTINGS_FILE" ]; then
      echo "No settings file found at $SETTINGS_FILE"
      exit 0
    fi
    echo "Allowed tools in $SETTINGS_FILE:"
    get_allow_list | while read -r tool; do
      echo "  $tool"
    done
    ;;
  all)
    ensure_settings
    tools_json=$(to_json_array "${DEFAULT_TOOLS[@]}")
    update_settings "$tools_json"
    echo "All claude-sync tools allowed in $SETTINGS_FILE"
    ;;
  add)
    ensure_settings
    tools_json=$(to_json_array "${ADD_TOOLS[@]}")
    update_settings "$tools_json"
    for tool in "${ADD_TOOLS[@]}"; do
      echo "Added: $tool"
    done
    ;;
  remove)
    if [ ! -f "$SETTINGS_FILE" ]; then
      echo "No settings file found at $SETTINGS_FILE"
      exit 1
    fi
    remove_json=$(to_json_array "${REMOVE_TOOLS[@]}")
    update_settings "[]" "$remove_json"
    for tool in "${REMOVE_TOOLS[@]}"; do
      echo "Removed tools matching: $tool"
    done
    ;;
esac

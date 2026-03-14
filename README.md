# claude-sync

Cross-machine coordination for Claude Code instances. Push code on one machine, have another pull and run tests, get results back — all orchestrated through Claude Code's MCP tool interface.

## How it works

```
┌─────────────────┐         ┌──────────────┐         ┌─────────────────┐
│  Machine A      │         │  Relay Server │         │  Machine B      │
│  (macOS)        │◄───ws──►│  (WebSocket)  │◄───ws──►│  (Windows)      │
│  Claude Code    │         │  Routes msgs  │         │  Claude Code    │
│  + MCP Server   │         │  mDNS/Bonjour │         │  + MCP Server   │
└────────┬────────┘         └──────────────┘         └────────┬────────┘
         └──────────── GitHub (file sync via git) ─────────────┘
```

- **GitHub** handles file sync (git push/pull)
- **WebSocket relay** handles real-time messaging between Claude Code instances
- **mDNS/Bonjour** lets clients discover the relay automatically — no manual URL configuration needed
- **MCP tools** let Claude Code send tasks, wait for results, and coordinate git operations

## Quick setup

### Automated (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/Lithial/ClaudeSync/main/setup.sh | bash
```

Or clone first and run locally:

```bash
git clone https://github.com/Lithial/ClaudeSync.git
cd ClaudeSync
bash setup.sh
```

The script will:
1. Install dependencies and build
2. Prompt for peer name (relay URL is auto-discovered via mDNS)
3. Register the MCP server with Claude Code

Run this on **each machine** you want to coordinate.

### Relay server setup

Run the relay setup on whatever machine will host the relay (must be on the same local network as clients):

```bash
git clone https://github.com/Lithial/ClaudeSync.git
cd ClaudeSync
bash setup-relay.sh
```

This will build the server and optionally install it as a **systemd service** (Linux) or **launchd agent** (macOS) so it stays running across reboots.

The relay automatically advertises itself on the local network via mDNS (Bonjour). Clients discover it with zero configuration.

### Manual setup

#### 1. Start the relay server

```bash
git clone https://github.com/Lithial/ClaudeSync.git
cd ClaudeSync
npm install && npm run build

node packages/server/dist/index.js
# Logs: claude-sync relay server listening on 0.0.0.0:8787
# Logs: Advertising as "my-hostname" via mDNS
```

#### 2. Configure each client machine

Register the MCP server with Claude Code:

```bash
claude mcp add -t stdio -s user \
  claude-sync \
  -e "CLAUDE_SYNC_PEER_NAME=my-machine" \
  -- node /path/to/ClaudeSync/packages/mcp/dist/index.js
```

Or create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "claude-sync": {
      "command": "node",
      "args": ["/path/to/ClaudeSync/packages/mcp/dist/index.js"],
      "env": {
        "CLAUDE_SYNC_PEER_NAME": "my-machine"
      }
    }
  }
}
```

The client will auto-discover the relay via mDNS — no URL or token required.

#### 3. Verify

In Claude Code, ask it to `list_peers` — you should see all connected machines.

## MCP Tools

Once configured, Claude Code has access to these tools:

| Tool | Description |
|------|-------------|
| `list_peers` | Show all connected Claude Code instances |
| `send_task` | Send instructions to a remote peer (returns a taskId) |
| `wait_for_response` | Block until a task result arrives |
| `send_result` | Respond to a received task |
| `check_inbox` | Check for pending incoming tasks |
| `git_sync` | git add + commit + push, optionally notify peers |
| `ping_peer` | Test connectivity and measure round-trip time |

### Example workflow

On your Mac, tell Claude Code:

> "Push the current changes and ask the Windows machine to run the Playwright tests"

Claude Code will:
1. `git_sync` — commit and push
2. `send_task` — tell the Windows peer to pull and run tests
3. `wait_for_response` — wait for results

On the Windows machine, Claude Code will:
1. `check_inbox` — see the incoming task
2. Pull the branch, run the tests
3. `send_result` — send results back

## CLI

A CLI is also available as a fallback:

```bash
export CLAUDE_SYNC_PEER_NAME="my-machine"

# Commands (relay is auto-discovered via mDNS)
node packages/mcp/dist/cli.js list-peers
node packages/mcp/dist/cli.js ping <peer>
node packages/mcp/dist/cli.js send-task --to windows-pc --instructions "git pull && npm test"
node packages/mcp/dist/cli.js check-inbox
node packages/mcp/dist/cli.js send-result --to macbook --task-id <id> --status success --summary "All tests passed"
node packages/mcp/dist/cli.js git-sync --message "fix: update tests" --notify
```

## Environment variables

### Relay server

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_SYNC_PORT` | `8787` | Listen port |
| `CLAUDE_SYNC_HOST` | `0.0.0.0` | Listen host |
| `CLAUDE_SYNC_RELAY_NAME` | hostname | mDNS service name advertised to clients |

### MCP server / CLI

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_SYNC_PEER_NAME` | random | Unique name for this instance |
| `CLAUDE_SYNC_URL` | (auto-discovered) | Override: WebSocket URL of the relay (skips mDNS) |
| `CLAUDE_SYNC_RELAY_NAME` | (any) | Filter mDNS discovery to a relay with this name |

## Security

- **Local network trust model**: any machine on the same subnet can connect. The relay does not require a token.
- **`CLAUDE_SYNC_URL` override**: for cross-subnet, Docker, or CI setups where mDNS is unavailable, set this env var to connect directly (e.g. `ws://relay-host:8787`).
- **The relay uses plain `ws://`** — no encryption. Put it behind a reverse proxy (nginx/Caddy) with TLS for anything sensitive. Fine on a trusted LAN.
- **`git_sync` checks for secrets before staging.** It will refuse to commit files matching common sensitive patterns (`.env`, `*.pem`, `*.key`, `credentials.json`, etc.).
- Relay enforces a 1MB max message size.
- `.mcp.json` is gitignored — `.mcp.json.example` is provided as a template.

## Development

```bash
npm install
npm run build
npm test
```

Tests include unit tests for protocol/peers, integration tests for the relay server, and task store tests.

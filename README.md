# claude-sync

Cross-machine coordination for Claude Code instances. Push code on one machine, have another pull and run tests, get results back — all orchestrated through Claude Code's MCP tool interface.

## How it works

```
┌─────────────────┐         ┌──────────────┐         ┌─────────────────┐
│  Machine A      │         │  Relay Server │         │  Machine B      │
│  (macOS)        │◄───ws──►│  (WebSocket)  │◄───ws──►│  (Windows)      │
│  Claude Code    │         │  Routes msgs  │         │  Claude Code    │
│  + MCP Server   │         │  Auth token   │         │  + MCP Server   │
└────────┬────────┘         └──────────────┘         └────────┬────────┘
         └──────────── GitHub (file sync via git) ─────────────┘
```

- **GitHub** handles file sync (git push/pull)
- **WebSocket relay** handles real-time messaging between Claude Code instances
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
2. Prompt for relay URL, token, and peer name
3. Register the MCP server with Claude Code

Run this on **each machine** you want to coordinate.

### Manual setup

#### 1. Deploy the relay server

Pick any machine (or a cloud VM) to host the relay:

```bash
git clone https://github.com/Lithial/ClaudeSync.git
cd ClaudeSync
npm install && npm run build

# Start the relay
CLAUDE_SYNC_TOKEN="your-shared-secret" node packages/server/dist/index.js
```

Or with Docker:

```bash
docker build -t claude-sync-relay -f packages/server/Dockerfile .
docker run -d -p 8787:8787 -e CLAUDE_SYNC_TOKEN="your-shared-secret" claude-sync-relay
```

The relay listens on port `8787` by default. Use a reverse proxy (nginx/Caddy) for TLS in production.

#### 2. Configure each machine

Register the MCP server with Claude Code:

```bash
claude mcp add -t stdio -s user \
  claude-sync \
  -e "CLAUDE_SYNC_URL=ws://your-server:8787" \
  -e "CLAUDE_SYNC_TOKEN=your-shared-secret" \
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
        "CLAUDE_SYNC_URL": "ws://your-server:8787",
        "CLAUDE_SYNC_TOKEN": "your-shared-secret",
        "CLAUDE_SYNC_PEER_NAME": "my-machine"
      }
    }
  }
}
```

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
# Set env vars
export CLAUDE_SYNC_URL="ws://your-server:8787"
export CLAUDE_SYNC_TOKEN="your-shared-secret"
export CLAUDE_SYNC_PEER_NAME="my-machine"

# Commands
node packages/mcp/dist/cli.js list-peers
node packages/mcp/dist/cli.js send-task --to windows-pc --instructions "git pull && npm test"
node packages/mcp/dist/cli.js check-inbox
node packages/mcp/dist/cli.js send-result --to macbook --task-id <id> --status success --summary "All tests passed"
node packages/mcp/dist/cli.js git-sync --message "fix: update tests" --notify
```

## Environment variables

### Relay server

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_SYNC_TOKEN` | (required) | Shared authentication token |
| `CLAUDE_SYNC_PORT` | `8787` | Listen port |
| `CLAUDE_SYNC_HOST` | `0.0.0.0` | Listen host |

### MCP server / CLI

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_SYNC_URL` | (required) | WebSocket URL of the relay |
| `CLAUDE_SYNC_TOKEN` | (required) | Shared authentication token |
| `CLAUDE_SYNC_PEER_NAME` | random | Unique name for this instance |

## Security

- **Auth token is stored in plaintext** in Claude Code's config (`~/.claude.json` or `.mcp.json`). This is standard for MCP servers but worth knowing.
- **The relay uses plain `ws://`** — no encryption. Put it behind a reverse proxy (nginx/Caddy) with TLS for anything over the internet. Fine on localhost or a private network.
- **`git_sync` checks for secrets before staging.** It will refuse to commit files matching common sensitive patterns (`.env`, `*.pem`, `*.key`, `credentials.json`, etc.). If it blocks a file you need, add it to your `.gitignore` review and stage manually.
- Auth uses timing-safe token comparison (`crypto.timingSafeEqual`)
- `.mcp.json` is gitignored (contains secrets) — `.mcp.json.example` is provided as a template
- Relay enforces a 1MB max message size

## Development

```bash
npm install
npm run build
npm test
```

Tests include unit tests for protocol/auth/peers, integration tests for the relay server, and task store tests.

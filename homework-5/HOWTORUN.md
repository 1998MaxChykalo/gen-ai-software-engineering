# How to run — Homework 5

Covers the custom FastMCP server end to end (install → run → connect → test), then
the registration commands for the three external servers.

## Prerequisites

- **Python 3.10+** for the custom server. If you only have an older Python, install
  [`uv`](https://docs.astral.sh/uv/) — it downloads a modern Python for you:
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- **Claude Code** (or another MCP client) for connecting the servers.
- **Node.js** for the filesystem server.

## 1. Custom FastMCP server

### Install dependencies

```bash
cd homework-5/custom-mcp-server

# with uv (works even without a local Python 3.10+):
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt

# or with a system Python 3.10+:
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

`requirements.txt` explicitly includes **`fastmcp`** (plus `pytest`/`pytest-asyncio`
for the tests).

### Run the server

```bash
.venv/bin/python server.py
```

The server speaks MCP over **stdio**: it prints a FastMCP banner and then waits for a
client on stdin — that is the "running" state, not a hang. In normal use you don't
start it yourself; the MCP client spawns it with exactly this command. `Ctrl+C` stops
a manual run.

### Connect the MCP configuration

Register with Claude Code (run from the **repository root** — local-scope config is
attached to the directory you run it from):

```bash
claude mcp add lorem-ipsum -s local -- \
  "$PWD/homework-5/custom-mcp-server/.venv/bin/python" \
  "$PWD/homework-5/custom-mcp-server/server.py"
```

Verify it's registered and healthy:

```bash
claude mcp list
# ...
# lorem-ipsum: .../custom-mcp-server/.venv/bin/python .../server.py - ✔ Connected
```

Restart the Claude Code session (MCP servers load at startup). A combined
project-style config for all four servers is documented in [`.mcp.json`](.mcp.json).

### Use / test the `read` tool

**From a Claude Code session:**

```
Use the read tool from the lorem-ipsum MCP server with word_count 10
```

Claude calls `mcp__lorem-ipsum__read` and answers with the first 10 words of
`lorem-ipsum.md`. Omitting `word_count` returns 30 words. The resource can be read
too: `lorem://words/5`.

**Unit/integration tests** (12 tests — word-limit logic, tool calls, both resources):

```bash
cd homework-5/custom-mcp-server
.venv/bin/python -m pytest -v
```

**Stdio smoke test** — spawns the real `python server.py` subprocess like an MCP
client would, then exercises `tools/list`, `tools/call read` (default + custom
count) and `resources/read`:

```bash
.venv/bin/python tests/smoke_stdio.py
```

Expected output ends with:
`OK: resource and read tool both return word-limited content`.

### Verified

- ✅ Start command works: `.venv/bin/python server.py` (see `docs/custom-mcp-read-tool-result.txt` — the client spawns this exact command over stdio)
- ✅ MCP configuration valid and pointing at the server: `claude mcp list` shows `lorem-ipsum … ✔ Connected` (see `docs/mcp-servers-connected.txt`)
- ✅ `fastmcp` present in `custom-mcp-server/requirements.txt`
- ✅ Resource and `read` tool return word-limited content: 12/12 tests pass (see `docs/custom-mcp-test-results.txt`)

## 2. External servers

```bash
# GitHub (HTTP, OAuth handled by Claude Code on first use)
claude mcp add --transport http github https://api.githubcopilot.com/mcp

# Jira / Atlassian (SSE, OAuth on first use)
claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse

# Filesystem (stdio), rooted at the current directory
claude mcp add filesystem -s local -- npx -y @modelcontextprotocol/server-filesystem .
```

> **Note (corporate npm registry):** if `npx` cannot reach your configured registry
> (e.g. an internal Artifactory that requires VPN), the filesystem server times out on
> startup. Install the package once from the public registry and register the binary
> instead:
> ```bash
> npm i -g @modelcontextprotocol/server-filesystem --registry=https://registry.npmjs.org/
> claude mcp remove filesystem -s local
> claude mcp add filesystem -s local -- "$(which mcp-server-filesystem)" .
> ```

Check everything with `claude mcp list` — all four servers should report
`✔ Connected`.

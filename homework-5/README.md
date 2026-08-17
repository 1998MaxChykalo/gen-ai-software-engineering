# Homework 5 — Configure MCP Servers

**Author:** Maxym Chykalo

Four MCP servers connected to Claude Code and demonstrated with real interactions:
three external ones (GitHub, Filesystem, Jira/Atlassian) and one custom server
built with [FastMCP](https://gofastmcp.com).

## Configured servers

| Server | Transport | What it provides | Demonstrated interaction |
|---|---|---|---|
| **github** | HTTP (`api.githubcopilot.com/mcp`) | GitHub repos, PRs, issues | Listed the recent pull requests of this repository |
| **atlassian** (Jira) | SSE (`mcp.atlassian.com/v1/sse`) | Jira issues, Confluence pages | Queried the last 5 bug tickets of a real project |
| **filesystem** | stdio (`mcp-server-filesystem .`) | Read/browse files in this repo | Summarized the repository directory structure via `directory_tree` |
| **lorem-ipsum** (custom) | stdio (`python server.py`) | Word-limited content of `lorem-ipsum.md` | Called the `read` tool with default and custom `word_count` |

The combined configuration is in [`.mcp.json`](.mcp.json) (custom-server paths are
relative to this folder; the actual registration commands with absolute paths are in
[`HOWTORUN.md`](HOWTORUN.md)). Screenshots of every interaction are in
[`docs/screenshots/`](docs/screenshots/).

## Custom MCP server (`custom-mcp-server/`)

A FastMCP server ([`server.py`](custom-mcp-server/server.py)) that serves the contents
of [`lorem-ipsum.md`](custom-mcp-server/lorem-ipsum.md) in two ways:

- **Resources** — `lorem://words` (first 30 words, the default) and the templated
  `lorem://words/{word_count}` (first *N* words).
- **Tool** — `read(word_count: int = 30)`, returning the same word-limited content.

Both go through one helper, `read_words()`, so the tool and the resource are
guaranteed to return identical content for the same count (covered by a test).
`fastmcp` is declared explicitly in
[`custom-mcp-server/requirements.txt`](custom-mcp-server/requirements.txt).

### Resources vs. Tools

- **Resources** are URIs that Claude can *read from* — like files or API endpoints.
  They are addressable data: the client picks a URI (`lorem://words/10`) and gets
  content back. Reading a resource has no side effects.
- **Tools** are *actions Claude can call* to perform operations — reading a file,
  running a command, creating a ticket. The model chooses to invoke them with
  arguments (`read(word_count=10)`) during a conversation, and they may have side
  effects.

Rule of thumb: a resource is "here is data you can look at", a tool is "here is
something you can do". This server intentionally exposes the same content both ways
to make the difference visible.

### Testing

12 pytest tests cover the word-limiting logic and the full MCP surface (tool listing,
tool calls, default and templated resources) via FastMCP's in-memory client, plus a
stdio smoke script (`tests/smoke_stdio.py`) that spawns the real server subprocess the
same way Claude Code does. Results: `docs/custom-mcp-test-results.txt` and
`docs/custom-mcp-read-tool-result.txt`.

## How AI was used

The whole homework was driven through Claude Code:

- **Server interactions** — the GitHub PR listing, Jira bug query, and filesystem
  directory summary were regular prompts against the connected MCP servers.
- **Troubleshooting** — the filesystem server initially failed with a 30-second
  connection timeout. Claude diagnosed the root cause (npm's registry pointed at an
  internal Artifactory host unreachable off-VPN, so `npx` hung downloading the
  package), installed the package globally from the public registry, and repointed
  the config at the binary.
- **Custom server** — Claude wrote `server.py`, the test suite, and the docs; created
  a Python 3.12 environment with `uv` (the system Python 3.9 is too old for FastMCP);
  registered the server with `claude mcp add`; and verified the connection with
  `claude mcp list`.
- **Evidence** — test and tool-call transcripts were captured to `docs/` and rendered
  to PNGs with the headless-Chrome script from homework 4.

## Challenges

1. **Corporate npm registry** — `npx`-based MCP servers timed out because npm was
   configured for `artifactory.prod.auto1.team` (unreachable off-VPN). Fixed by
   installing `@modelcontextprotocol/server-filesystem` globally with
   `--registry=https://registry.npmjs.org/` and pointing the MCP config at the
   installed binary, removing the network dependency from server startup.
2. **Python too old for FastMCP** — the machine only had Python 3.9; FastMCP needs
   3.10+. Solved with `uv`, which downloads a standalone Python 3.12 and builds the
   venv in seconds.
3. **Config scope pitfall** — `claude mcp add -s local` attaches the server to the
   *current directory's* project entry. Registering from a subfolder silently created
   a config the main session would never load; re-registering from the repo root
   fixed it.

## Screenshots (`docs/screenshots/`)

| File | Shows |
|---|---|
| `all-mcp-servers-connected.png` | `claude mcp list` — all four servers ✔ Connected |
| `github-mcp-connect.png` / `github-mcp-result.png` | GitHub MCP setup and PR-listing result |
| `filesystem-mcp-connect.png` / `filesystem-mcp-result.png` | Filesystem MCP setup and directory summary |
| `jira-mcp-connect.png` / `jira-or-notion-mcp-result.png` | Jira MCP setup and last-5-bugs query |
| `custom-mcp-read-tool-result.png` | Custom server: `read` tool + resource calls over stdio |
| `custom-mcp-tests.png` | Custom server: 12/12 tests passing |

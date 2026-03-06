# Agent Hub

`agent-hub/` is the shared source of truth for agent-related repo state.

Managed here:

- Shared skills in `agent-hub/skills/`
- Shared MCP server definitions in `agent-hub/mcp/servers.json`

Generated from here:

- Claude skills in `.claude/skills/`
- Codex skills in `.codex/skills/`
- Gemini skills in `.gemini/skills/`
- Claude MCP config in `.mcp.json`
- Gemini MCP config in `.gemini/settings.json`
- Codex MCP desired state in `agent-hub/generated/codex-mcp-servers.json`

Codex MCP note:

- Codex manages MCP servers from `~/.codex/config.toml`
- `pnpm agent:sync` does not mutate home-directory config
- `pnpm agent:sync:codex-home` applies the repo-managed Codex MCP set to `~/.codex/config.toml` via `codex mcp add/remove`

Usage:

```bash
pnpm agent:sync
pnpm agent:check
pnpm agent:sync:codex-home
```

Conventions:

- Add or edit shared skills under `agent-hub/skills/<skill-name>/`
- Add MCP servers in `agent-hub/mcp/servers.json`
- Do not hand-edit generated skill copies in `.claude/skills`, `.codex/skills`, or `.gemini/skills`

# @ai-native-solutions/fallmage-mcp

MCP stdio server exposing fallmage image-editor primitives to any Model Context Protocol client (Claude Desktop, Claude Code, Cursor, ...).

## What's inside

**6 tools:**

| Tool | Purpose |
|---|---|
| `omega_route` | Route an NL intent → structured action (local, no LLM) |
| `list_presets` | 11 canvas size presets |
| `list_filters` | 9 filter presets with adjust values |
| `plan_document` | Build a full document plan (dims, background, filter, caption) |
| `adjust_to_css_filter` | Serialize adjust → CSS filter string |
| `omega_prompt` | Return LLM system prompt + user intent (fallback path) |

**4 resources:**

- `fallmage://presets`
- `fallmage://filters`
- `fallmage://fonts`
- `fallmage://omega`

## Install

### Claude Code

```bash
claude mcp add fallmage -- npx -y @ai-native-solutions/fallmage-mcp
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "fallmage": {
      "command": "npx",
      "args": ["-y", "@ai-native-solutions/fallmage-mcp"]
    }
  }
}
```

### From source

```bash
git clone https://github.com/sjgant80-hub/fallmage-mcp
cd fallmage-mcp && npm install
node ./src/index.js
```

## Try it

Once wired, ask any MCP-capable model:

- "Use fallmage to plan an instagram square with vintage filter and caption 'launch day'"
- "Route the intent 'make it pop' via fallmage"
- "Show me fallmage's filter library"

## License

MIT · AI-Native Solutions

# Cartographer Plugin for Claude Code

Architecture-as-Code plugin for spec-driven development. Define entities, relations, and code references in YAML specs, then keep implementations synchronized.

## Features

| Feature | Description |
|---------|-------------|
| **Commands** | `/graph:check`, `/graph:entity`, `/graph:impact` |
| **Auto-activation** | Skills detect when you're working with entities |
| **Enforcement** | Hooks auto-verify sync after file changes |
| **MCP Tools** | Full access to Cartographer's query and analysis tools |

## Installation

### From Repository (Development)

```bash
# Clone the repository
git clone https://github.com/vyshnavsdeepak/cartographer.git
cd cartographer

# Build the MCP server
pnpm install
pnpm build

# Install the plugin in Claude Code
claude plugins install ./plugin
```

### From npm (Coming Soon)

```bash
claude plugins install cartographer
```

## Commands

### `/graph:check`

Verify that code implementations match architecture specifications.

```
/graph:check
```

Reports any drift between `.graph/` specs and code implementations.

### `/graph:entity <name>`

Query detailed information about an entity.

```
/graph:entity User
/graph:entity Todo
```

Shows fields, relations, code references, and sync status.

### `/graph:impact <entity>[.field]`

Analyze the impact of changes before making modifications.

```
/graph:impact User
/graph:impact User.email
```

Shows dependent entities, code locations, and suggested actions.

## Auto-Activation

The **architecture-graph** skill automatically activates when you:
- Mention "entities", "relations", or "architecture"
- Work with `.graph/` files
- Ask about spec-driven development
- Reference `@graph:` anchors

## Hooks

The plugin automatically runs `cartographer scan` after every Edit/Write operation to catch drift immediately.

## Project Setup

For Cartographer to work, your project needs a `.graph/` directory:

```
your-project/
├── .graph/
│   └── entities/
│       ├── user.yaml
│       └── todo.yaml
└── src/
    └── ... (code with @graph: anchors)
```

### Entity Example

```yaml
# .graph/entities/user.yaml
name: User
description: Application user account
fields:
  - name: id
    type: uuid
    primary: true
  - name: email
    type: string
    unique: true
relations:
  - name: todos
    entity: Todo
    type: has_many
code_refs:
  model:
    anchor: "@graph:User.model"
```

### Code Anchor Example

```typescript
// @graph:User.model
export interface User {
  id: string;
  email: string;
}
// @end:User.model
```

## MCP Tools

The plugin bundles the Cartographer MCP server with these tools:

| Tool | Description |
|------|-------------|
| `scan` | Analyze codebase and find anchors |
| `query` | Get entity details |
| `validate` | Check spec compliance |
| `impact` | Analyze change dependencies |
| `get_relations` | Fetch entity relations |

## Configuration

### Environment Variables

None required for basic usage.

### Custom MCP Configuration

For advanced users, you can override the MCP server in `.mcp.json`:

```json
{
  "cartographer": {
    "command": "npx",
    "args": ["-y", "cartographer", "serve"]
  }
}
```

## Troubleshooting

### Plugin not loading
1. Ensure Claude Code is restarted after installation
2. Check `claude plugins list` shows cartographer
3. Run `claude --debug` to see loading errors

### MCP server not connecting
1. Verify the build exists: `ls dist/mcp/server.js`
2. Run `pnpm build` if missing
3. Check `/mcp` command shows cartographer tools

### Commands not appearing
1. Restart Claude Code
2. Check `plugin/commands/` contains `.md` files
3. Verify YAML frontmatter is valid

## Development

### Testing the Plugin

```bash
# Run plugin validation tests
pnpm test plugin

# Manual testing
claude --debug
/graph:check
```

### Making Changes

1. Edit files in `plugin/`
2. Restart Claude Code to reload
3. Test the changes
4. Run `pnpm test plugin` before committing

## License

MIT

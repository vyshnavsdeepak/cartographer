# Cartographer

An MCP server that provides AI agents with a structured, queryable architecture graph of your codebase.

## The Problem

When you ask an AI to "add a phone field to User", it has to:
1. Grep around hoping to find the right files
2. Guess which files define User (model? schema? types? API?)
3. Hope it doesn't miss something

## The Solution

Cartographer gives AI a map. Instead of guessing, the AI queries a graph that knows:
- **What entities exist** (User, Order, Payment)
- **How they relate** to each other
- **Where in the code** each concept is implemented (via anchor comments)

## Quick Start

```bash
# Initialize in your project
npx cartographer init

# Define an entity
# Edit .graph/entities/user.yaml

# Add anchors to your code
# // @graph:User.model

# Verify everything matches
npx cartographer scan

# Start MCP server for AI
npx cartographer serve
```

## Anchor Format

Add anchor comments to mark where concepts are implemented:

```typescript
// @graph:User.model
export class User {
  id: string;
  email: string;
}
// @end:User.model  // Optional explicit end

// @graph:User.types
export interface UserDTO {
  id: string;
  email: string;
}
```

### Anchor naming convention

```
@graph:{Entity}.{category}

Categories:
  model      → ORM/class definition
  schema     → Database schema
  types      → TypeScript types/interfaces
  validation → Validation schemas
  api.{action} → API endpoints (list, get, create, update, delete)
```

## Entity Definition

Entities are defined in YAML:

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
  - name: status
    type: enum
    values: [active, inactive, suspended]
```

## MCP Integration

Configure in your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "cartographer": {
      "command": "npx",
      "args": ["cartographer", "serve"]
    }
  }
}
```

Then AI can query:
- `get_entity("User")` → Full entity definition with field types
- `get_anchor("@graph:User.model")` → File path, line number, content
- `list_entities()` → All entities in the graph
- `check_sync_status()` → Are anchors in sync with graph?

## Project Status

**Current:** Core functionality in development

- [x] Entity schema with Zod validation
- [x] YAML loader for entity definitions
- [x] Anchor scanner for source files
- [ ] Graph + Anchor resolver (wiring them together)
- [ ] MCP server with tools
- [ ] CLI commands (init, scan, serve)

See [GitHub Issues](https://github.com/vyshnavsdeepak/cartographer/issues) for detailed roadmap.

## Development

```bash
# Install dependencies
pnpm install

# Run in dev mode (watch)
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Build for production
pnpm build
```

## License

MIT

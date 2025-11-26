# Cartographer

**Architecture-as-Code** for spec-driven development with full traceability.

## Philosophy

Traditional development: Code first, document later (if ever).

**Spec-driven development with Cartographer:**
1. **Define** your architecture in YAML (the spec)
2. **Implement** with anchor comments linking code to spec
3. **Verify** code matches spec with `cartographer scan`
4. **Evolve** - changes to spec = architectural changelog (via git)

The spec becomes the **single source of truth**. AI agents and humans both follow it.

## Why This Matters

When you ask an AI to "add a phone field to User", without Cartographer it:
1. Greps around hoping to find relevant files
2. Guesses which files define User (model? schema? types? API?)
3. Misses some, breaks others

With Cartographer, the AI:
1. Queries `get_entity("User")` → sees all fields and their types
2. Queries `get_anchor("@graph:User.model")` → knows exact file and line
3. Follows the spec, updates all linked locations

**The spec drives the change, not guesswork.**

## Quick Start

```bash
# Initialize in your project
npx mcp-cartographer init

# Define your architecture
# Edit .graph/entities/user.yaml

# Add anchors to your code
# // @graph:User.model

# Verify spec matches code
npx mcp-cartographer scan

# Expose to AI via MCP
npx mcp-cartographer serve
```

## Defining Your Architecture

Entities are your architectural building blocks:

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

code_refs:
  model:
    anchor: "@graph:User.model"
    description: ORM class definition
  types:
    anchor: "@graph:User.types"
    description: TypeScript interfaces
  validation:
    anchor: "@graph:User.validation"
    description: Zod schema
```

## Linking Code to Spec

Add anchor comments where concepts are implemented:

```typescript
// @graph:User.model
export class User {
  id: string;
  email: string;
  status: UserStatus;
}
// @end:User.model

// @graph:User.types
export interface CreateUserDTO {
  email: string;
}
// @end:User.types

// @graph:User.validation
export const CreateUserSchema = z.object({
  email: z.string().email(),
});
// @end:User.validation
```

**Traceability**: Spec → Code and Code → Spec, always in sync.

## Verifying Sync

```bash
$ npx mcp-cartographer scan

Scan Results
  Entities: 3
  Anchors:  9

✓ All anchors in sync
```

When out of sync:
```bash
✗ Missing anchors (defined in spec, not found in code):
  @graph:User.validation
    Add this comment to your code where User validation is defined:
    // @graph:User.validation

? Orphaned anchors (in code but not in spec):
  @graph:Order.legacy
    src/models/order.ts:42
```

## MCP Integration

Configure in `.mcp.json`:

```json
{
  "mcpServers": {
    "cartographer": {
      "command": "npx",
      "args": ["mcp-cartographer", "serve"]
    }
  }
}
```

AI tools available:
- `list_entities()` → All entities in the architecture
- `get_entity("User")` → Full spec with fields and code refs
- `get_anchor("@graph:User.model")` → File, line, content
- `check_sync_status()` → Is spec in sync with code?

## Anchor Convention

```
@graph:{Entity}.{category}

Categories:
  model       → ORM/class definition
  schema      → Database schema
  types       → TypeScript types/interfaces
  validation  → Validation schemas (Zod, Yup, etc.)
  api.list    → List endpoint
  api.get     → Get by ID endpoint
  api.create  → Create endpoint
  api.update  → Update endpoint
  api.delete  → Delete endpoint
```

## Configuration

`.graph/config.yaml`:
```yaml
sourceRoots:
  - src
  - lib
```

## Roadmap

See [GitHub Issues](https://github.com/vyshnavsdeepak/cartographer/issues) for detailed roadmap.

**Core (complete):**
- [x] Entity schema with Zod validation
- [x] YAML loader for entity definitions
- [x] Anchor scanner for source files
- [x] Graph + Anchor resolver
- [x] MCP server with tools
- [x] CLI (init, scan, serve)

**Next:**
- [ ] Relations between entities
- [ ] Impact analysis (what changes if I modify X?)
- [ ] Migration generation
- [ ] Architecture diagrams from spec

## Development

```bash
pnpm install    # Install dependencies
pnpm dev        # Dev mode with watch
pnpm test       # Run tests
pnpm typecheck  # Type check
pnpm build      # Build for production
```

## Related Concepts

- [Architecture Decision Records (ADRs)](https://adr.github.io/) - Capture *why* decisions were made
- [Docs as Code](https://www.writethedocs.org/guide/docs-as-code/) - Documentation with same rigor as code
- [C4 Model](https://c4model.com/) - Architecture diagrams

Cartographer complements these by capturing *what* exists and *where* it's implemented.

## License

[MIT](LICENSE)

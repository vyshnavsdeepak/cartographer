# Todo API - Cartographer Integration

This project uses **Cartographer** for spec-driven development. The architecture is defined in `.graph/entities/` and must be followed when implementing code.

## Architecture Graph

The domain model is defined in YAML files:

| Entity | File | Description |
|--------|------|-------------|
| User | `.graph/entities/user.yaml` | Application user account |
| Todo | `.graph/entities/todo.yaml` | Todo item belonging to a user |
| Category | `.graph/entities/category.yaml` | Category for organizing todos |

## Required Workflow

### Before Implementing Domain Code

1. **Check the spec** - Use Cartographer MCP tools:
   ```
   list_entities        → See all defined entities
   get_entity <name>    → Get full spec with fields, relations, code_refs
   get_relations        → See how entities relate to each other
   ```

2. **Follow the spec exactly** - Match field names, types, and relations from the YAML definition

### When Writing Implementation Code

1. **Add anchor comments** to mark code that implements a graph entity:
   ```typescript
   // @graph:EntityName.category
   // ... your implementation ...
   // @end:EntityName.category
   ```

2. **Valid categories**:
   - `model` - Data model definition
   - `schema` - Validation schemas (Zod, etc.)
   - `types` - TypeScript type definitions
   - `validation` - Validation logic
   - `api` - API endpoints

3. **Example**:
   ```typescript
   // @graph:User.model
   export interface User {
     id: string;
     email: string;
     name: string;
     created_at: Date;
   }
   // @end:User.model
   ```

### Before Committing

1. **Verify sync status**:
   ```bash
   cartographer scan
   ```
   Or use MCP tool: `check_sync_status`

2. **Fix any issues**:
   - Missing anchors → Add `// @graph:Entity.category` comment
   - Orphaned anchors → Either add to `.graph/entities/*.yaml` or remove from code

## Impact Analysis

Before making changes to entities, check what will break:

```
analyze_impact {
  "entity": "User",
  "change": { "type": "rename_field", "field": "name", "newName": "displayName" }
}
```

This shows:
- Affected code locations
- Related entities
- Suggested migration steps

## Quick Reference

| Task | Command/Tool |
|------|--------------|
| See all entities | `list_entities` |
| Get entity details | `get_entity User` |
| Check if in sync | `check_sync_status` or `cartographer scan` |
| Analyze changes | `analyze_impact` |
| View relations | `get_relations` |
| Find code by anchor | `get_anchor @graph:User.model` |

---
name: graph:impact
description: Analyze impact of changes to an entity or field before modifications
allowed-tools:
  - mcp__plugin_cartographer_cartographer__impact
  - mcp__plugin_cartographer_cartographer__query
  - mcp__plugin_cartographer_cartographer__get_relations
  - Read
---

# Graph Impact Command

Analyze the impact of potential changes to an entity or field before making modifications.

## Usage

The user provides an entity or entity.field after the command:
- `/graph:impact User` - Impact of changes to entire User entity
- `/graph:impact User.email` - Impact of changing User's email field
- `/graph:impact Todo.status` - Impact of changing Todo's status field

Parse the target from the user's input. If it contains a dot, it's a field reference.

## Workflow

1. **Parse the target** from user input (entity or entity.field)
2. **Run impact analysis** using `mcp__plugin_cartographer_cartographer__impact`
3. **Categorize impacts** by severity:
   - **Breaking**: Requires code changes, may break functionality
   - **Warning**: May affect behavior, needs review
   - **Info**: Minimal impact, informational
4. **Present actionable summary** with specific file locations and suggestions

## Output Format

```
## Impact Analysis: User.email

### Summary
- **Risk Level**: High
- **Files Affected**: 4
- **Entities Affected**: 2

### Breaking Changes (requires code modifications)

1. **src/models/user.ts:15** - User interface definition
   - Field type change affects model
   - Action: Update interface property type

2. **src/schemas/user.ts:8** - Zod validation schema
   - Validation rules need update
   - Action: Modify email field validator

3. **src/api/users.ts:42** - User API endpoint
   - Query parameters affected
   - Action: Update request/response handling

### Related Entities

| Entity | Relation | Impact |
|--------|----------|--------|
| Session | belongs_to User | May need migration for foreign key |
| AuditLog | references User.email | Update log format |

### Suggested Actions

1. [ ] Update User model interface in src/models/user.ts
2. [ ] Modify validation schema in src/schemas/user.ts
3. [ ] Update API endpoint handling
4. [ ] Create database migration if field type changes
5. [ ] Update tests that reference User.email
6. [ ] Review related entities for cascade effects

### Migration Checklist

If this is a database field change:
- [ ] Create migration script
- [ ] Plan for zero-downtime deployment
- [ ] Consider data backfill requirements
- [ ] Update API documentation
```

## Error Handling

If the entity or field is not found:
1. Report what was searched for
2. If entity exists but field doesn't, list available fields
3. If entity doesn't exist, list available entities

Example:
```
Field "User.username" not found.

User entity has these fields:
- id (uuid)
- email (string)
- name (string)
- created_at (timestamp)

Did you mean "User.name"?
```

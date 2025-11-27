---
name: graph:entity
description: Query entity details including fields, relations, and code references
allowed-tools:
  - mcp__plugin_cartographer_cartographer__query
  - mcp__plugin_cartographer_cartographer__get_relations
  - Read
---

# Graph Entity Command

Query and display detailed information about an architecture entity.

## Usage

The user provides an entity name after the command:
- `/graph:entity User` - Show User entity details
- `/graph:entity Todo` - Show Todo entity details

Parse the entity name from the user's input following the command.

## Workflow

1. **Parse entity name** from the user's command input
2. **Query entity** using `mcp__plugin_cartographer_cartographer__query` with the entity name
3. **Get relations** using `mcp__plugin_cartographer_cartographer__get_relations` if entity has relations
4. **Display comprehensive information** as shown below

## Output Format

Present the entity information in a structured format:

```
## Entity: User

**Description**: Application user account with authentication

### Fields

| Name | Type | Constraints |
|------|------|-------------|
| id | uuid | primary |
| email | string | unique |
| name | string | |
| created_at | timestamp | |

### Relations

| Name | Target | Type | Description |
|------|--------|------|-------------|
| todos | Todo | has_many | User's todo items |
| categories | Category | has_many | User's categories |

### Code References

| Reference | File | Anchor | Status |
|-----------|------|--------|--------|
| model | src/models/user.ts | @graph:User.model | ✓ synced |
| schema | src/schemas/user.ts | @graph:User.schema | ✓ synced |
| api | src/api/users.ts | @graph:User.api | ✗ missing |
```

## Error Handling

If the entity is not found:
1. Report that the entity was not found
2. List all available entities in the graph
3. If the input looks like a typo, suggest similar entity names

Example:
```
Entity "Usr" not found.

Available entities:
- User
- Todo
- Category

Did you mean "User"?
```

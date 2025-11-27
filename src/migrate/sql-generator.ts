import type { Entity, Field, FieldType, Relation } from "#types";
import type { SpecChange, DiffResult } from "./differ.js";

/**
 * SQL dialect configuration
 */
export type SqlDialect = "postgresql" | "mysql" | "sqlite";

/**
 * Generated migration output
 */
export interface MigrationOutput {
  /** SQL statements to apply changes (up) */
  up: string[];
  /** SQL statements to revert changes (down) */
  down: string[];
  /** Human-readable description */
  description: string;
  /** Whether this migration contains destructive changes */
  hasDestructiveChanges: boolean;
  /** Warning messages for the user */
  warnings: string[];
}

/**
 * Map graph field types to SQL types
 */
function fieldTypeToSql(type: FieldType, dialect: SqlDialect): string {
  const typeMap: Record<FieldType, Record<SqlDialect, string>> = {
    uuid: {
      postgresql: "UUID",
      mysql: "CHAR(36)",
      sqlite: "TEXT",
    },
    string: {
      postgresql: "VARCHAR(255)",
      mysql: "VARCHAR(255)",
      sqlite: "TEXT",
    },
    text: {
      postgresql: "TEXT",
      mysql: "TEXT",
      sqlite: "TEXT",
    },
    integer: {
      postgresql: "INTEGER",
      mysql: "INT",
      sqlite: "INTEGER",
    },
    decimal: {
      postgresql: "DECIMAL(10,2)",
      mysql: "DECIMAL(10,2)",
      sqlite: "REAL",
    },
    boolean: {
      postgresql: "BOOLEAN",
      mysql: "TINYINT(1)",
      sqlite: "INTEGER",
    },
    timestamp: {
      postgresql: "TIMESTAMP WITH TIME ZONE",
      mysql: "DATETIME",
      sqlite: "TEXT",
    },
    date: {
      postgresql: "DATE",
      mysql: "DATE",
      sqlite: "TEXT",
    },
    json: {
      postgresql: "JSONB",
      mysql: "JSON",
      sqlite: "TEXT",
    },
    enum: {
      postgresql: "VARCHAR(50)",
      mysql: "VARCHAR(50)",
      sqlite: "TEXT",
    },
  };

  return typeMap[type][dialect];
}

/**
 * Convert entity name to table name (snake_case, pluralized)
 */
function entityToTableName(entityName: string): string {
  // Convert PascalCase to snake_case
  const snake = entityName
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");

  // Simple pluralization
  if (snake.endsWith("y")) {
    return snake.slice(0, -1) + "ies";
  } else if (snake.endsWith("s") || snake.endsWith("x") || snake.endsWith("ch") || snake.endsWith("sh")) {
    return snake + "es";
  }
  return snake + "s";
}

/**
 * Convert field name to column name (snake_case)
 */
function fieldToColumnName(fieldName: string): string {
  return fieldName
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Generate SQL for creating a new table
 */
function generateCreateTable(entity: Entity, dialect: SqlDialect): string[] {
  const tableName = entityToTableName(entity.name);
  const columns: string[] = [];

  for (const field of entity.fields) {
    const columnName = fieldToColumnName(field.name);
    const sqlType = fieldTypeToSql(field.type, dialect);
    let columnDef = `  ${columnName} ${sqlType}`;

    if (field.primary) {
      columnDef += " PRIMARY KEY";
    }
    if (!field.nullable && !field.primary) {
      columnDef += " NOT NULL";
    }
    if (field.unique && !field.primary) {
      columnDef += " UNIQUE";
    }
    if (field.default !== undefined) {
      const defaultVal = formatDefaultValue(field.default, field.type, dialect);
      columnDef += ` DEFAULT ${defaultVal}`;
    }

    columns.push(columnDef);
  }

  // Add timestamps
  if (dialect === "postgresql") {
    columns.push("  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
    columns.push("  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
  } else if (dialect === "mysql") {
    columns.push("  created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    columns.push("  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
  } else {
    columns.push("  created_at TEXT DEFAULT CURRENT_TIMESTAMP");
    columns.push("  updated_at TEXT DEFAULT CURRENT_TIMESTAMP");
  }

  return [`CREATE TABLE ${tableName} (\n${columns.join(",\n")}\n);`];
}

/**
 * Generate SQL for dropping a table
 */
function generateDropTable(entityName: string): string[] {
  const tableName = entityToTableName(entityName);
  return [`DROP TABLE IF EXISTS ${tableName};`];
}

/**
 * Generate SQL for adding a column
 */
function generateAddColumn(
  entityName: string,
  field: Field,
  dialect: SqlDialect
): string[] {
  const tableName = entityToTableName(entityName);
  const columnName = fieldToColumnName(field.name);
  const sqlType = fieldTypeToSql(field.type, dialect);

  let columnDef = `${sqlType}`;
  if (!field.nullable) {
    columnDef += " NOT NULL";
  }
  if (field.unique) {
    columnDef += " UNIQUE";
  }
  if (field.default !== undefined) {
    const defaultVal = formatDefaultValue(field.default, field.type, dialect);
    columnDef += ` DEFAULT ${defaultVal}`;
  }

  return [`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`];
}

/**
 * Generate SQL for dropping a column
 */
function generateDropColumn(entityName: string, fieldName: string): string[] {
  const tableName = entityToTableName(entityName);
  const columnName = fieldToColumnName(fieldName);
  return [`ALTER TABLE ${tableName} DROP COLUMN ${columnName};`];
}

/**
 * Generate SQL for changing a column type
 */
function generateAlterColumnType(
  entityName: string,
  fieldName: string,
  newType: FieldType,
  dialect: SqlDialect
): string[] {
  const tableName = entityToTableName(entityName);
  const columnName = fieldToColumnName(fieldName);
  const sqlType = fieldTypeToSql(newType, dialect);

  if (dialect === "postgresql") {
    return [`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${sqlType};`];
  } else if (dialect === "mysql") {
    return [`ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${sqlType};`];
  } else {
    // SQLite requires table recreation - return a comment
    return [`-- SQLite requires table recreation to change column type for ${tableName}.${columnName}`];
  }
}

/**
 * Generate SQL for changing nullable constraint
 */
function generateAlterNullable(
  entityName: string,
  fieldName: string,
  nullable: boolean,
  dialect: SqlDialect
): string[] {
  const tableName = entityToTableName(entityName);
  const columnName = fieldToColumnName(fieldName);

  if (dialect === "postgresql") {
    if (nullable) {
      return [`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} DROP NOT NULL;`];
    } else {
      return [`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL;`];
    }
  } else if (dialect === "mysql") {
    // MySQL requires knowing the full column definition
    return [`-- MySQL: Modify column ${tableName}.${columnName} to set nullable=${nullable}`];
  } else {
    return [`-- SQLite requires table recreation to change nullable for ${tableName}.${columnName}`];
  }
}

/**
 * Generate SQL for changing default value
 */
function generateAlterDefault(
  entityName: string,
  fieldName: string,
  newDefault: unknown,
  fieldType: FieldType,
  dialect: SqlDialect
): string[] {
  const tableName = entityToTableName(entityName);
  const columnName = fieldToColumnName(fieldName);

  if (newDefault === undefined) {
    if (dialect === "postgresql") {
      return [`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} DROP DEFAULT;`];
    }
    return [`-- Drop default for ${tableName}.${columnName}`];
  }

  const defaultVal = formatDefaultValue(newDefault, fieldType, dialect);
  if (dialect === "postgresql" || dialect === "mysql") {
    return [`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET DEFAULT ${defaultVal};`];
  }
  return [`-- SQLite: Set default for ${tableName}.${columnName} to ${defaultVal}`];
}

/**
 * Format a default value for SQL
 */
function formatDefaultValue(
  value: unknown,
  type: FieldType,
  dialect: SqlDialect
): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") {
    if (dialect === "postgresql") return value ? "TRUE" : "FALSE";
    return value ? "1" : "0";
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (type === "json") return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return String(value);
}

/**
 * Generate migration SQL from a diff result
 */
export function generateMigration(
  diffResult: DiffResult,
  entities: Entity[],
  dialect: SqlDialect = "postgresql"
): MigrationOutput {
  const up: string[] = [];
  const down: string[] = [];
  const warnings: string[] = [];
  const entityMap = new Map(entities.map((e) => [e.name, e]));

  for (const change of diffResult.changes) {
    switch (change.type) {
      case "entity_added": {
        const entity = entityMap.get(change.entity);
        if (entity) {
          up.push(...generateCreateTable(entity, dialect));
          down.push(...generateDropTable(change.entity));
        }
        break;
      }

      case "entity_removed": {
        warnings.push(`⚠️  Dropping table ${entityToTableName(change.entity)} - this will DELETE ALL DATA!`);
        up.push(...generateDropTable(change.entity));
        // Can't auto-generate down for dropped table
        down.push(`-- Cannot recreate dropped table ${entityToTableName(change.entity)}`);
        break;
      }

      case "field_added": {
        const field = change.newValue as Field;
        if (change.breaking) {
          warnings.push(
            `⚠️  Adding non-nullable column ${change.entity}.${change.field} without default may fail if table has data`
          );
        }
        up.push(...generateAddColumn(change.entity, field, dialect));
        down.push(...generateDropColumn(change.entity, change.field!));
        break;
      }

      case "field_removed": {
        warnings.push(
          `⚠️  Dropping column ${change.entity}.${change.field} - this will DELETE COLUMN DATA!`
        );
        up.push(...generateDropColumn(change.entity, change.field!));
        // Can't auto-generate down for dropped column
        down.push(`-- Cannot recreate dropped column ${change.entity}.${change.field}`);
        break;
      }

      case "field_type_changed": {
        if (change.breaking) {
          warnings.push(
            `⚠️  Type change ${change.entity}.${change.field}: ${change.oldValue} -> ${change.newValue} may cause data loss`
          );
        }
        up.push(
          ...generateAlterColumnType(
            change.entity,
            change.field!,
            change.newValue as FieldType,
            dialect
          )
        );
        down.push(
          ...generateAlterColumnType(
            change.entity,
            change.field!,
            change.oldValue as FieldType,
            dialect
          )
        );
        break;
      }

      case "field_nullable_changed": {
        if (change.breaking) {
          warnings.push(
            `⚠️  Making ${change.entity}.${change.field} non-nullable may fail if NULL values exist`
          );
        }
        up.push(
          ...generateAlterNullable(
            change.entity,
            change.field!,
            change.newValue as boolean,
            dialect
          )
        );
        down.push(
          ...generateAlterNullable(
            change.entity,
            change.field!,
            change.oldValue as boolean,
            dialect
          )
        );
        break;
      }

      case "field_default_changed": {
        const entity = entityMap.get(change.entity);
        const field = entity?.fields.find((f) => f.name === change.field);
        if (field) {
          up.push(
            ...generateAlterDefault(
              change.entity,
              change.field!,
              change.newValue,
              field.type,
              dialect
            )
          );
          down.push(
            ...generateAlterDefault(
              change.entity,
              change.field!,
              change.oldValue,
              field.type,
              dialect
            )
          );
        }
        break;
      }

      case "relation_added":
      case "relation_removed":
        // Relations are handled at the ORM level, not SQL level for now
        break;
    }
  }

  // Skip field_added changes for new entities (already included in CREATE TABLE)
  const description = diffResult.summary.join(", ") || "No changes";

  return {
    up,
    down,
    description,
    hasDestructiveChanges: diffResult.hasBreakingChanges,
    warnings,
  };
}

/**
 * Format migration output as SQL file content
 */
export function formatMigrationFile(
  migration: MigrationOutput,
  name: string
): string {
  const lines: string[] = [
    `-- Migration: ${name}`,
    `-- Description: ${migration.description}`,
    `-- Generated: ${new Date().toISOString()}`,
    "",
  ];

  if (migration.warnings.length > 0) {
    lines.push("-- ⚠️  WARNINGS:");
    for (const warning of migration.warnings) {
      lines.push(`-- ${warning}`);
    }
    lines.push("");
  }

  lines.push("-- Up Migration");
  if (migration.up.length > 0) {
    lines.push(...migration.up);
  } else {
    lines.push("-- No changes");
  }

  lines.push("");
  lines.push("-- Down Migration (rollback)");
  if (migration.down.length > 0) {
    lines.push(...migration.down);
  } else {
    lines.push("-- No changes");
  }

  return lines.join("\n");
}

export { diffEntities, type SpecChange, type DiffResult, type ChangeType } from "./differ.js";
export {
  generateMigration,
  formatMigrationFile,
  type SqlDialect,
  type MigrationOutput,
} from "./sql-generator.js";
export {
  MigrationManager,
  type MigrationRecord,
  type MigrationState,
} from "./manager.js";

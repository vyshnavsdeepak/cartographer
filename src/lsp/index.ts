export { definitionProvider, findEntityDefinition } from "./features/definition.js";
export { referencesProvider, findAllReferences } from "./features/references.js";
export { diagnosticsProvider } from "./features/diagnostics.js";
export { hoverProvider } from "./features/hover.js";
export {
  getWordAtPosition,
  getWordRangeAtPosition,
  getYamlContext,
  isEntityReference,
  getEntityNameAtPosition,
  findAllEntityReferences,
  getEntityNameFromDocument,
  type EntityReference,
} from "./yaml-utils.js";

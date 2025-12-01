#!/usr/bin/env node

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
} from "vscode-languageserver/node.js";
import type {
  InitializeParams,
  InitializeResult,
  DefinitionParams,
  ReferenceParams,
  HoverParams,
  DidChangeWatchedFilesParams,
  WorkspaceFoldersChangeEvent,
  TextDocumentChangeEvent,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { Graph } from "../graph/graph.js";
import { definitionProvider } from "./features/definition.js";
import { referencesProvider } from "./features/references.js";
import { diagnosticsProvider } from "./features/diagnostics.js";
import { hoverProvider } from "./features/hover.js";

// Create connection using stdio and document manager
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Server state
let graph: Graph | null = null;
let workspaceRoot: string | null = null;
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  // Get workspace root
  const firstFolder = params.workspaceFolders?.[0];
  if (firstFolder) {
    workspaceRoot = URI.parse(firstFolder.uri).fsPath;
  } else if (params.rootUri) {
    workspaceRoot = URI.parse(params.rootUri).fsPath;
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
      referencesProvider: true,
      hoverProvider: true,
      // Rename is more complex, defer for now
      // renameProvider: { prepareProvider: true },
    },
  };
});

connection.onInitialized(async () => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }

  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event: WorkspaceFoldersChangeEvent) => {
      // Reload graph when workspace folders change
      loadGraph();
    });
  }

  // Load graph on startup
  await loadGraph();
});

async function loadGraph(): Promise<void> {
  if (!workspaceRoot) {
    connection.console.log("No workspace root, skipping graph load");
    return;
  }

  const graphPath = `${workspaceRoot}/.graph`;
  try {
    graph = new Graph(graphPath);
    await graph.load();
    connection.console.log(`Loaded graph with ${graph.getAllEntities().length} entities`);

    // Validate all open documents after loading graph
    documents.all().forEach((doc: TextDocument) => validateDocument(doc));
  } catch (error) {
    connection.console.log(`Failed to load graph: ${error}`);
    graph = null;
  }
}

// Validate a document and publish diagnostics
async function validateDocument(document: TextDocument): Promise<void> {
  if (!graph) return;

  // Only validate entity YAML files
  const uri = document.uri;
  if (!uri.includes(".graph/entities/") || !uri.endsWith(".yaml")) {
    return;
  }

  const diagnostics = diagnosticsProvider(document, graph);
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Document events
documents.onDidChangeContent((change: TextDocumentChangeEvent<TextDocument>) => {
  validateDocument(change.document);
});

documents.onDidOpen((event: TextDocumentChangeEvent<TextDocument>) => {
  validateDocument(event.document);
});

documents.onDidClose((event: TextDocumentChangeEvent<TextDocument>) => {
  // Clear diagnostics when document is closed
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// Watch for file changes in .graph/entities/
connection.onDidChangeWatchedFiles(async (_change: DidChangeWatchedFilesParams) => {
  // Reload graph when entity files change
  await loadGraph();
});

// Go to Definition
connection.onDefinition((params: DefinitionParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !graph || !workspaceRoot) return null;

  return definitionProvider(document, params.position, graph, workspaceRoot);
});

// Find References
connection.onReferences((params: ReferenceParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !graph || !workspaceRoot) return null;

  return referencesProvider(document, params.position, graph, workspaceRoot);
});

// Hover
connection.onHover((params: HoverParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document || !graph) return null;

  return hoverProvider(document, params.position, graph);
});

// Start listening
documents.listen(connection);
connection.listen();

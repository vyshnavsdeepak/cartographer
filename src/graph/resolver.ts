import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import type { Entity, ResolvedAnchor, CodeRef } from "#types";
import { scanFile } from "#anchors/scanner";
import { Graph } from "./graph.js";

/** Result of resolving an entity's code references */
export interface ResolvedEntity {
  entity: Entity;
  anchors: Map<string, ResolvedAnchor>;
  missing: string[];
}

/** Sync status between graph and code */
export interface SyncStatus {
  resolved: ResolvedEntity[];
  orphanedAnchors: ResolvedAnchor[];
}

/**
 * Resolver connects graph entities to their anchors in source code
 */
export class Resolver {
  private graph: Graph;
  private sourceRoots: string[];

  constructor(graph: Graph, sourceRoots: string[]) {
    this.graph = graph;
    this.sourceRoots = sourceRoots;
  }

  /**
   * Scan all source files and resolve entity code_refs to anchors
   */
  async resolve(): Promise<SyncStatus> {
    // Scan all source files for anchors
    const allAnchors = await this.scanAllSources();
    const anchorMap = new Map<string, ResolvedAnchor>();
    for (const anchor of allAnchors) {
      anchorMap.set(anchor.anchor, anchor);
    }

    // Track which anchors are used
    const usedAnchors = new Set<string>();

    // Resolve each entity's code_refs
    const resolved: ResolvedEntity[] = [];
    for (const entity of this.graph.getAllEntities()) {
      const result = this.resolveEntity(entity, anchorMap, usedAnchors);
      resolved.push(result);
    }

    // Find orphaned anchors (in code but not referenced by any entity)
    const orphanedAnchors: ResolvedAnchor[] = [];
    for (const anchor of allAnchors) {
      if (!usedAnchors.has(anchor.anchor)) {
        orphanedAnchors.push(anchor);
      }
    }

    return { resolved, orphanedAnchors };
  }

  /**
   * Resolve a single entity's code_refs
   */
  private resolveEntity(
    entity: Entity,
    anchorMap: Map<string, ResolvedAnchor>,
    usedAnchors: Set<string>
  ): ResolvedEntity {
    const anchors = new Map<string, ResolvedAnchor>();
    const missing: string[] = [];

    if (!entity.code_refs) {
      return { entity, anchors, missing };
    }

    // Check each code_ref category
    const refs = entity.code_refs;
    const checkRef = (ref: CodeRef | undefined, category: string) => {
      if (!ref) return;
      const resolved = anchorMap.get(ref.anchor);
      if (resolved) {
        anchors.set(category, resolved);
        usedAnchors.add(ref.anchor);
      } else {
        missing.push(ref.anchor);
      }
    };

    checkRef(refs.model, "model");
    checkRef(refs.schema, "schema");
    checkRef(refs.types, "types");
    checkRef(refs.validation, "validation");

    // Handle api array
    if (refs.api) {
      for (const [i, ref] of refs.api.entries()) {
        const resolved = anchorMap.get(ref.anchor);
        if (resolved) {
          anchors.set(`api.${i}`, resolved);
          usedAnchors.add(ref.anchor);
        } else {
          missing.push(ref.anchor);
        }
      }
    }

    return { entity, anchors, missing };
  }

  /**
   * Scan all source roots for anchor comments
   */
  private async scanAllSources(): Promise<ResolvedAnchor[]> {
    const anchors: ResolvedAnchor[] = [];

    for (const root of this.sourceRoots) {
      const files = await this.findSourceFiles(root);
      for (const file of files) {
        const fileAnchors = await scanFile(file);
        anchors.push(...fileAnchors);
      }
    }

    return anchors;
  }

  /**
   * Recursively find all source files in a directory
   */
  private async findSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry === "node_modules" || entry.startsWith(".")) {
          continue;
        }
        const subFiles = await this.findSourceFiles(fullPath);
        files.push(...subFiles);
      } else if (this.isSourceFile(entry)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Check if a file should be scanned for anchors
   */
  private isSourceFile(filename: string): boolean {
    const ext = extname(filename).toLowerCase();
    const sourceExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go"];
    return sourceExts.includes(ext);
  }
}

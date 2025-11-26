import { describe, it, expect } from "vitest";
import { scanFile, scanContent } from "#anchors/scanner";

describe("scanContent", () => {
  describe("anchor detection", () => {
    it("finds single anchor with // comment", () => {
      const content = `
// @graph:User.model
export class User {}
`;
      const anchors = scanContent(content);

      expect(anchors).toHaveLength(1);
      expect(anchors[0]?.anchor).toBe("@graph:User.model");
    });

    it("finds single anchor with # comment", () => {
      const content = `
# @graph:User.schema
CREATE TABLE users (
  id UUID PRIMARY KEY
);
`;
      const anchors = scanContent(content);

      expect(anchors).toHaveLength(1);
      expect(anchors[0]?.anchor).toBe("@graph:User.schema");
    });

    it("finds multiple anchors in same file", () => {
      const content = `
// @graph:User.model
export class User {}

// @graph:User.types
export interface UserDTO {}

// @graph:User.validation
function validate() {}
`;
      const anchors = scanContent(content);

      expect(anchors).toHaveLength(3);
      expect(anchors.map((a) => a.anchor)).toEqual([
        "@graph:User.model",
        "@graph:User.types",
        "@graph:User.validation",
      ]);
    });

    it("handles anchor with nested category", () => {
      const content = `
// @graph:User.api.create
export function createUser() {}
`;
      const anchors = scanContent(content);

      expect(anchors[0]?.anchor).toBe("@graph:User.api.create");
    });

    it("is case insensitive for prefix", () => {
      const content = `
// @GRAPH:User.model
export class User {}
`;
      const anchors = scanContent(content);

      expect(anchors).toHaveLength(1);
    });
  });

  describe("line numbers", () => {
    it("returns correct 1-indexed line number", () => {
      const content = `line 1
line 2
// @graph:User.model
line 4`;
      const anchors = scanContent(content);

      expect(anchors[0]?.line).toBe(3);
    });

    it("returns correct endLine for explicit end marker", () => {
      const content = `// @graph:User.model
export class User {
  id: string;
}
// @end:User.model
after`;
      const anchors = scanContent(content);

      expect(anchors[0]?.line).toBe(1);
      expect(anchors[0]?.endLine).toBe(5); // The @end line
    });

    it("returns correct endLine for implicit end (next anchor)", () => {
      const content = `// @graph:User.model
export class User {}
// @graph:User.types
export type User = {};`;
      const anchors = scanContent(content);

      expect(anchors[0]?.endLine).toBe(2); // Line before next anchor
      expect(anchors[1]?.line).toBe(3);
    });

    it("returns correct endLine for EOF", () => {
      const content = `// @graph:User.model
export class User {}
last line`;
      const anchors = scanContent(content);

      expect(anchors[0]?.endLine).toBe(3);
    });
  });

  describe("content extraction", () => {
    it("extracts content between anchor and end marker", () => {
      const content = `// @graph:User.model
export class User {
  id: string;
}
// @end:User.model`;
      const anchors = scanContent(content);

      expect(anchors[0]?.content).toBe(`export class User {
  id: string;
}`);
    });

    it("extracts content until next anchor", () => {
      const content = `// @graph:User.model
export class User {}
// @graph:User.types
export type X = {};`;
      const anchors = scanContent(content);

      expect(anchors[0]?.content).toBe("export class User {}");
    });

    it("extracts content until EOF when no end marker", () => {
      const content = `// @graph:User.model
export class User {}`;
      const anchors = scanContent(content);

      expect(anchors[0]?.content).toBe("export class User {}");
    });

    it("trims empty lines from content start", () => {
      const content = `// @graph:User.model

export class User {}`;
      const anchors = scanContent(content);

      expect(anchors[0]?.content).toBe("export class User {}");
    });

    it("trims empty lines from content end", () => {
      const content = `// @graph:User.model
export class User {}

// @end:User.model`;
      const anchors = scanContent(content);

      expect(anchors[0]?.content).toBe("export class User {}");
    });

    it("preserves internal empty lines", () => {
      const content = `// @graph:User.model
line1

line3
// @end:User.model`;
      const anchors = scanContent(content);

      expect(anchors[0]?.content).toBe(`line1

line3`);
    });

    it("excludes end marker from content", () => {
      const content = `// @graph:User.model
export class User {}
// @end:User.model`;
      const anchors = scanContent(content);

      expect(anchors[0]?.content).not.toContain("@end");
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty content", () => {
      const anchors = scanContent("");

      expect(anchors).toHaveLength(0);
    });

    it("returns empty array for content with no anchors", () => {
      const content = `
export class User {
  id: string;
}
`;
      const anchors = scanContent(content);

      expect(anchors).toHaveLength(0);
    });

    it("handles anchor on first line", () => {
      const content = `// @graph:User.model
export class User {}`;
      const anchors = scanContent(content);

      expect(anchors[0]?.line).toBe(1);
    });

    it("handles anchor on last line (empty content)", () => {
      const content = `some code
// @graph:User.model`;
      const anchors = scanContent(content);

      expect(anchors).toHaveLength(1);
      expect(anchors[0]?.content).toBe("");
    });

    it("handles consecutive anchors (no content between)", () => {
      const content = `// @graph:User.model
// @graph:User.types`;
      const anchors = scanContent(content);

      expect(anchors).toHaveLength(2);
      expect(anchors[0]?.content).toBe("");
    });

    it("handles whitespace before anchor prefix", () => {
      const content = `  // @graph:User.model
export class User {}`;
      const anchors = scanContent(content);

      expect(anchors).toHaveLength(1);
    });

    it("ignores anchor-like text not in comment", () => {
      const content = `
const x = "@graph:User.model"; // not an anchor
export class User {}
`;
      const anchors = scanContent(content);

      expect(anchors).toHaveLength(0);
    });

    it("handles mixed comment styles in same file", () => {
      const content = `// @graph:User.model
export class User {}
# @graph:User.schema
CREATE TABLE users ();`;
      const anchors = scanContent(content);

      expect(anchors).toHaveLength(2);
    });
  });

  describe("file path", () => {
    it("uses default path for inline content", () => {
      const anchors = scanContent("// @graph:User.model\ncode");

      expect(anchors[0]?.file).toBe("<inline>");
    });

    it("uses provided path", () => {
      const anchors = scanContent("// @graph:User.model\ncode", "/some/path.ts");

      expect(anchors[0]?.file).toBe("/some/path.ts");
    });
  });
});

describe("scanFile", () => {
  const FIXTURE_PATH = "./test/fixtures/sample-project/src/models/user.ts";

  it("scans real file and returns absolute path", async () => {
    const anchors = await scanFile(FIXTURE_PATH);

    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors[0]?.file).toMatch(/^\//); // absolute path
    expect(anchors[0]?.file).toContain("sample-project");
  });

  it("finds all anchors in fixture file", async () => {
    const anchors = await scanFile(FIXTURE_PATH);

    expect(anchors).toHaveLength(3);
    expect(anchors.map((a) => a.anchor)).toEqual([
      "@graph:User.model",
      "@graph:User.types",
      "@graph:User.validation",
    ]);
  });

  it("throws ENOENT for non-existent file", async () => {
    await expect(scanFile("./does-not-exist.ts")).rejects.toThrow("ENOENT");
  });
});

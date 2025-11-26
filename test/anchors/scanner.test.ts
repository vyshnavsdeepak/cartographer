import { describe, it, expect } from "vitest";
import { scanFile } from "#anchors/scanner";

const FIXTURE_PATH = "./test/fixtures/sample-project/src/models/user.ts";

describe("scanFile", () => {
  it("finds all anchors in a file", async () => {
    const anchors = await scanFile(FIXTURE_PATH);

    expect(anchors).toHaveLength(3);
    expect(anchors.map((a) => a.anchor)).toEqual([
      "@graph:User.model",
      "@graph:User.types",
      "@graph:User.validation",
    ]);
  });

  it("extracts correct line numbers", async () => {
    const anchors = await scanFile(FIXTURE_PATH);

    const modelAnchor = anchors.find((a) => a.anchor === "@graph:User.model");
    expect(modelAnchor?.line).toBe(1);
  });

  it("extracts content between anchor and end marker", async () => {
    const anchors = await scanFile(FIXTURE_PATH);

    const modelAnchor = anchors.find((a) => a.anchor === "@graph:User.model");
    expect(modelAnchor?.content).toContain("export class User");
    expect(modelAnchor?.content).toContain("status: UserStatus");
    expect(modelAnchor?.content).not.toContain("@end");
  });

  it("extracts content until next anchor when no end marker", async () => {
    const anchors = await scanFile(FIXTURE_PATH);

    // validation anchor has no @end marker, content goes to EOF
    const validationAnchor = anchors.find(
      (a) => a.anchor === "@graph:User.validation"
    );
    expect(validationAnchor?.content).toContain("validateEmail");
    expect(validationAnchor?.content).toContain('return email.includes("@")');
  });

  it("returns absolute file paths", async () => {
    const anchors = await scanFile(FIXTURE_PATH);

    expect(anchors[0]?.file).toMatch(/^\//); // starts with /
    expect(anchors[0]?.file).toContain("sample-project");
  });

  it("throws on non-existent file", async () => {
    await expect(scanFile("./does-not-exist.ts")).rejects.toThrow();
  });
});

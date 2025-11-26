import { describe, it, expect } from "vitest";
import { loadEntity } from "#graph/loader";

describe("loadEntity", () => {
  it("loads a valid entity from YAML", async () => {
    const entity = await loadEntity("./test/fixtures/sample-graph/entities/user.yaml");

    expect(entity.name).toBe("User");
    expect(entity.description).toBe("Application user account");
    expect(entity.fields).toHaveLength(4);
  });

  it("parses field types correctly", async () => {
    const entity = await loadEntity("./test/fixtures/sample-graph/entities/user.yaml");

    const idField = entity.fields.find((f) => f.name === "id");
    expect(idField?.type).toBe("uuid");
    expect(idField?.primary).toBe(true);

    const statusField = entity.fields.find((f) => f.name === "status");
    expect(statusField?.type).toBe("enum");
    expect(statusField?.values).toEqual(["active", "inactive", "suspended"]);
  });

  it("throws on missing required fields", async () => {
    await expect(
      loadEntity("./test/fixtures/sample-graph/entities/invalid.yaml")
    ).rejects.toThrow();
  });

  it("throws on non-existent file", async () => {
    await expect(loadEntity("./does-not-exist.yaml")).rejects.toThrow();
  });
});

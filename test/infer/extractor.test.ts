import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractEntities, scanForEntities } from "../../src/infer/extractor.js";

describe("Entity Extractor", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cartographer-extractor-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("extractEntities - TypeORM/MikroORM entities", () => {
    it("should extract entity with @Entity decorator", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(
        filePath,
        `@Entity()
export class User {
  @PrimaryColumn()
  id: string;

  @Column()
  email: string;
}`
      );

      const entities = await extractEntities(filePath);

      expect(entities).toHaveLength(1);
      expect(entities[0].name).toBe("User");
      expect(entities[0].sourceType).toBe("ORM entity");
      expect(entities[0].confidence).toBe(0.95);
      expect(entities[0].fields).toHaveLength(2);

      const idField = entities[0].fields.find((f) => f.name === "id");
      expect(idField?.isPrimary).toBe(true);
    });

    it("should extract relations from ORM decorators", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(
        filePath,
        `@Entity()
export class User {
  @PrimaryColumn()
  id: string;

  @OneToMany(() => Order, order => order.user)
  orders: Order[];
}`
      );

      const entities = await extractEntities(filePath);

      expect(entities).toHaveLength(1);
      expect(entities[0].relations).toHaveLength(1);
      expect(entities[0].relations[0]).toEqual({
        name: "orders",
        entity: "Order",
        type: "has_many",
      });
    });
  });

  describe("extractEntities - Plain classes", () => {
    it("should extract plain class with fields", async () => {
      const filePath = join(testDir, "product.ts");
      await writeFile(
        filePath,
        `export class Product {
  id: string;
  name: string;
  price: number;
}`
      );

      const entities = await extractEntities(filePath);

      expect(entities).toHaveLength(1);
      expect(entities[0].name).toBe("Product");
      expect(entities[0].sourceType).toBe("class");
      expect(entities[0].confidence).toBe(0.7);
      expect(entities[0].fields).toHaveLength(3);
    });

    it("should skip service/controller classes", async () => {
      const filePath = join(testDir, "user.service.ts");
      await writeFile(
        filePath,
        `export class UserService {
  private db: Database;
}`
      );

      const entities = await extractEntities(filePath);
      expect(entities).toHaveLength(0);
    });

    it("should skip classes without fields (methods only)", async () => {
      const filePath = join(testDir, "helper.ts");
      await writeFile(
        filePath,
        `export class Helper {
  static format(value: string): string {
    return value.trim();
  }
}`
      );

      const entities = await extractEntities(filePath);
      expect(entities).toHaveLength(0);
    });
  });

  describe("extractEntities - Interfaces", () => {
    it("should extract interface with fields", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(
        filePath,
        `export interface User {
  id: string;
  email: string;
  createdAt: Date;
}`
      );

      const entities = await extractEntities(filePath);

      expect(entities).toHaveLength(1);
      expect(entities[0].name).toBe("User");
      expect(entities[0].sourceType).toBe("interface");
      expect(entities[0].confidence).toBe(0.6);
      expect(entities[0].fields).toHaveLength(3);

      const createdAtField = entities[0].fields.find((f) => f.name === "createdAt");
      expect(createdAtField?.type).toBe("timestamp");
    });

    it("should skip Props/Config/Options interfaces", async () => {
      const filePath = join(testDir, "component.ts");
      await writeFile(
        filePath,
        `export interface ButtonProps {
  label: string;
  onClick: () => void;
}`
      );

      const entities = await extractEntities(filePath);
      expect(entities).toHaveLength(0);
    });

    it("should handle nullable fields", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(
        filePath,
        `export interface User {
  id: string;
  nickname?: string;
  avatar: string | null;
}`
      );

      const entities = await extractEntities(filePath);

      expect(entities).toHaveLength(1);
      const nicknameField = entities[0].fields.find((f) => f.name === "nickname");
      const avatarField = entities[0].fields.find((f) => f.name === "avatar");
      expect(nicknameField?.isNullable).toBe(true);
      expect(avatarField?.isNullable).toBe(true);
    });
  });

  describe("extractEntities - Zod schemas", () => {
    it("should extract Zod schema as entity", async () => {
      const filePath = join(testDir, "user.schema.ts");
      await writeFile(
        filePath,
        `export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  age: z.number(),
});`
      );

      const entities = await extractEntities(filePath);

      expect(entities).toHaveLength(1);
      expect(entities[0].name).toBe("User");
      expect(entities[0].sourceType).toBe("Zod schema");
      expect(entities[0].confidence).toBe(0.85);
      expect(entities[0].suggestedRefs.get("validation")).toBeDefined();
    });

    it("should handle optional Zod fields", async () => {
      const filePath = join(testDir, "user.schema.ts");
      await writeFile(
        filePath,
        `export const UserSchema = z.object({
  id: z.string(),
  nickname: z.string().optional(),
});`
      );

      const entities = await extractEntities(filePath);

      expect(entities).toHaveLength(1);
      const nicknameField = entities[0].fields.find((f) => f.name === "nickname");
      expect(nicknameField?.isNullable).toBe(true);
    });
  });

  describe("extractEntities - Drizzle tables", () => {
    it("should extract Drizzle pgTable definition", async () => {
      const filePath = join(testDir, "schema.ts");
      await writeFile(
        filePath,
        `export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at'),
});`
      );

      const entities = await extractEntities(filePath);

      expect(entities).toHaveLength(1);
      expect(entities[0].name).toBe("User");
      expect(entities[0].sourceType).toBe("Drizzle table");
      expect(entities[0].confidence).toBe(0.9);
      expect(entities[0].suggestedRefs.get("schema")).toBeDefined();
    });
  });

  describe("scanForEntities", () => {
    it("should scan multiple files and deduplicate by name", async () => {
      const modelFile = join(testDir, "user.model.ts");
      const typeFile = join(testDir, "user.types.ts");

      await writeFile(
        modelFile,
        `@Entity()
export class User {
  @PrimaryColumn()
  id: string;
}`
      );

      await writeFile(
        typeFile,
        `export interface User {
  id: string;
  email: string;
}`
      );

      const entities = await scanForEntities([modelFile, typeFile]);

      // Should deduplicate - higher confidence ORM entity wins
      expect(entities).toHaveLength(1);
      expect(entities[0].sourceType).toBe("ORM entity");
      // But should merge fields from interface
      expect(entities[0].fields.length).toBeGreaterThanOrEqual(1);
    });

    it("should skip non-TypeScript files", async () => {
      const jsFile = join(testDir, "user.js");
      await writeFile(jsFile, "class User {}");

      const entities = await scanForEntities([jsFile]);
      expect(entities).toHaveLength(0);
    });
  });

  describe("Type mapping", () => {
    it("should map TypeScript types correctly", async () => {
      const filePath = join(testDir, "types.ts");
      await writeFile(
        filePath,
        `export interface Entity {
  id: string;
  count: number;
  active: boolean;
  createdAt: Date;
}`
      );

      const entities = await extractEntities(filePath);
      const fields = entities[0].fields;

      expect(fields.find((f) => f.name === "id")?.type).toBe("string");
      expect(fields.find((f) => f.name === "count")?.type).toBe("integer");
      expect(fields.find((f) => f.name === "active")?.type).toBe("boolean");
      expect(fields.find((f) => f.name === "createdAt")?.type).toBe("timestamp");
    });
  });
});

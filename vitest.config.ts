import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "#types": path.resolve(__dirname, "./src/types/index.ts"),
      "#graph": path.resolve(__dirname, "./src/graph"),
    },
  },
});

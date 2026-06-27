import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts", "cli/main.ts"],
  format: ["esm"],
  clean: true,
});

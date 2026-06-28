import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts", "cli/main.ts", "eval/calibrate-demo.ts"],
  format: ["esm"],
  clean: true,
});

import { defineConfig } from "tsup";
export default defineConfig({
  entry: [
    "src/index.ts",
    "cli/main.ts",
    "eval/calibrate-demo.ts",
    "eval/fidelity-demo.ts",
    "scripts/refresh-census.ts",
  ],
  format: ["esm"],
  clean: true,
});

import { defineConfig } from "tsup";
export default defineConfig({
  entry: [
    "src/index.ts",
    "cli/main.ts",
    "eval/calibrate-demo.ts",
    "eval/fidelity-demo.ts",
    "eval/reliability-demo.ts",
    "eval/report-demo.ts",
    "eval/b2-live.ts",
    "eval/report-live.ts",
    "eval/narrative-audit.ts",
    "eval/narrative-ab.ts",
    "scripts/refresh-census.ts",
    "scripts/build-nemotron-pool.ts",
  ],
  format: ["esm"],
  clean: true,
  dts: { entry: "src/index.ts" }, // npm 소비자용 타입은 라이브러리 진입점만
});

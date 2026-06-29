import { describe, expect, test } from "vitest";
import { renderFidelityReport } from "./fidelity-report.js";
import type { FidelityReport } from "./fidelity.js";

const r: FidelityReport = {
  core: {
    name: "성×연령×지역",
    provenance: "matched",
    mae: 0.0001,
    tvd: 0.0002,
    maxError: { key: "남자|40~44세|수도권", expected: 0.1, actual: 0.1 },
  },
  conditional: [
    {
      name: "연령×혼인",
      provenance: "conditioned",
      mae: 0.0,
      tvd: 0.0,
      maxError: { key: "20~24세|미혼", expected: 0.9, actual: 0.9 },
    },
  ],
  matched: ["성", "연령", "지역"],
  conditioned: ["혼인"],
};

describe("renderFidelityReport", () => {
  test("제목·core·conditional·matched-vs-estimated 포함", () => {
    const md = renderFidelityReport("합성 인구 충실도", r);
    expect(md).toContain("# 합성 인구 충실도");
    expect(md).toContain("matched");
    expect(md).toContain("성×연령×지역");
    expect(md).toContain("연령×혼인");
    expect(md).toContain("혼인");
  });
  test("core 충실(mae 작음)이면 🟢", () => {
    const md = renderFidelityReport("t", r);
    expect(md).toContain("🟢");
  });
});

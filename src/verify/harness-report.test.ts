import { describe, expect, test } from "vitest";
import { renderHarnessReport } from "./harness-report.js";

describe("renderHarnessReport", () => {
  test("정상 점검 → ✅ 포함, 제목 포함", () => {
    const md = renderHarnessReport("점검", {
      selfConsistency: 0.95,
      modeCollapse: { meanDispersion: 0.6, collapsed: false },
      paraphraseStable: true,
      orderBiased: false,
    });
    expect(md).toContain("# 점검");
    expect(md).toContain("✅");
  });
  test("문제 발견 → ⚠️ 강조", () => {
    const md = renderHarnessReport("점검", {
      modeCollapse: { meanDispersion: 0.05, collapsed: true },
      orderBiased: true,
      drift: { regressed: true, directionAccuracyDelta: -0.3 },
    });
    expect(md).toContain("⚠️");
    expect(md.toLowerCase()).toContain("모드");
  });
});

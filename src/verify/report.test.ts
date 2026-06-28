import { describe, expect, test } from "vitest";
import type { StudyResult } from "../types.js";
import type { CalibrationReport } from "./calibrate.js";
import { renderMarkdownReport } from "./report.js";

const result: StudyResult = {
  responses: [],
  signal: "split",
  dispersion: 0.91,
  bySegment: {
    age: {
      "20대": { signal: "consensus", breakdown: { 쓴다: 10 } },
      "40대": { signal: "consensus", breakdown: { 안쓴다: 10 } },
    },
  },
};
const calibration: CalibrationReport = {
  cases: [
    {
      id: "milkkit",
      predictedShare: { 쓴다: 0.5, 안쓴다: 0.5 },
      rankCorrelation: 1,
      shareMAE: 0.08,
      directionHit: true,
    },
  ],
  meanRankCorrelation: 0.74,
  shareMAE: 0.08,
  directionAccuracy: 1,
};

describe("renderMarkdownReport", () => {
  test("제목과 전체 신호를 포함한다", () => {
    const md = renderMarkdownReport({ title: "밀키트 컨셉", result });
    expect(md).toContain("# 밀키트 컨셉");
    expect(md).toContain("🔴");
    expect(md).toContain("0.91");
  });
  test("세그먼트 표와 분열 강조를 포함한다", () => {
    const md = renderMarkdownReport({ title: "t", result });
    expect(md).toContain("age");
    expect(md).toContain("20대");
  });
  test("캘리브레이션이 있으면 fidelity 숫자를 포함한다", () => {
    const md = renderMarkdownReport({ title: "t", result, calibration });
    expect(md).toContain("0.74"); // mean rank correlation
    expect(md).toMatch(/방향 정확도|directionAccuracy|100%/);
  });
  test("result도 calibration도 없으면 안내 문구", () => {
    const md = renderMarkdownReport({ title: "t" });
    expect(md).toContain("# t");
    expect(md.length).toBeGreaterThan(0);
  });
});

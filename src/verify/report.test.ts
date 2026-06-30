import { describe, expect, test } from "vitest";
import type { ReliabilityCard } from "../assess/reliability.js";
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
  test("reliability 카드가 주어지면 리포트에 신뢰성 섹션이 결합된다", () => {
    const card: ReliabilityCard = {
      composition: null,
      attributes: [{ dim: "연령", provenance: "matched", confidence: "high" }],
      responseConsistency: {
        status: "not-measured",
        reason: "키 필요(묶음 B)",
      },
      guardrails: ["synthetic panel response — 실제 예측 아님"],
      missingAxes: [],
    };
    const md = renderMarkdownReport({ title: "T", reliability: card });
    expect(md).toContain("## 신뢰성 카드");
    expect(md).toContain("synthetic panel response");
  });
});

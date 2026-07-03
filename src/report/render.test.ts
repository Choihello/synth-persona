import { describe, expect, it } from "vitest";
import type { StudyResult } from "../types.js";
import { generateFounderInsightReport } from "./generate.js";
import { HELD_CAP, renderFounderInsightReport } from "./render.js";

// 세그먼트 다수를 가진 StudyResult 픽스처 (판단 보류 cap 테스트용)
function bigResult(): StudyResult {
  const responses = [];
  // 연령 15구간 × 2명(소표본) → observedButHeld 15개 생성
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 2; j++) {
      responses.push({
        persona: {
          id: `p${i}-${j}`,
          attrs: { 연령: `구간${i}` },
          weight: 1,
        },
        answer: "쓴다",
        choice: "쓴다",
      });
    }
  }
  return {
    responses,
    signal: "consensus" as const,
    dispersion: 0,
    bySegment: { 연령: {} },
  };
}

describe("renderFounderInsightReport — 코어 섹션", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
    choices: ["쓴다", "안쓴다"],
  });
  const md = renderFounderInsightReport(report);

  it("상단과 하단에 synthetic panel disclaimer가 있다", () => {
    const first = md.indexOf("synthetic panel");
    const last = md.lastIndexOf("synthetic panel");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(last).toBeGreaterThan(first);
  });
  it("코어 섹션 헤더가 존재한다", () => {
    for (const h of [
      "## 한 줄 요약",
      "## 전체 신호",
      "## 기회 세그먼트",
      "## 저항 세그먼트",
      "## 관심을 끄는 이유 / 거부 이유 (추정)",
      "## 위험한 가정",
      "## 신뢰도 카드",
    ]) {
      expect(md).toContain(h);
    }
  });
  it("판단 보류 세그먼트는 HELD_CAP개까지만 렌더하고 '외 N개'로 요약한다", () => {
    expect(report.observedButHeld.length).toBe(15);
    expect(md).toContain(`외 ${15 - HELD_CAP}개 (판단 보류)`);
  });
});

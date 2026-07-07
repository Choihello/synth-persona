import type { Response, StudyResult } from "../types.js";

/**
 * 세그먼트 다수 픽스처 — 연령 15구간 × 2명 = 30 페르소나, 전원 "쓴다"(각 1응답).
 * 판단 보류 cap·표본 표기 테스트용. render.test·generate.test 공유(중복 제거).
 */
export function bigResult(): StudyResult {
  const responses: Response[] = [];
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 2; j++) {
      responses.push({
        persona: { id: `p${i}-${j}`, attrs: { 연령: `구간${i}` }, weight: 1 },
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

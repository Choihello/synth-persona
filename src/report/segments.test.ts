import { describe, expect, test } from "vitest";
import type { Response, StudyResult } from "../types.js";
import { rankSegments } from "./segments.js";

function make(
  pos: number,
  neg: number,
  dim = "연령",
  val = "30대",
): Response[] {
  const out: Response[] = [];
  for (let i = 0; i < pos; i++)
    out.push({
      persona: { id: `p${dim}${val}${i}`, attrs: { [dim]: val }, weight: 1 },
      answer: "쓴다",
      choice: "쓴다",
    });
  for (let i = 0; i < neg; i++)
    out.push({
      persona: { id: `n${dim}${val}${i}`, attrs: { [dim]: val }, weight: 1 },
      answer: "안쓴다",
      choice: "안쓴다",
    });
  return out;
}
function study(responses: Response[]): StudyResult {
  return { responses, signal: "split", dispersion: 1, bySegment: {} };
}

describe("rankSegments", () => {
  test("기준선보다 높은 큰 세그먼트는 opportunity, 낮으면 resistance", () => {
    const responses = [
      ...make(9, 1, "연령", "30대"),
      ...make(1, 9, "연령", "60대"),
    ];
    const { opportunity, resistance, globalPositiveRatio } = rankSegments(
      study(responses),
      "쓴다",
      8,
    );
    expect(globalPositiveRatio).toBeCloseTo(0.5, 4);
    expect(opportunity[0].segmentLabel).toBe("연령=30대");
    expect(resistance[0].segmentLabel).toBe("연령=60대");
  });

  test("sampleCount < minN 세그먼트는 observedButHeld로 (랭킹 제외)", () => {
    const responses = [
      ...make(9, 1, "연령", "30대"),
      ...make(3, 0, "연령", "20대"),
    ];
    const { opportunity, observedButHeld } = rankSegments(
      study(responses),
      "쓴다",
      8,
    );
    expect(opportunity.some((s) => s.segmentLabel === "연령=20대")).toBe(false);
    const held = observedButHeld.find((s) => s.segmentLabel === "연령=20대");
    expect(held).toBeDefined();
    expect(held?.caveats.some((c) => c.includes("판단 보류"))).toBe(true);
  });

  test("기준선보다 아주 조금 높은 큰 세그먼트가 과대평가되지 않는다", () => {
    const responses = [
      ...make(52, 48, "그룹", "A"),
      ...make(16, 4, "그룹", "B"),
    ];
    const { opportunity } = rankSegments(study(responses), "쓴다", 8);
    expect(opportunity[0].segmentLabel).toBe("그룹=B");
  });

  test("sampleWeightShare는 세그먼트 weight 합 / 전체 weight 합", () => {
    const responses = [
      ...make(8, 0, "연령", "30대"), // 8명, weight 8
      ...make(0, 8, "연령", "60대"), // 8명, weight 8
    ];
    const { opportunity, resistance } = rankSegments(
      study(responses),
      "쓴다",
      8,
    );
    const all = [...opportunity, ...resistance];
    for (const s of all) expect(s.sampleWeightShare).toBeCloseTo(0.5, 4);
  });
});

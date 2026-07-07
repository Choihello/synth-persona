import { describe, expect, test } from "vitest";
import type { Response, StudyResult } from "../types.js";
import {
  GATE_Z,
  rankSegments,
  twoProportionZ,
  wilsonInterval,
} from "./segments.js";

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
function makeRepeats(
  personas: Array<{
    id: string;
    attrs: Record<string, string>;
    picks: string[];
  }>,
): Response[] {
  return personas.flatMap((p) =>
    p.picks.map((choice) => ({
      persona: { id: p.id, attrs: p.attrs, weight: 1 },
      answer: choice,
      choice,
    })),
  );
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

  test("동률 세그먼트는 withinNoise로 (atBaseline 대체)", () => {
    const responses = [
      ...make(5, 5, "연령", "30대"),
      ...make(5, 5, "연령", "60대"),
    ];
    const r = rankSegments(study(responses), "쓴다", 8);
    expect(r.opportunity).toHaveLength(0);
    expect(r.resistance).toHaveLength(0);
    expect(r.withinNoise.map((s) => s.segmentLabel).sort()).toEqual([
      "연령=30대",
      "연령=60대",
    ]);
  });

  test("효과 10%p 미만 차이는 유의해 보여도 withinNoise", () => {
    // 30대 52.5% vs 여집합(60대) 47.5% — diff 5%p < 10%p
    const responses = [
      ...make(21, 19, "연령", "30대"),
      ...make(19, 21, "연령", "60대"),
    ];
    const r = rankSegments(study(responses), "쓴다", 8);
    expect(r.opportunity).toHaveLength(0);
    expect(r.withinNoise.some((s) => s.segmentLabel === "연령=30대")).toBe(
      true,
    );
  });

  test("효과는 크지만 표본이 작으면 weakSignals (우연일 수 있음 caveat)", () => {
    // 세그먼트 nP=3 전원 긍정 vs 전체 다수 긍정 — CI가 평균 포함
    const responses = [
      ...make(3, 0, "혼인", "사별·이혼"), // nP=3, ratio 1.0
      ...make(23, 4, "혼인", "기혼"), // 전체 global ≈ 26/30 = 0.867
    ];
    const r = rankSegments(study(responses), "쓴다", 3);
    expect(r.opportunity.some((s) => s.segmentLabel === "혼인=사별·이혼")).toBe(
      false,
    );
    const weak = r.weakSignals.find((s) => s.segmentLabel === "혼인=사별·이혼");
    expect(weak).toBeDefined();
    expect(weak?.personaCount).toBe(3);
    expect(weak?.caveats.some((c) => c.includes("우연일 수 있음"))).toBe(true);
  });

  test("표본이 충분하고 효과가 크면 뚜렷한 신호로 승격", () => {
    // 30대 15/15 긍정 vs 60대 3/15 — global 0.6, 세그 1.0: lo≈0.85 > 0.6
    const responses = [
      ...make(15, 0, "연령", "30대"),
      ...make(3, 12, "연령", "60대"),
    ];
    const r = rankSegments(study(responses), "쓴다", 8);
    expect(r.opportunity[0].segmentLabel).toBe("연령=30대");
    expect(r.resistance[0].segmentLabel).toBe("연령=60대");
    expect(r.opportunity[0].personaCount).toBe(15);
  });

  test("반복 응답은 페르소나 단위로 보정된다 (과반 투표, 동률은 비긍정)", () => {
    // 페르소나 6명 × 3회. 세그A 3명은 3/3 긍정, 세그B 3명 중 1명만 2/3 긍정
    const responses = makeRepeats([
      { id: "a1", attrs: { 연령: "30대" }, picks: ["쓴다", "쓴다", "쓴다"] },
      { id: "a2", attrs: { 연령: "30대" }, picks: ["쓴다", "쓴다", "쓴다"] },
      { id: "a3", attrs: { 연령: "30대" }, picks: ["쓴다", "쓴다", "쓴다"] },
      {
        id: "b1",
        attrs: { 연령: "60대" },
        picks: ["안쓴다", "안쓴다", "안쓴다"],
      },
      {
        id: "b2",
        attrs: { 연령: "60대" },
        picks: ["안쓴다", "안쓴다", "안쓴다"],
      },
      { id: "b3", attrs: { 연령: "60대" }, picks: ["쓴다", "쓴다", "안쓴다"] },
    ]);
    const r = rankSegments(study(responses), "쓴다", 3);
    // 페르소나 단위: 30대 nP=3 ratio 1.0, 여집합(60대) 1/3=0.333 (b3만 과반 긍정)
    // — diff 0.67, 여집합이 세그 CI [0.53,1] 밖 → 승격 (여집합 비교 semantics)
    const seg30 = r.opportunity.find((s) => s.segmentLabel === "연령=30대");
    expect(seg30).toBeDefined();
    expect(seg30?.personaCount).toBe(3);
    // 표시용 수치는 응답 단위 그대로: 9응답 전부 긍정
    expect(seg30?.sampleCount).toBe(9);
    expect(seg30?.positiveRatio).toBeCloseTo(1.0, 4);
  });

  test("반복 동률 페르소나는 비긍정 (보수적) — 분류가 달라진다", () => {
    const responses = makeRepeats([
      { id: "a1", attrs: { 지역: "A" }, picks: ["쓴다", "안쓴다"] }, // 동률 → 비긍정
      { id: "a2", attrs: { 지역: "A" }, picks: ["쓴다", "쓴다"] },
      { id: "b1", attrs: { 지역: "B" }, picks: ["쓴다", "쓴다"] },
      { id: "b2", attrs: { 지역: "B" }, picks: ["쓴다", "쓴다"] },
    ]);
    const r = rankSegments(study(responses), "쓴다", 1);
    // 동률이 비긍정이므로 지역=A ratio 0.5 vs 여집합(B) 1.0 → diff 0.5.
    // 2표본 z-검정: n=2 vs n=2로 표본이 극소 → z≈1.15 < 1.645라 승격 못 하고
    // weakSignals로. (동률을 긍정으로 세면 diff 0이 되어 withinNoise — 판별 픽스처)
    expect(r.weakSignals.some((s) => s.segmentLabel === "지역=A")).toBe(true);
  });

  test("여집합이 작으면 큰 세그먼트도 승격 못 함 (2표본 검정이 여집합 불확실성 반영)", () => {
    // 세그 A 18/20=0.9(CI 좁음) vs 여집합 B 4/6=0.667. diff 0.233 >= 10%p.
    // 구 로직(여집합을 오차 없는 점으로 취급): 0.667이 A의 좁은 Wilson CI 밖 → 승격.
    // 신 로직(2표본 z): 여집합 n=6이 작아 SE가 커져 z≈1.39 < 1.645 → weakSignals.
    const responses = [...make(18, 2, "지역", "A"), ...make(4, 2, "지역", "B")];
    const r = rankSegments(study(responses), "쓴다", 5);
    expect(r.opportunity.some((s) => s.segmentLabel === "지역=A")).toBe(false);
    expect(r.weakSignals.some((s) => s.segmentLabel === "지역=A")).toBe(true);
  });

  test("twoProportionZ: pooled 2표본 비율 검정, 표본 0이면 0", () => {
    expect(twoProportionZ(0.9, 0, 0.5, 10)).toBe(0);
    expect(twoProportionZ(0.9, 10, 0.5, 0)).toBe(0);
    // p1=1.0 n1=15, p2=0.2 n2=15: pooled 0.6, SE 0.1789, z≈4.47
    expect(twoProportionZ(1.0, 15, 0.2, 15)).toBeCloseTo(4.47, 1);
    // 동일 비율이면 z=0 (SE 0 방어 포함)
    expect(twoProportionZ(0.5, 8, 0.5, 8)).toBe(0);
  });

  test("여집합 비교 — 큰 세그먼트의 자기포함 희석을 제거한다", () => {
    // 지역=A 24/30=0.8, 지역=B 4/10=0.4. 구(전체 0.7) 비교면 A diff 10%p·CI 포함 → weak.
    // 여집합 비교면 A 0.8 vs B 0.4 — diff 40%p, B가 A의 CI 밖 → 승격돼야 한다.
    const responses = [...make(24, 6, "지역", "A"), ...make(4, 6, "지역", "B")];
    const r = rankSegments(study(responses), "쓴다", 8);
    expect(r.opportunity.some((s) => s.segmentLabel === "지역=A")).toBe(true);
    expect(r.resistance.some((s) => s.segmentLabel === "지역=B")).toBe(true);
  });

  test("세그먼트가 전체와 같으면 대조군이 없어 withinNoise", () => {
    const responses = make(12, 3, "성", "여자");
    const r = rankSegments(study(responses), "쓴다", 8);
    expect(r.opportunity).toHaveLength(0);
    expect(r.resistance).toHaveLength(0);
    expect(r.withinNoise.some((s) => s.segmentLabel === "성=여자")).toBe(true);
  });

  test("wilsonInterval 경계: n=0은 [0,1], p=1 n=15 z=1.645 lo≈0.847", () => {
    expect(wilsonInterval(0.5, 0, GATE_Z)).toEqual([0, 1]);
    const [lo, hi] = wilsonInterval(1.0, 15, GATE_Z);
    expect(lo).toBeCloseTo(0.847, 2);
    expect(hi).toBeCloseTo(1.0, 4);
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

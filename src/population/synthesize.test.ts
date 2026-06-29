import { describe, expect, test } from "vitest";
import type { Snapshot } from "./schema.js";
import { conditionalProbs, synthesizePopulation } from "./synthesize.js";

const snap: Snapshot = {
  meta: {
    year: 2024,
    geographyLevel: "권역",
    generatedAt: "x",
    sources: [],
    ageBins: ["15세미만", "20~24세", "40~44세"],
    weightUnit: "person_count",
  },
  core: {
    dims: ["성", "연령", "지역"],
    categories: {
      성: ["남자", "여자"],
      연령: ["15세미만", "20~24세", "40~44세"],
      지역: ["수도권", "비수도권"],
    },
    // row-major: 성(2)×연령(3)×지역(2) = 12 cells
    counts: [
      10,
      10,
      100,
      50,
      80,
      40, // 남자: 15미만 수/비, 20-24 수/비, 40-44 수/비
      10,
      10,
      120,
      60,
      90,
      45, // 여자
    ],
  },
  conditional: [
    {
      given: "연령",
      var: "혼인",
      frame: "individual",
      universe: "15세이상",
      givenKeys: ["20~24세", "40~44세"],
      varKeys: ["미혼", "기혼"],
      matrix: [
        [90, 10],
        [30, 70],
      ],
    },
    {
      given: "연령",
      var: "가구원수",
      frame: "householder",
      universe: "일반가구",
      bridge: "householder_age_as_proxy",
      givenKeys: ["20~24세", "40~44세"],
      varKeys: ["가구원수 1명", "가구원수 4명"],
      matrix: [
        [80, 20],
        [25, 75],
      ],
    },
  ],
};

describe("synthesize", () => {
  test("conditionalProbs: suppressed(null) 제외 정규화", () => {
    expect(conditionalProbs([3, 1])).toEqual([0.75, 0.25]);
    expect(conditionalProbs([3, null])).toEqual([1, 0]); // null 제외 → 3/3
  });

  test("응답자 universe 15세+: 15세미만 코어는 제외된다", () => {
    const pop = synthesizePopulation(snap);
    expect(pop.every((p) => p.attrs.연령 !== "15세미만")).toBe(true);
  });

  test("성×연령×지역은 matched, 혼인/가구원수는 conditioned + bridge flag", () => {
    const pop = synthesizePopulation(snap);
    const p = pop[0];
    expect(p.provenance?.성).toBe("matched");
    expect(p.provenance?.혼인).toBe("conditioned");
    expect(p.provenance?.가구원수).toBe("conditioned");
    expect(p.flags).toContain("bridge:householder_age_as_proxy");
  });

  test("weight 합이 보존된다(15세+ core 총합)", () => {
    const pop = synthesizePopulation(snap);
    const total = pop.reduce((s, p) => s + p.weight, 0);
    // 15세+ core 합 = 전체(625) - 15세미만(40) = 585 (조건부 부착은 weight 보존)
    expect(total).toBeCloseTo(585, 4);
  });

  test("연령-혼인 상관 보존: 20~24세는 미혼>기혼, 40~44세는 기혼>미혼", () => {
    const pop = synthesizePopulation(snap);
    const w = (age: string, m: string) =>
      pop
        .filter((p) => p.attrs.연령 === age && p.attrs.혼인 === m)
        .reduce((s, p) => s + p.weight, 0);
    expect(w("20~24세", "미혼")).toBeGreaterThan(w("20~24세", "기혼"));
    expect(w("40~44세", "기혼")).toBeGreaterThan(w("40~44세", "미혼"));
  });
});

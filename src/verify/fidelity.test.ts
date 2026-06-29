import { describe, expect, test } from "vitest";
import type { Snapshot } from "../population/schema.js";
import { synthesizePopulation } from "../population/synthesize.js";
import { populationFidelity } from "./fidelity.js";

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
    counts: [10, 10, 100, 50, 80, 40, 10, 10, 120, 60, 90, 45],
  },
  conditional: [
    {
      given: "연령",
      var: "혼인",
      frame: "individual",
      universe: "15+",
      givenKeys: ["20~24세", "40~44세"],
      varKeys: ["미혼", "기혼"],
      matrix: [
        [90, 10],
        [30, 70],
      ],
    },
  ],
};

describe("populationFidelity", () => {
  test("합성→재집계가 원본과 일치(자기일관성): core·conditional MAE/TVD ≈ 0", () => {
    const pop = synthesizePopulation(snap);
    const r = populationFidelity(pop, snap);
    expect(r.core.mae).toBeCloseTo(0, 6);
    expect(r.core.tvd).toBeCloseTo(0, 6);
    expect(r.conditional[0].mae).toBeCloseTo(0, 6);
  });
  test("matched/conditioned 변수를 분리 표기한다", () => {
    const r = populationFidelity(synthesizePopulation(snap), snap);
    expect(r.matched).toEqual(["성", "연령", "지역"]);
    expect(r.conditioned).toEqual(["혼인"]);
    expect(r.core.provenance).toBe("matched");
    expect(r.conditional[0].provenance).toBe("conditioned");
  });
  test("불일치를 감지한다: 가중치 왜곡 시 core MAE>0", () => {
    const pop = synthesizePopulation(snap).map((p) => ({ ...p }));
    pop[0].weight *= 1000; // 한 셀 왜곡
    const r = populationFidelity(pop, snap);
    expect(r.core.mae).toBeGreaterThan(0);
  });
});

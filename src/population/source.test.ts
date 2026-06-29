import { describe, expect, test } from "vitest";
import type { Persona } from "../types.js";
import type { Snapshot } from "./schema.js";
import { CensusPopulation, sampleForSimulation } from "./source.js";

const personas: Persona[] = [
  { id: "a", attrs: { x: "A" }, weight: 1 },
  { id: "b", attrs: { x: "B" }, weight: 99 },
];

describe("sampleForSimulation", () => {
  test("같은 시드는 같은 결과(결정적)", () => {
    const s1 = sampleForSimulation(personas, 20, 7);
    const s2 = sampleForSimulation(personas, 20, 7);
    expect(s1.map((p) => p.attrs.x)).toEqual(s2.map((p) => p.attrs.x));
  });
  test("weight 비례: 무거운 쪽이 압도적으로 많이 뽑힘", () => {
    const s = sampleForSimulation(personas, 200, 1);
    const b = s.filter((p) => p.attrs.x === "B").length;
    expect(b).toBeGreaterThan(150); // 99% 가중
  });
});

describe("CensusPopulation", () => {
  test("스냅샷에서 population을 생성한다", async () => {
    const snap: Snapshot = {
      meta: {
        year: 2024,
        geographyLevel: "권역",
        generatedAt: "x",
        sources: [],
        ageBins: ["20~24세"],
        weightUnit: "person_count",
      },
      core: {
        dims: ["성", "연령", "지역"],
        categories: { 성: ["남자"], 연령: ["20~24세"], 지역: ["수도권"] },
        counts: [100],
      },
      conditional: [],
    };
    const pop = await new CensusPopulation(snap).population();
    expect(pop.length).toBeGreaterThan(0);
    expect(pop[0].weight).toBe(100);
  });
});

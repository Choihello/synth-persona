import { describe, expect, test } from "vitest";
import type { JointDistribution } from "../types.js";
import { makeRng, samplePersonas } from "./sample.js";

const joint = (): JointDistribution => ({
  dimensions: [
    { name: "age", categories: ["20s", "40s"] },
    { name: "hh", categories: ["1", "4+"] },
  ],
  // 20s-1인 0.5, 20s-4+ 0.0, 40s-1인 0.0, 40s-4+ 0.5  (강한 상관)
  cells: new Float64Array([0.5, 0.0, 0.0, 0.5]),
});

describe("samplePersonas", () => {
  test("같은 시드는 같은 결과(결정적)", () => {
    const a = samplePersonas(joint(), 20, 123);
    const b = samplePersonas(joint(), 20, 123);
    expect(a).toEqual(b);
  });

  test("페르소나 attrs는 차원명 키를 갖는다", () => {
    const [p] = samplePersonas(joint(), 1, 1);
    expect(Object.keys(p.attrs).sort()).toEqual(["age", "hh"]);
    expect(p.id).toBeTruthy();
  });

  test("가중치 0인 조합은 절대 나오지 않는다(상관 보존)", () => {
    const ps = samplePersonas(joint(), 200, 7);
    const bad = ps.filter(
      (p) =>
        (p.attrs.age === "20s" && p.attrs.hh === "4+") ||
        (p.attrs.age === "40s" && p.attrs.hh === "1"),
    );
    expect(bad.length).toBe(0);
  });
});

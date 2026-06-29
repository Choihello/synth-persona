import { describe, expect, test } from "vitest";
import { modeCollapseFlag, positivitySkew, selfConsistency } from "./probes.js";

describe("probes", () => {
  test("selfConsistency: 최빈답 비율 평균", () => {
    // persona1: A,A,B → 2/3 ; persona2: X,X,X → 1
    expect(
      selfConsistency([
        ["A", "A", "B"],
        ["X", "X", "X"],
      ]),
    ).toBeCloseTo(5 / 6, 6);
  });
  test("selfConsistency: 빈 입력 → 1", () => {
    expect(selfConsistency([])).toBe(1);
  });
  test("selfConsistency: 빈 내부 응답 → 1", () => {
    expect(selfConsistency([[]])).toBe(1);
  });
  test("modeCollapseFlag: 전원 동일 응답이면 collapsed", () => {
    const r = modeCollapseFlag([{ A: 10 }, { B: 10 }]);
    expect(r.meanDispersion).toBeCloseTo(0, 6);
    expect(r.collapsed).toBe(true);
  });
  test("modeCollapseFlag: 갈린 응답이면 collapsed=false", () => {
    const r = modeCollapseFlag([
      { A: 5, B: 5 },
      { X: 5, Y: 5 },
    ]);
    expect(r.meanDispersion).toBeCloseTo(1, 6);
    expect(r.collapsed).toBe(false);
  });
  test("positivitySkew: 전원 긍정 → 1, 우연(균등) → 0", () => {
    expect(positivitySkew({ yes: 10, no: 0 }, "yes")).toBeCloseTo(1, 6);
    expect(positivitySkew({ yes: 5, no: 5 }, "yes")).toBeCloseTo(0, 6);
  });
});

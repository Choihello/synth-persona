import { describe, expect, test } from "vitest";
import type { StudyResult } from "../types.js";
import type { CalibrationReport } from "./calibrate.js";
import { costBudgetCheck, determinismGate, driftDiff } from "./governance.js";

const mk = (dispersion: number): StudyResult => ({
  responses: [],
  signal: "split",
  dispersion,
  bySegment: { age: { "20대": { signal: "consensus", breakdown: { A: 5 } } } },
});

describe("governance", () => {
  test("determinismGate: 동일 구조 → true, 다르면 false", () => {
    expect(determinismGate(mk(0.9), mk(0.9))).toBe(true);
    expect(determinismGate(mk(0.9), mk(0.8))).toBe(false);
  });
  test("costBudgetCheck", () => {
    expect(
      costBudgetCheck({ tokens: 100, ms: 500 }, { maxTokens: 200, maxMs: 1000 })
        .withinBudget,
    ).toBe(true);
    const over = costBudgetCheck(
      { tokens: 300, ms: 500 },
      { maxTokens: 200, maxMs: 1000 },
    );
    expect(over.withinBudget).toBe(false);
    expect(over.tokenOver).toBe(true);
    expect(over.latencyOver).toBe(false);
  });
  test("driftDiff: fidelity 하락 → regressed", () => {
    const prev: CalibrationReport = {
      cases: [],
      meanRankCorrelation: 0.8,
      shareMAE: 0.1,
      directionAccuracy: 0.9,
    };
    const curr: CalibrationReport = {
      cases: [],
      meanRankCorrelation: 0.5,
      shareMAE: 0.2,
      directionAccuracy: 0.6,
    };
    const d = driftDiff(prev, curr);
    expect(d.directionAccuracyDelta).toBeCloseTo(-0.3, 6);
    expect(d.regressed).toBe(true);
  });
  test("driftDiff: 안정 → regressed=false", () => {
    const r: CalibrationReport = {
      cases: [],
      meanRankCorrelation: 0.8,
      shareMAE: 0.1,
      directionAccuracy: 0.9,
    };
    expect(driftDiff(r, r).regressed).toBe(false);
  });
});

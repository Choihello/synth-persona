import { describe, expect, test } from "vitest";
import { type GroundTruthCase, backtest, topChoice } from "./calibrate.js";

const cases: GroundTruthCase[] = [
  { id: "a", question: "q1", choices: ["X", "Y"], actualShare: { X: 0.4, Y: 0.6 } },
  { id: "b", question: "q2", choices: ["P", "Q"], actualShare: { P: 0.7, Q: 0.3 } },
];

describe("calibrate", () => {
  test("topChoice는 최대 점유 선택지", () => {
    expect(topChoice({ X: 0.4, Y: 0.6 })).toBe("Y");
  });

  test("완벽 예측 runner → 방향정확도 1, MAE 0", async () => {
    const runner = async (c: GroundTruthCase) => c.actualShare;
    const r = await backtest(cases, runner);
    expect(r.directionAccuracy).toBeCloseTo(1, 6);
    expect(r.shareMAE).toBeCloseTo(0, 6);
    expect(r.cases).toHaveLength(2);
  });

  test("방향 틀린 runner → 방향정확도 0", async () => {
    // 점유를 뒤집어 top을 반대로
    const runner = async (c: GroundTruthCase) => {
      const keys = Object.keys(c.actualShare);
      const vals = keys.map((k) => c.actualShare[k]).reverse();
      return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
    };
    const r = await backtest(cases, runner);
    expect(r.directionAccuracy).toBeCloseTo(0, 6);
  });
});

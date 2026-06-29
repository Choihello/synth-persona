import { describe, expect, test } from "vitest";
import {
  brierScore,
  intervalCoverage,
  meanAbsoluteError,
  smoothedKL,
  spearman,
  totalVariationDistance,
} from "./scoring.js";

describe("scoring", () => {
  test("spearman: 완전 일치 순위 → 1", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 6);
  });
  test("spearman: 완전 역순 → -1", () => {
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 6);
  });
  test("spearman: 길이<2 또는 분산0 → 0", () => {
    expect(spearman([1], [1])).toBe(0);
    expect(spearman([5, 5, 5], [1, 2, 3])).toBe(0);
  });
  test("meanAbsoluteError", () => {
    expect(meanAbsoluteError([0.5, 0.2], [0.4, 0.4])).toBeCloseTo(0.15, 6);
  });
  test("brierScore: 완벽 예측 → 0, 최악 → 1", () => {
    expect(brierScore([1, 0], [1, 0])).toBeCloseTo(0, 6);
    expect(brierScore([0, 1], [1, 0])).toBeCloseTo(1, 6);
  });
  test("intervalCoverage", () => {
    expect(
      intervalCoverage(
        [
          [0, 1],
          [0, 1],
          [2, 3],
        ],
        [0.5, 5, 2.5],
      ),
    ).toBeCloseTo(2 / 3, 6);
  });

  test("totalVariationDistance: 동일=0, 서로소=1", () => {
    expect(totalVariationDistance([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(0, 6);
    expect(totalVariationDistance([1, 0], [0, 1])).toBeCloseTo(1, 6);
  });
  test("smoothedKL: 동일 분포 ≈ 0, 0셀에도 유한", () => {
    expect(smoothedKL([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(0, 6);
    expect(Number.isFinite(smoothedKL([1, 0], [0, 1]))).toBe(true);
  });
});

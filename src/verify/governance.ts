import type { StudyResult } from "../types.js";
import type { CalibrationReport } from "./calibrate.js";

export function determinismGate(a: StudyResult, b: StudyResult): boolean {
  const project = (r: StudyResult) =>
    JSON.stringify({
      signal: r.signal,
      dispersion: r.dispersion,
      bySegment: r.bySegment,
    });
  return project(a) === project(b);
}

export interface Usage {
  tokens: number;
  ms: number;
}

export interface Budget {
  maxTokens: number;
  maxMs: number;
}

export function costBudgetCheck(
  usage: Usage,
  budget: Budget,
): { withinBudget: boolean; tokenOver: boolean; latencyOver: boolean } {
  const tokenOver = usage.tokens > budget.maxTokens;
  const latencyOver = usage.ms > budget.maxMs;
  return { withinBudget: !tokenOver && !latencyOver, tokenOver, latencyOver };
}

export function driftDiff(
  prev: CalibrationReport,
  curr: CalibrationReport,
  threshold = 0.1,
): {
  rankCorrelationDelta: number;
  directionAccuracyDelta: number;
  regressed: boolean;
} {
  const rankCorrelationDelta =
    curr.meanRankCorrelation - prev.meanRankCorrelation;
  const directionAccuracyDelta =
    curr.directionAccuracy - prev.directionAccuracy;
  const regressed =
    rankCorrelationDelta < -threshold || directionAccuracyDelta < -threshold;
  return { rankCorrelationDelta, directionAccuracyDelta, regressed };
}

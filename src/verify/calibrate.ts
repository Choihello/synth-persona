import { meanAbsoluteError, spearman } from "./scoring.js";

export interface GroundTruthCase {
  id: string;
  question: string;
  choices: string[];
  actualShare: Record<string, number>;
}
export interface CaseScore {
  id: string;
  predictedShare: Record<string, number>;
  rankCorrelation: number;
  shareMAE: number;
  directionHit: boolean;
}
export interface CalibrationReport {
  cases: CaseScore[];
  meanRankCorrelation: number;
  shareMAE: number;
  directionAccuracy: number;
}

export function topChoice(share: Record<string, number>): string | undefined {
  let best: string | undefined;
  let bestV = Number.NEGATIVE_INFINITY;
  for (const [k, v] of Object.entries(share)) {
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
}

export async function backtest(
  cases: GroundTruthCase[],
  runner: (c: GroundTruthCase) => Promise<Record<string, number>>,
): Promise<CalibrationReport> {
  const scored: CaseScore[] = [];
  for (const c of cases) {
    const predicted = await runner(c);
    // choices 순서로 정렬해 두 분포를 비교
    const pred = c.choices.map((k) => predicted[k] ?? 0);
    const actual = c.choices.map((k) => c.actualShare[k] ?? 0);
    scored.push({
      id: c.id,
      predictedShare: predicted,
      rankCorrelation: spearman(pred, actual),
      shareMAE: meanAbsoluteError(pred, actual),
      directionHit: topChoice(predicted) === topChoice(c.actualShare),
    });
  }
  const n = scored.length || 1;
  return {
    cases: scored,
    meanRankCorrelation: scored.reduce((s, c) => s + c.rankCorrelation, 0) / n,
    shareMAE: scored.reduce((s, c) => s + c.shareMAE, 0) / n,
    directionAccuracy: scored.filter((c) => c.directionHit).length / n,
  };
}

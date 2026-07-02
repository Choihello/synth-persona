import type { StudyResult } from "../types.js";
import type { Confidence, SegmentInsight } from "./types.js";

interface Bucket {
  dim: string;
  value: string;
  total: number; // choice가 있는(파싱된) 응답 수
  positive: number;
  weightSum: number;
  dist: Record<string, number>;
}

/**
 * dim×세그먼트를 재집계해 기회/저항/판단보류로 랭킹한다 (순수 함수, read-only).
 * 랭킹은 기준선(globalPositiveRatio) 대비 차이 × log(sampleCount) — 큰 세그먼트가
 * 기준선보다 아주 조금 높은 것만으로 과대평가되지 않게 한다.
 * sampleCount < minN 세그먼트는 랭킹에서 제외하고 observedButHeld(판단 보류)로 보존한다.
 * (렌더 단계 cap은 P4-3에서 처리 — 데이터는 여기서 전량 보존한다.)
 */
export function rankSegments(
  result: StudyResult,
  positiveChoice: string,
  minN: number,
): {
  opportunity: SegmentInsight[];
  resistance: SegmentInsight[];
  observedButHeld: SegmentInsight[];
  globalPositiveRatio: number;
} {
  const buckets = new Map<string, Bucket>();
  let totalWeight = 0;
  let globalTotal = 0;
  let globalPositive = 0;

  for (const r of result.responses) {
    if (r.choice == null) continue; // parse 미매칭은 랭킹 집계 제외
    globalTotal++;
    if (r.choice === positiveChoice) globalPositive++;
    totalWeight += r.persona.weight;
    for (const [dim, value] of Object.entries(r.persona.attrs)) {
      const key = `${dim}=${value}`;
      let b = buckets.get(key);
      if (!b) {
        b = { dim, value, total: 0, positive: 0, weightSum: 0, dist: {} };
        buckets.set(key, b);
      }
      b.total++;
      b.weightSum += r.persona.weight;
      b.dist[r.choice] = (b.dist[r.choice] ?? 0) + 1;
      if (r.choice === positiveChoice) b.positive++;
    }
  }

  const globalPositiveRatio =
    globalTotal > 0 ? globalPositive / globalTotal : 0;

  const toInsight = (b: Bucket): SegmentInsight => {
    const positiveRatio = b.total > 0 ? b.positive / b.total : 0;
    const signal: "consensus" | "split" =
      positiveRatio >= 0.7 || positiveRatio <= 0.3 ? "consensus" : "split";
    return {
      segmentLabel: `${b.dim}=${b.value}`,
      segmentDefinition: `${b.dim}이(가) "${b.value}"인 응답자`,
      sampleCount: b.total,
      sampleWeightShare: totalWeight > 0 ? b.weightSum / totalWeight : 0,
      responseDistribution: b.dist,
      positiveRatio,
      signal,
      whyItMatters:
        positiveRatio > globalPositiveRatio
          ? "전체 평균보다 긍정 반응이 강한 세그먼트"
          : "전체 평균보다 저항이 강한 세그먼트",
      likelyReasoning:
        "(추정) 응답 분포에서 유추 — 실제 이유는 인터뷰로 확인 필요",
      confidence: "unknown" as Confidence, // Task 3에서 provenance 반영해 덮어씀
      caveats:
        b.total < minN
          ? [`표본 ${b.total}명(minN ${minN} 미만) — 판단 보류`]
          : [],
      recommendedFollowUpQuestion: `${b.dim}="${b.value}" 응답자에게 이 반응의 실제 이유를 물어볼 것`,
    };
  };

  const opportunity: Array<{ s: SegmentInsight; score: number }> = [];
  const resistance: Array<{ s: SegmentInsight; score: number }> = [];
  const held: SegmentInsight[] = [];

  for (const b of buckets.values()) {
    const insight = toInsight(b);
    if (b.total < minN) {
      held.push(insight);
      continue;
    }
    if (insight.positiveRatio > globalPositiveRatio) {
      opportunity.push({
        s: insight,
        score:
          (insight.positiveRatio - globalPositiveRatio) * Math.log(b.total),
      });
    } else if (insight.positiveRatio < globalPositiveRatio) {
      resistance.push({
        s: insight,
        score:
          (globalPositiveRatio - insight.positiveRatio) * Math.log(b.total),
      });
    }
  }

  opportunity.sort((a, b) => b.score - a.score);
  resistance.sort((a, b) => b.score - a.score);
  held.sort((a, b) => b.sampleCount - a.sampleCount);

  return {
    opportunity: opportunity.map((x) => x.s),
    resistance: resistance.map((x) => x.s),
    observedButHeld: held,
    globalPositiveRatio,
  };
}

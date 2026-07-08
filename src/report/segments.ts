import type { StudyResult } from "../types.js";
import type { Confidence, SegmentInsight } from "./types.js";

export const GATE_Z = 1.645; // Wilson 90% 신뢰구간
export const GATE_MIN_EFFECT = 0.1; // 최소 효과 크기 10%p

/**
 * Pooled 2표본 비율 z-검정 통계량. 세그먼트(p1,n1)와 여집합(p2,n2)의 긍정
 * 비율이 다른지 판정한다. 어느 한쪽 n<=0이거나 pooled 분산이 0이면 0.
 * |z| >= GATE_Z(1.645, 양측 α=0.10)이면 유의. 여집합측 표본(n2)이 작을수록
 * 표준오차가 커져 z가 작아지므로, 여집합 불확실성이 판정에 반영된다.
 */
export function twoProportionZ(
  p1: number,
  n1: number,
  p2: number,
  n2: number,
): number {
  if (n1 <= 0 || n2 <= 0) return 0;
  const pPool = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  return (p1 - p2) / se;
}

/** 이항 비율 윌슨 신뢰구간. n<=0이면 [0,1]. */
export function wilsonInterval(
  p: number,
  n: number,
  z: number,
): [number, number] {
  if (n <= 0) return [0, 1];
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

interface Bucket {
  dim: string;
  value: string;
  total: number; // choice가 있는(파싱된) 응답 수
  positive: number;
  weightSum: number;
  dist: Record<string, number>;
  personaIds: Set<string>;
}

/**
 * dim×세그먼트를 재집계해 기회/저항/약한 신호/판단보류로 랭킹한다 (순수 함수, read-only).
 *
 * 판정은 페르소나 단위로 한다: 각 페르소나가 반복 응답한 경우 과반 투표로
 * 긍정/비긍정 하나로 이진화(동률은 보수적으로 비긍정)한 뒤, 세그먼트의 페르소나
 * 긍정 비율을 **여집합(나머지 응답자)** 비율과 비교한다 — 전체 평균 비교는
 * 세그먼트 자신이 평균에 포함돼 큰 세그먼트의 효과를 희석시킨다(자기포함 편향).
 * 유의성은 2티어 게이트로 판단한다:
 *   1) 효과 크기: |세그 비율 - 여집합 비율| >= GATE_MIN_EFFECT(10%p)
 *   2) 통계적 신뢰: 세그먼트 vs 여집합 2표본 비율 z-검정 |z| >= GATE_Z(1.645)
 *      — 세그먼트·여집합 양쪽 표본 크기를 반영(여집합이 작으면 승격이 어려움)
 * 다중비교는 보정하지 않는다 — 승격된 차이도 "가설"로 렌더에 명시된다.
 * 두 조건을 모두 만족해야 opportunity/resistance로 승격된다.
 * 효과 크기는 크지만 z-검정이 유의하지 않으면(표본이 작아 우연일 수 있음) weakSignals로,
 * 효과 크기 자체가 작으면 withinNoise로 분류한다.
 * sampleCount(응답 단위) < minN 세그먼트는 애초에 랭킹에서 제외하고 observedButHeld로 보존한다.
 * 표시용 수치(sampleCount·positiveRatio·responseDistribution 등)는 응답 단위 원본 그대로 유지한다.
 * (렌더 단계 cap은 P4-3에서 처리 — 데이터는 여기서 전량 보존한다.)
 */
export function rankSegments(
  result: StudyResult,
  positiveChoice: string,
  minN: number,
): {
  opportunity: SegmentInsight[];
  resistance: SegmentInsight[];
  /** 효과는 크지만 표본이 작아 우연일 수 있는 세그먼트 (전량 보존) */
  weakSignals: SegmentInsight[];
  /** 효과 크기가 게이트 기준(10%p) 미만인 세그먼트 (전량 보존) */
  withinNoise: SegmentInsight[];
  observedButHeld: SegmentInsight[];
  globalPositiveRatio: number;
  /** 고유 페르소나 수 (표본 크기) */
  panelSize: number;
  /** 과반투표 긍정 페르소나 수 */
  panelPositive: number;
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
        b = {
          dim,
          value,
          total: 0,
          positive: 0,
          weightSum: 0,
          dist: {},
          personaIds: new Set(),
        };
        buckets.set(key, b);
      }
      b.total++;
      b.weightSum += r.persona.weight;
      b.dist[r.choice] = (b.dist[r.choice] ?? 0) + 1;
      if (r.choice === positiveChoice) b.positive++;
      b.personaIds.add(r.persona.id);
    }
  }

  const globalPositiveRatio =
    globalTotal > 0 ? globalPositive / globalTotal : 0;

  // 페르소나 단위 보정: 반복 K회 중 positiveChoice 과반이면 긍정 1 (동률은 보수적으로 0)
  const perPersona = new Map<string, { pos: number; total: number }>();
  for (const r of result.responses) {
    if (r.choice == null) continue;
    let p = perPersona.get(r.persona.id);
    if (!p) {
      p = { pos: 0, total: 0 };
      perPersona.set(r.persona.id, p);
    }
    p.total++;
    if (r.choice === positiveChoice) p.pos++;
  }
  const personaPositive = new Map<string, boolean>();
  let globalPersonaPos = 0;
  for (const [id, p] of perPersona) {
    const pos = p.pos > p.total / 2;
    personaPositive.set(id, pos);
    if (pos) globalPersonaPos++;
  }
  const globalPersonaRatio =
    perPersona.size > 0 ? globalPersonaPos / perPersona.size : 0;

  const toInsight = (b: Bucket): SegmentInsight => {
    const positiveRatio = b.total > 0 ? b.positive / b.total : 0;
    const signal: "consensus" | "split" =
      positiveRatio >= 0.7 || positiveRatio <= 0.3 ? "consensus" : "split";
    return {
      segmentLabel: `${b.dim}=${b.value}`,
      segmentDefinition: `${b.dim}이(가) "${b.value}"인 응답자`,
      sampleCount: b.total,
      sampleWeightShare: totalWeight > 0 ? b.weightSum / totalWeight : 0,
      personaCount: b.personaIds.size,
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
  const weakSignals: Array<{ s: SegmentInsight; score: number }> = [];
  const withinNoise: SegmentInsight[] = [];

  for (const b of buckets.values()) {
    const insight = toInsight(b);
    if (b.total < minN) {
      held.push(insight);
      continue;
    }
    const nP = b.personaIds.size;
    let posP = 0;
    for (const id of b.personaIds) if (personaPositive.get(id)) posP++;
    const segRatio = nP > 0 ? posP / nP : 0;
    // 여집합 비교 — 전체 평균은 세그먼트 자신을 포함해 큰 세그먼트일수록
    // 효과가 희석된다(자기포함 편향). 대조군은 "나머지 응답자"가 맞다.
    // 통계 신뢰는 2표본 z-검정으로 판정해 세그먼트·여집합 양쪽 표본 크기를
    // 모두 반영한다(여집합이 작으면 SE가 커져 승격이 어려워짐).
    const restN = perPersona.size - nP;
    const restPos = globalPersonaPos - posP;
    const restRatio = restN > 0 ? restPos / restN : segRatio; // 대조군 없음 → diff 0
    const diff = Math.abs(segRatio - restRatio);
    const z = twoProportionZ(segRatio, nP, restRatio, restN);
    const significant =
      nP > 0 && restN > 0 && diff >= GATE_MIN_EFFECT && Math.abs(z) >= GATE_Z;

    if (significant) {
      const up = segRatio > restRatio;
      insight.whyItMatters = up
        ? "나머지 응답자보다 긍정 반응이 강한 세그먼트"
        : "나머지 응답자보다 저항이 강한 세그먼트";
      const entry = { s: insight, score: diff * Math.log(nP) };
      if (up) opportunity.push(entry);
      else resistance.push(entry);
    } else if (nP > 0 && diff >= GATE_MIN_EFFECT) {
      insight.caveats.push(
        `표본이 작아 우연일 수 있음 (페르소나 ${nP}명 기준)`,
      );
      weakSignals.push({ s: insight, score: diff });
    } else {
      withinNoise.push(insight);
    }
  }

  opportunity.sort((a, b) => b.score - a.score);
  resistance.sort((a, b) => b.score - a.score);
  weakSignals.sort((a, b) => b.score - a.score);
  held.sort((a, b) => b.sampleCount - a.sampleCount);
  withinNoise.sort((a, b) => b.sampleCount - a.sampleCount);

  return {
    opportunity: opportunity.map((x) => x.s),
    resistance: resistance.map((x) => x.s),
    weakSignals: weakSignals.map((x) => x.s),
    withinNoise,
    observedButHeld: held,
    globalPositiveRatio,
    panelSize: perPersona.size,
    panelPositive: globalPersonaPos,
  };
}

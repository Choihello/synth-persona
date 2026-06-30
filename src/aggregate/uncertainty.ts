import type { Response, SegmentResult, StudyResult } from "../types.js";

export function normalizedEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const k = counts.filter((c) => c > 0).length;
  if (k <= 1) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(k); // 0~1로 정규화
}

function tally(responses: Response[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of responses) {
    const key = r.choice ?? r.answer;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function signalOf(
  responses: Response[],
  threshold: number,
): {
  signal: "consensus" | "split";
  dispersion: number;
  breakdown: Record<string, number>;
} {
  const breakdown = tally(responses);
  const dispersion = normalizedEntropy(Object.values(breakdown));
  return {
    signal: dispersion >= threshold ? "split" : "consensus",
    dispersion,
    breakdown,
  };
}

export function aggregate(
  responses: Response[],
  opts?: {
    splitThreshold?: number;
    missing?: { personaId: string; reason: string }[];
  },
): StudyResult {
  // 응답 0건을 정상 결과로 만들면 normalized entropy가 0이 되어 거짓 consensus(🟢)로
  // 보인다. 모든 LLM 응답 실패·표본 0 같은 상황은 신호가 아니라 실패이므로 명시적으로 throw.
  if (responses.length === 0) {
    const failed = opts?.missing?.length ?? 0;
    throw new Error(
      failed > 0
        ? `집계할 응답이 0건입니다 — 모든 페르소나 응답이 실패했습니다(${failed}건). API 키/요청 한도를 확인하세요.`
        : "집계할 응답이 0건입니다 — 표본이 비어 있습니다(--n 값을 확인하세요).",
    );
  }
  const threshold = opts?.splitThreshold ?? 0.5;
  const overall = signalOf(responses, threshold);

  // 모든 속성 차원에 대해 세그먼트 교차
  const dims = new Set<string>();
  for (const r of responses)
    for (const k of Object.keys(r.persona.attrs)) dims.add(k);
  const bySegment: Record<string, Record<string, SegmentResult>> = {};
  for (const dim of dims) {
    bySegment[dim] = {};
    const groups: Record<string, Response[]> = {};
    for (const r of responses) {
      const v = r.persona.attrs[dim];
      if (!groups[v]) groups[v] = [];
      groups[v].push(r);
    }
    for (const [v, rs] of Object.entries(groups)) {
      const s = signalOf(rs, threshold);
      bySegment[dim][v] = { signal: s.signal, breakdown: s.breakdown };
    }
  }

  return {
    responses,
    signal: overall.signal,
    dispersion: overall.dispersion,
    bySegment,
    missing: opts?.missing,
  };
}

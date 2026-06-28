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

function signalOf(responses: Response[], threshold: number): { signal: "consensus" | "split"; dispersion: number; breakdown: Record<string, number> } {
  const breakdown = tally(responses);
  const dispersion = normalizedEntropy(Object.values(breakdown));
  return { signal: dispersion >= threshold ? "split" : "consensus", dispersion, breakdown };
}

export function aggregate(
  responses: Response[],
  opts?: { splitThreshold?: number; missing?: { personaId: string; reason: string }[] },
): StudyResult {
  const threshold = opts?.splitThreshold ?? 0.5;
  const overall = signalOf(responses, threshold);

  // 모든 속성 차원에 대해 세그먼트 교차
  const dims = new Set<string>();
  for (const r of responses) for (const k of Object.keys(r.persona.attrs)) dims.add(k);
  const bySegment: Record<string, Record<string, SegmentResult>> = {};
  for (const dim of dims) {
    bySegment[dim] = {};
    const groups: Record<string, Response[]> = {};
    for (const r of responses) {
      const v = r.persona.attrs[dim];
      (groups[v] ??= []).push(r);
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

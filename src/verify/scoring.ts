function rank(xs: number[]): number[] {
  // 평균 순위(동점은 평균 처리)
  const idx = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
  const ranks = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // 1-based 평균 순위
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

export function spearman(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2 || b.length !== n) return 0;
  const ra = rank(a);
  const rb = rank(b);
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  if (va === 0 || vb === 0) return 0;
  return cov / Math.sqrt(va * vb);
}

export function meanAbsoluteError(pred: number[], actual: number[]): number {
  const n = Math.min(pred.length, actual.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(pred[i] - actual[i]);
  return s / n;
}

export function brierScore(probs: number[], outcomes: number[]): number {
  const n = Math.min(probs.length, outcomes.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += (probs[i] - outcomes[i]) ** 2;
  return s / n;
}

export function intervalCoverage(
  intervals: Array<[number, number]>,
  actuals: number[],
): number {
  const n = Math.min(intervals.length, actuals.length);
  if (n === 0) return 0;
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const [lo, hi] = intervals[i];
    if (actuals[i] >= lo && actuals[i] <= hi) hit++;
  }
  return hit / n;
}

export function totalVariationDistance(p: number[], q: number[]): number {
  const n = Math.max(p.length, q.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs((p[i] ?? 0) - (q[i] ?? 0));
  return s / 2;
}

export function smoothedKL(p: number[], q: number[], eps = 1e-9): number {
  const n = Math.max(p.length, q.length);
  const ps: number[] = [];
  const qs: number[] = [];
  for (let i = 0; i < n; i++) {
    ps.push((p[i] ?? 0) + eps);
    qs.push((q[i] ?? 0) + eps);
  }
  const pSum = ps.reduce((a, b) => a + b, 0);
  const qSum = qs.reduce((a, b) => a + b, 0);
  let kl = 0;
  for (let i = 0; i < n; i++) {
    const pi = ps[i] / pSum;
    const qi = qs[i] / qSum;
    kl += pi * Math.log(pi / qi);
  }
  return kl;
}

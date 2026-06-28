import type { Distribution, JointDistribution } from "../types.js";

function strides(sizes: number[]): number[] {
  const s = new Array(sizes.length).fill(1);
  for (let i = sizes.length - 2; i >= 0; i--) s[i] = s[i + 1] * sizes[i + 1];
  return s;
}

function normalize(vec: number[]): number[] {
  const t = vec.reduce((a, b) => a + b, 0);
  return t > 0 ? vec.map((v) => v / t) : vec.map(() => 0);
}

export function ipf(
  dist: Distribution,
  opts?: { iterations?: number },
): JointDistribution {
  const iterations = opts?.iterations ?? 50;
  const sizes = dist.dimensions.map((d) => d.categories.length);
  const dimIndex = Object.fromEntries(
    dist.dimensions.map((d, i) => [d.name, i]),
  );
  const st = strides(sizes);
  const N = sizes.reduce((a, b) => a * b, 1);
  const cells = new Float64Array(N).fill(1 / N);

  // 셀 i의 특정 차원 d 값(category index)
  const coord = (i: number, d: number) => Math.floor(i / st[d]) % sizes[d];

  for (let iter = 0; iter < iterations; iter++) {
    // 1-way 마진 적합
    for (const [name, rawTarget] of Object.entries(dist.marginals)) {
      const d = dimIndex[name];
      if (d == null) continue;
      const target = normalize(rawTarget);
      const cur = new Array(sizes[d]).fill(0);
      for (let i = 0; i < N; i++) cur[coord(i, d)] += cells[i];
      for (let i = 0; i < N; i++) {
        const c = coord(i, d);
        if (cur[c] > 0) cells[i] *= target[c] / cur[c];
      }
    }
    // 2-way 교차표 적합
    for (const ct of dist.crossTables ?? []) {
      const da = dimIndex[ct.dims[0]];
      const db = dimIndex[ct.dims[1]];
      if (da == null || db == null) continue;
      const flatTotal = ct.matrix.flat().reduce((a, b) => a + b, 0);
      const cur: number[][] = Array.from({ length: sizes[da] }, () =>
        new Array(sizes[db]).fill(0),
      );
      for (let i = 0; i < N; i++) cur[coord(i, da)][coord(i, db)] += cells[i];
      for (let i = 0; i < N; i++) {
        const ca = coord(i, da);
        const cb = coord(i, db);
        const tgt = flatTotal > 0 ? ct.matrix[ca][cb] / flatTotal : 0;
        if (cur[ca][cb] > 0) cells[i] *= tgt / cur[ca][cb];
      }
    }
  }
  return { dimensions: dist.dimensions, cells };
}

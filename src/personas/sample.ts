import type { JointDistribution, Persona } from "../types.js";

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function samplePersonas(
  joint: JointDistribution,
  n: number,
  seed = 1,
): Persona[] {
  const sizes = joint.dimensions.map((d) => d.categories.length);
  const st = new Array(sizes.length).fill(1);
  for (let i = sizes.length - 2; i >= 0; i--) st[i] = st[i + 1] * sizes[i + 1];
  const total = joint.cells.reduce((a, b) => a + b, 0);
  const rng = makeRng(seed);
  const out: Persona[] = [];
  for (let k = 0; k < n; k++) {
    let r = rng() * total;
    let idx = 0;
    for (let i = 0; i < joint.cells.length; i++) {
      r -= joint.cells[i];
      if (r <= 0) {
        idx = i;
        break;
      }
      idx = i;
    }
    const attrs: Record<string, string> = {};
    for (let d = 0; d < joint.dimensions.length; d++) {
      const c = Math.floor(idx / st[d]) % sizes[d];
      attrs[joint.dimensions[d].name] = joint.dimensions[d].categories[c];
    }
    out.push({ id: `p${k + 1}`, attrs });
  }
  return out;
}

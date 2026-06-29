import type { Persona, Provenance } from "../types.js";
import type { ConditionalTable, Snapshot } from "./schema.js";

export function conditionalProbs(row: (number | null)[]): number[] {
  const tot = row.reduce<number>((s, v) => s + (v ?? 0), 0);
  return row.map((v) => (v == null || tot === 0 ? 0 : v / tot));
}

function strides(sizes: number[]): number[] {
  const s = new Array(sizes.length).fill(1);
  for (let i = sizes.length - 2; i >= 0; i--) s[i] = s[i + 1] * sizes[i + 1];
  return s;
}

function attachConditional(
  personas: Persona[],
  ct: ConditionalTable,
): Persona[] {
  const gi = Object.fromEntries(ct.givenKeys.map((k, i) => [k, i]));
  const out: Persona[] = [];
  for (const p of personas) {
    const rowIdx = gi[p.attrs[ct.given]];
    const probs = rowIdx == null ? [] : conditionalProbs(ct.matrix[rowIdx]);
    const tot = probs.reduce((a, b) => a + b, 0);
    if (tot === 0) {
      // given 값이 conditional universe 밖이거나 전부 suppressed → inferred 기본값
      out.push({
        ...p,
        attrs: { ...p.attrs, [ct.var]: "해당없음" },
        provenance: { ...p.provenance, [ct.var]: "inferred" as Provenance },
      });
      continue;
    }
    for (let v = 0; v < ct.varKeys.length; v++) {
      if (probs[v] <= 0) continue;
      const flags = [...(p.flags ?? [])];
      if (ct.bridge) flags.push(`bridge:${ct.bridge}`);
      out.push({
        ...p,
        attrs: { ...p.attrs, [ct.var]: ct.varKeys[v] },
        weight: p.weight * probs[v],
        provenance: { ...p.provenance, [ct.var]: "conditioned" as Provenance },
        flags,
      });
    }
  }
  return out;
}

export function synthesizePopulation(
  snapshot: Snapshot,
  opts?: { minCellWeight?: number },
): Persona[] {
  const { core, conditional } = snapshot;
  const sizes = core.dims.map((d) => core.categories[d].length);
  const st = strides(sizes);
  const N = sizes.reduce((a, b) => a * b, 1);

  let pop: Persona[] = [];
  for (let i = 0; i < N; i++) {
    const w = core.counts[i];
    if (!(w > 0)) continue;
    const attrs: Record<string, string> = {};
    const provenance: Record<string, Provenance> = {};
    for (let d = 0; d < core.dims.length; d++) {
      const c = Math.floor(i / st[d]) % sizes[d];
      const dim = core.dims[d];
      attrs[dim] = core.categories[dim][c];
      provenance[dim] = "matched";
    }
    if (attrs.연령 === "15세미만") continue; // 응답자 universe 15세+
    pop.push({ id: "tmp", attrs, weight: w, provenance, flags: [] });
  }

  for (const ct of conditional) pop = attachConditional(pop, ct);

  const minW = opts?.minCellWeight ?? 0;
  return pop.map((p, i) => {
    const flags =
      p.weight < minW ? [...(p.flags ?? []), "low-confidence"] : p.flags;
    return { ...p, id: `p${i + 1}`, flags };
  });
}

import type { Snapshot } from "../population/schema.js";
import type { Persona } from "../types.js";
import { meanAbsoluteError, totalVariationDistance } from "./scoring.js";

export interface CellError {
  key: string;
  expected: number;
  actual: number;
}
export interface BlockFidelity {
  name: string;
  provenance: "matched" | "conditioned";
  mae: number;
  tvd: number;
  maxError: CellError;
}
export interface FidelityReport {
  core: BlockFidelity;
  conditional: BlockFidelity[];
  matched: string[];
  conditioned: string[];
}

function shares(weightByKey: Map<string, number>): Map<string, number> {
  const tot = [...weightByKey.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  for (const [k, v] of weightByKey) out.set(k, tot > 0 ? v / tot : 0);
  return out;
}

function compare(
  synth: Map<string, number>,
  source: Map<string, number>,
): { mae: number; tvd: number; maxError: CellError } {
  const keys = new Set([...synth.keys(), ...source.keys()]);
  const a: number[] = [];
  const e: number[] = [];
  let maxError: CellError = { key: "", expected: 0, actual: 0 };
  let maxDiff = -1;
  for (const k of keys) {
    const av = synth.get(k) ?? 0;
    const ev = source.get(k) ?? 0;
    a.push(av);
    e.push(ev);
    const d = Math.abs(av - ev);
    if (d > maxDiff) {
      maxDiff = d;
      maxError = { key: k, expected: ev, actual: av };
    }
  }
  return {
    mae: meanAbsoluteError(a, e),
    tvd: totalVariationDistance(a, e),
    maxError,
  };
}

export function populationFidelity(
  personas: Persona[],
  snapshot: Snapshot,
): FidelityReport {
  const dims = snapshot.core.dims;
  const ageDim = "연령";

  // --- core: 가중 재집계 share vs 원본(응답자 15세+) ---
  const synthCore = new Map<string, number>();
  for (const p of personas) {
    const key = dims.map((d) => p.attrs[d]).join("|");
    synthCore.set(key, (synthCore.get(key) ?? 0) + p.weight);
  }
  const sizes = dims.map((d) => snapshot.core.categories[d].length);
  const st = sizes.map((_, i) => sizes.slice(i + 1).reduce((x, y) => x * y, 1));
  const sourceCore = new Map<string, number>();
  for (let i = 0; i < snapshot.core.counts.length; i++) {
    const parts = dims.map(
      (d, di) =>
        snapshot.core.categories[d][Math.floor(i / st[di]) % sizes[di]],
    );
    if (parts[dims.indexOf(ageDim)] === "15세미만") continue;
    sourceCore.set(parts.join("|"), snapshot.core.counts[i]);
  }
  const core: BlockFidelity = {
    name: dims.join("×"),
    provenance: "matched",
    ...compare(shares(synthCore), shares(sourceCore)),
  };

  // --- conditional: P(var|age) 단위 비교 ---
  const conditional: BlockFidelity[] = [];
  for (const ct of snapshot.conditional) {
    const synthByAge = new Map<string, Map<string, number>>();
    for (const p of personas) {
      const age = p.attrs[ct.given];
      const vv = p.attrs[ct.var];
      if (!ct.varKeys.includes(vv)) continue; // inferred 제외
      const m = synthByAge.get(age) ?? new Map<string, number>();
      m.set(vv, (m.get(vv) ?? 0) + p.weight);
      synthByAge.set(age, m);
    }
    const synthProb = new Map<string, number>();
    for (const [age, m] of synthByAge) {
      const tot = [...m.values()].reduce((x, y) => x + y, 0);
      for (const [vv, w] of m)
        synthProb.set(`${age}|${vv}`, tot > 0 ? w / tot : 0);
    }
    const sourceProb = new Map<string, number>();
    for (let g = 0; g < ct.givenKeys.length; g++) {
      const row = ct.matrix[g];
      const tot = row.reduce<number>((x, y) => x + (y ?? 0), 0);
      if (tot <= 0) continue;
      for (let v = 0; v < ct.varKeys.length; v++) {
        const val = row[v];
        if (val != null)
          sourceProb.set(`${ct.givenKeys[g]}|${ct.varKeys[v]}`, val / tot);
      }
    }
    conditional.push({
      name: `${ct.given}×${ct.var}`,
      provenance: "conditioned",
      ...compare(synthProb, sourceProb),
    });
  }

  return {
    core,
    conditional,
    matched: [...dims],
    conditioned: snapshot.conditional.map((c) => c.var),
  };
}

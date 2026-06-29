import { makeRng } from "../personas/sample.js";
import type { Persona } from "../types.js";
import { loadSnapshot } from "./loader.js";
import type { Snapshot } from "./schema.js";
import { synthesizePopulation } from "./synthesize.js";

export function sampleForSimulation(
  personas: Persona[],
  n: number,
  seed: number,
): Persona[] {
  const total = personas.reduce((s, p) => s + p.weight, 0);
  const rng = makeRng(seed);
  const out: Persona[] = [];
  for (let k = 0; k < n; k++) {
    let r = rng() * total;
    let pick = personas[personas.length - 1];
    for (const p of personas) {
      r -= p.weight;
      if (r <= 0) {
        pick = p;
        break;
      }
    }
    out.push({ ...pick, id: `s${k + 1}` });
  }
  return out;
}

export interface PersonaSource {
  population(): Promise<Persona[]>;
}

export class CensusPopulation implements PersonaSource {
  constructor(private snapshot: Snapshot) {}
  async population(): Promise<Persona[]> {
    // loadSnapshot로 구조 검증 + frame 가드를 거친 뒤 합성
    return synthesizePopulation(loadSnapshot(this.snapshot));
  }
}

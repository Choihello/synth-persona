import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import poolJson from "../data/nemotron/kr-pool.json" with { type: "json" };
import type { NarrativePool } from "../src/personas/narrative.js";
import { attachNarratives, narrativeKey } from "../src/personas/narrative.js";
import type { Snapshot } from "../src/population/schema.js";
import { CensusPopulation } from "../src/population/source.js";
import { sampleForSimulation } from "../src/population/source.js";

const pool = poolJson as unknown as NarrativePool;
const population = new CensusPopulation(snapshotJson as unknown as Snapshot);
const all = await population.population();
const sample = sampleForSimulation(all, 200, 42);
const attached = attachNarratives(sample, pool, 42);

let withNarrative = 0;
let violations = 0;
for (const p of attached) {
  if (!p.narrative) continue;
  withNarrative++;
  const key = narrativeKey(p.attrs);
  if (!key) {
    console.error("VIOLATION: narrative without key", p.id);
    violations++;
    continue;
  }
  // 부착된 서사가 실제 그 스트라텀 후보에서 왔는지 역검증
  const bases = (pool.strata[key] ?? []).map(
    (e) => `${e.n} (직업: ${e.job} · 학력: ${e.edu})`,
  );
  if (!bases.includes(p.narrative)) {
    console.error("VIOLATION: stratum mismatch", p.id, key);
    violations++;
  }
  // 텍스트 모순: 1인 가구인데 서사에 동거 단서(배우자/3세대/가족 동거)가 있으면 위반 (회귀 방지 그물)
  const size = p.attrs.가구원수;
  if (
    size?.match(/1\s*명/) &&
    /(아내|남편|배우자)(와|과)|3세대|가족과 함께 (살|거주)/.test(p.narrative)
  ) {
    console.error("VIOLATION: 1인 가구 + 동거 서사", p.id, key);
    violations++;
  }
}
console.log(`감사: 표본 200 · 서사 부착 ${withNarrative} · 모순 ${violations}`);
console.log("무작위 10건 (정성 검토용):");
for (const p of attached.filter((x) => x.narrative).slice(0, 10)) {
  console.log("-", JSON.stringify(p.attrs), "→", p.narrative?.slice(0, 120));
}
if (violations > 0) process.exit(1);

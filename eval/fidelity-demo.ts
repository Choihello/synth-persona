import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import { loadSnapshot } from "../src/population/loader.js";
import { synthesizePopulation } from "../src/population/synthesize.js";
import { renderFidelityReport } from "../src/verify/fidelity-report.js";
import { populationFidelity } from "../src/verify/fidelity.js";

export function runFidelityDemo(): string {
  const snapshot = loadSnapshot(snapshotJson);
  const pop = synthesizePopulation(snapshot);
  const report = populationFidelity(pop, snapshot);
  return renderFidelityReport("synth-persona 합성 인구 충실도(2024)", report);
}

if (
  process.argv[1]?.endsWith("fidelity-demo.ts") ||
  process.argv[1]?.endsWith("fidelity-demo.js")
) {
  console.log(runFidelityDemo());
}

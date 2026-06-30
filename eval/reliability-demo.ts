import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import { aggregate } from "../src/aggregate/uncertainty.js";
import { assessReliability } from "../src/assess/reliability.js";
import { MockProvider } from "../src/llm/mock.js";
import { loadSnapshot } from "../src/population/loader.js";
import { sampleForSimulation } from "../src/population/source.js";
import { synthesizePopulation } from "../src/population/synthesize.js";
import { simulate } from "../src/simulate/simulate.js";
import { populationFidelity } from "../src/verify/fidelity.js";
import { renderMarkdownReport } from "../src/verify/report.js";

export async function runReliabilityDemo(): Promise<string> {
  const snapshot = loadSnapshot(snapshotJson);
  const pop = synthesizePopulation(snapshot);
  const sample = sampleForSimulation(pop, 200, 7);

  const choices = ["쓴다", "안쓴다"];
  const young = new Set(["20~24세", "25~29세", "30~34세"]);
  const provider = new MockProvider((p) =>
    young.has(p.attrs.연령) ? "쓴다" : "안쓴다",
  );
  const question = {
    prompt: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
    choices,
  };

  const { responses, missing } = await simulate(sample, question, provider);
  const result = aggregate(responses, { missing });

  const fidelity = populationFidelity(pop, snapshot);
  const bridges = Object.fromEntries(
    snapshot.conditional
      .filter((c) => c.bridge)
      .map((c) => [c.var, c.bridge as string]),
  );
  const card = assessReliability(result, { fidelity, bridges });

  return renderMarkdownReport({
    title: "synth-persona 신뢰성 카드 데모 (2024 합성 인구)",
    result,
    reliability: card,
  });
}

if (
  process.argv[1]?.endsWith("reliability-demo.ts") ||
  process.argv[1]?.endsWith("reliability-demo.js")
) {
  runReliabilityDemo().then((md) => console.log(md));
}

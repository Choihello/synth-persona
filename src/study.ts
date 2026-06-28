import { aggregate } from "./aggregate/uncertainty.js";
import type { DataSource } from "./data/source.js";
import type { LLMProvider } from "./llm/provider.js";
import { ipf } from "./personas/ipf.js";
import { samplePersonas } from "./personas/sample.js";
import { type Question, simulate } from "./simulate/simulate.js";
import type { StudyResult } from "./types.js";

export interface StudyConfig {
  source: DataSource;
  provider: LLMProvider;
  question: Question;
  n: number;
  seed?: number;
  splitThreshold?: number;
}

export async function runStudy(config: StudyConfig): Promise<StudyResult> {
  const dist = await config.source.getDistribution();
  const joint = ipf(dist);
  const personas = samplePersonas(joint, config.n, config.seed ?? 1);
  const { responses, missing } = await simulate(
    personas,
    config.question,
    config.provider,
  );
  return aggregate(responses, {
    splitThreshold: config.splitThreshold,
    missing,
  });
}

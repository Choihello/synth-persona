import { aggregate } from "./aggregate/uncertainty.js";
import type { DataSource } from "./data/source.js";
import type { LLMProvider } from "./llm/provider.js";
import { ipf } from "./personas/ipf.js";
import { samplePersonas } from "./personas/sample.js";
import {
  type PersonaSource,
  sampleForSimulation,
} from "./population/source.js";
import { type Question, simulate } from "./simulate/simulate.js";
import type { StudyResult } from "./types.js";
import type { ShareRunner } from "./verify/robustness.js";

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

export interface CensusStudyConfig {
  population: PersonaSource;
  provider: LLMProvider;
  question: Question;
  n: number;
  seed?: number;
  splitThreshold?: number;
}

/**
 * 통계청 합성 인구(PersonaSource) 기반 study. DataSource→IPF 경로 대신
 * 가중 모집단을 weight 비례로 추출(sampleForSimulation)하므로 persona가
 * provenance/weight/flags를 보존한다. 키 불필요(provider 추상화에 의존).
 */
export async function runCensusStudy(
  config: CensusStudyConfig,
): Promise<StudyResult> {
  const all = await config.population.population();
  const sample = sampleForSimulation(all, config.n, config.seed ?? 1);
  const { responses, missing } = await simulate(
    sample,
    config.question,
    config.provider,
  );
  return aggregate(responses, {
    splitThreshold: config.splitThreshold,
    missing,
  });
}

/**
 * probes/robustness 배선용 어댑터: census 모집단 + provider로부터
 * ShareRunner를 만든다. 실제 Claude 실측은 묶음 B에서 provider를 교체하면
 * 그대로 동작하고, 지금은 MockProvider로 키 없이 검증한다.
 */
export function censusShareRunner(
  population: PersonaSource,
  provider: LLMProvider,
  opts: { n: number; seed?: number },
): ShareRunner {
  return async (prompt, choices) => {
    const result = await runCensusStudy({
      population,
      provider,
      question: { prompt, choices },
      n: opts.n,
      seed: opts.seed,
    });
    const tally: Record<string, number> = {};
    for (const r of result.responses) {
      const key = r.choice ?? r.answer;
      tally[key] = (tally[key] ?? 0) + 1;
    }
    return tally;
  };
}

import { aggregate } from "./aggregate/uncertainty.js";
import type { DataSource } from "./data/source.js";
import type { LLMProvider } from "./llm/provider.js";
import { ipf } from "./personas/ipf.js";
import { samplePersonas } from "./personas/sample.js";
import {
  type PersonaSource,
  sampleForSimulation,
} from "./population/source.js";
import {
  type Question,
  type SimulateOpts,
  simulate,
} from "./simulate/simulate.js";
import type { StudyResult } from "./types.js";
import type { ShareRunner } from "./verify/robustness.js";

export interface StudyConfig {
  source: DataSource;
  provider: LLMProvider;
  question: Question;
  n: number;
  seed?: number;
  splitThreshold?: number;
  simulate?: SimulateOpts;
  /** k회 반복 실행 후 응답을 풀링해 집계 (run간 분산 완화). 기본 1. */
  repeats?: number;
}

async function simulatePooled(
  personas: Parameters<typeof simulate>[0],
  question: Question,
  provider: LLMProvider,
  opts: SimulateOpts | undefined,
  repeats: number,
): Promise<Awaited<ReturnType<typeof simulate>>> {
  const responses: Awaited<ReturnType<typeof simulate>>["responses"] = [];
  const missing: Awaited<ReturnType<typeof simulate>>["missing"] = [];
  for (let i = 0; i < Math.max(1, repeats); i++) {
    const r = await simulate(personas, question, provider, opts);
    responses.push(...r.responses);
    missing.push(...r.missing);
  }
  // 전원 실패면 집계 에러(aggregate) 전에 실제 원인을 드러낸다 — 키/크레딧/한도 진단용
  if (responses.length === 0 && missing.length > 0) {
    throw new Error(
      `모든 페르소나 응답이 실패했습니다(${missing.length}건). 첫 실패 사유: ${missing[0].reason}`,
    );
  }
  return { responses, missing };
}

export async function runStudy(config: StudyConfig): Promise<StudyResult> {
  const dist = await config.source.getDistribution();
  const joint = ipf(dist);
  const personas = samplePersonas(joint, config.n, config.seed ?? 1);
  const { responses, missing } = await simulatePooled(
    personas,
    config.question,
    config.provider,
    config.simulate,
    config.repeats ?? 1,
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
  simulate?: SimulateOpts;
  /** k회 반복 실행 후 응답을 풀링해 집계 (run간 분산 완화). 기본 1. */
  repeats?: number;
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
  const { responses, missing } = await simulatePooled(
    sample,
    config.question,
    config.provider,
    config.simulate,
    config.repeats ?? 1,
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

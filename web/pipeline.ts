import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import type { LLMProvider } from "../src/llm/provider.js";
import type { Snapshot } from "../src/population/schema.js";
import { CensusPopulation } from "../src/population/source.js";
import { generateFounderInsightReport } from "../src/report/generate.js";
import { buildLLMPrescriptions } from "../src/report/llm-prescriptions.js";
import { renderFounderInsightReport } from "../src/report/render.js";
import { runCensusStudy } from "../src/study.js";
import type { ReportRunner } from "./jobs.js";

export interface RunnerParams {
  n: number;
  repeats: number;
  concurrency: number;
}

/** 비용 고정을 위해 파라미터는 서버가 정한다 (사용자 조절 불가, 회당 ≈$0.02). */
export const DEFAULT_PARAMS: RunnerParams = {
  n: 30,
  repeats: 3,
  concurrency: 4,
};

/**
 * 실측 → LLM 처방 → 리포트 md. simulate의 onProgress는 반복(repeats)마다
 * 1..n으로 리셋되므로, 감소를 감지해 누적(1..n×repeats)으로 변환해 보고한다.
 */
export function makeReportRunner(
  provider: LLMProvider,
  params: RunnerParams = DEFAULT_PARAMS,
): ReportRunner {
  const population = new CensusPopulation(snapshotJson as unknown as Snapshot);

  return async (question, choices, onProgress) => {
    const totalCalls = params.n * params.repeats;
    let base = 0;
    let last = 0;
    const seed = Math.floor(Math.random() * 1_000_000); // 리포트마다 다른 표본

    const result = await runCensusStudy({
      population,
      provider,
      question: { prompt: question, choices },
      n: params.n,
      seed,
      repeats: params.repeats,
      simulate: {
        concurrency: params.concurrency,
        retries: 1,
        counterbalance: true,
        onProgress: (done) => {
          if (done < last) base += params.n; // 새 반복 시작
          last = done;
          onProgress(base + done, totalCalls, "합성 패널 응답 수집");
        },
      },
    });

    onProgress(totalCalls, totalCalls, "처방 생성");
    const options = {
      question,
      choices,
      run: { n: result.responses.length, seed, provider: "web" },
    };
    const llmGen = await buildLLMPrescriptions({
      provider,
      result,
      options,
      seed,
    });
    const report = generateFounderInsightReport(
      result,
      options,
      undefined,
      llmGen ?? undefined,
    );
    return renderFounderInsightReport(report);
  };
}

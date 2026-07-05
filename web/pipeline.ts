import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import poolJson from "../data/nemotron/kr-pool.json" with { type: "json" };
import type { LLMProvider } from "../src/llm/provider.js";
import type { NarrativePool } from "../src/personas/narrative.js";
import type { Snapshot } from "../src/population/schema.js";
import { CensusPopulation } from "../src/population/source.js";
import { generateFounderInsightReport } from "../src/report/generate.js";
import { buildLLMPrescriptions } from "../src/report/llm-prescriptions.js";
import { judgeDimensionRelevance } from "../src/report/relevance.js";
import { renderFounderInsightReport } from "../src/report/render.js";
import { runCensusStudy } from "../src/study.js";
import { segmentBarsSVG, shareBarSVG } from "./charts.js";
import { easySummaryHTML } from "./easy-summary.js";
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

    // 기본 OFF — A/B GO 후 기본 ON 전환. NARRATIVE=on일 때만 배경 서사 부착.
    const narrativeOn = process.env.NARRATIVE === "on";
    const narrativePool = narrativeOn
      ? (poolJson as unknown as NarrativePool)
      : undefined;

    const result = await runCensusStudy({
      population,
      provider,
      question: { prompt: question, choices },
      n: params.n,
      seed,
      repeats: params.repeats,
      narrativePool,
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
      run: {
        n: result.responses.length,
        seed,
        provider: "web",
        narrative: narrativeOn,
      },
    };
    const llmGen = await buildLLMPrescriptions({
      provider,
      result,
      options,
      seed,
    });
    // 질문↔차원 관련성 판정 (실패 시 null → 게이트 미적용)
    const dimensions = [
      ...new Set(result.responses.flatMap((r) => Object.keys(r.persona.attrs))),
    ];
    const relevance = await judgeDimensionRelevance({
      provider,
      question,
      dimensions,
    });
    const report = generateFounderInsightReport(
      result,
      options,
      undefined,
      llmGen ?? undefined,
      relevance,
    );
    let md = renderFounderInsightReport(report);
    const positiveChoice = options.choices[0];

    // 쉬운 요약 카드 — 제목·disclaimer 아래, 전문 리포트 첫 섹션 위
    const easy = easySummaryHTML(report, positiveChoice);
    if (easy) {
      md = md.replace("## 한 줄 요약\n", `${easy}\n\n## 한 줄 요약\n`);
    }

    // 인라인 SVG 차트 주입 (marked가 HTML 블록으로 통과시킴 — 저장본에 포함되어 공유 페이지 재생성 비용 0)
    const shareSvg = shareBarSVG(
      report.overallSignal.distribution,
      positiveChoice,
    );
    if (shareSvg) {
      md = md.replace("## 전체 신호\n", `## 전체 신호\n\n${shareSvg}\n`);
    }
    const segData = [
      ...report.opportunitySegments,
      ...report.resistanceSegments,
    ].map((s) => ({
      label: s.segmentLabel,
      ratio: s.positiveRatio,
      n: s.sampleCount,
    }));
    const globalRatio =
      Object.values(report.overallSignal.distribution).reduce(
        (a, b) => a + b,
        0,
      ) > 0
        ? (report.overallSignal.distribution[positiveChoice] ?? 0) /
          Object.values(report.overallSignal.distribution).reduce(
            (a, b) => a + b,
            0,
          )
        : 0;
    // segmentBarsSVG already returns "" for empty segments (web/charts.ts:59),
    // but guard early to avoid unnecessary processing
    const segSvg =
      segData.length > 0 ? segmentBarsSVG(segData, globalRatio) : "";
    if (segSvg) {
      md = md.replace("## 기회 세그먼트\n", `${segSvg}\n\n## 기회 세그먼트\n`);
    }
    return md;
  };
}

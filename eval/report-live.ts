import { parseArgs } from "node:util";
import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import type { LLMProvider } from "../src/llm/provider.js";
import type { Snapshot } from "../src/population/schema.js";
import { CensusPopulation } from "../src/population/source.js";
import { generateFounderInsightReport } from "../src/report/generate.js";
import { buildLLMPrescriptions } from "../src/report/llm-prescriptions.js";
import { renderFounderInsightReport } from "../src/report/render.js";
import { runCensusStudy } from "../src/study.js";

export interface ReportLiveOptions {
  provider: LLMProvider;
  question?: string;
  choices?: string[];
  n?: number;
  seed?: number;
  repeats?: number;
  counterbalance?: boolean;
  concurrency?: number;
}

/**
 * 제품 루프 end-to-end: 실측(카운터밸런스·반복 풀링) → LLM 처방(실패 시
 * heuristic 폴백 + 경고) → 창업자 리포트 markdown.
 */
export async function runReportLive(opts: ReportLiveOptions): Promise<string> {
  const question =
    opts.question ?? "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?";
  const choices = opts.choices ?? ["쓴다", "안쓴다"];
  const n = opts.n ?? 30;
  const seed = opts.seed ?? 7;
  const repeats = opts.repeats ?? 3;

  const population = new CensusPopulation(snapshotJson as unknown as Snapshot);
  const result = await runCensusStudy({
    population,
    provider: opts.provider,
    question: { prompt: question, choices },
    n,
    seed,
    repeats,
    simulate: {
      concurrency: opts.concurrency ?? 4,
      retries: 1,
      counterbalance: opts.counterbalance ?? true, // 라이브 기본 on (B2 실측 근거)
    },
  });

  const reportOptions = {
    question,
    choices,
    run: { n: result.responses.length, seed, provider: "live" },
  };
  const llmGen = await buildLLMPrescriptions({
    provider: opts.provider,
    result,
    options: reportOptions,
    seed,
  });
  const report = generateFounderInsightReport(
    result,
    reportOptions,
    undefined,
    llmGen ?? undefined,
  );
  const md = renderFounderInsightReport(report);
  return llmGen
    ? md
    : `> ⚠️ LLM 처방 생성 실패 — heuristic 초안으로 대체\n\n${md}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      provider: { type: "string", default: "openai" },
      question: { type: "string" },
      choices: { type: "string" },
      n: { type: "string", default: "30" },
      seed: { type: "string", default: "7" },
      repeats: { type: "string", default: "3" },
      counterbalance: { type: "boolean", default: false },
      "no-counterbalance": { type: "boolean", default: false },
      concurrency: { type: "string", default: "4" },
    },
  });
  const name = values.provider ?? "openai";
  let provider: LLMProvider;
  if (name === "anthropic") {
    const { ClaudeProvider } = await import("../src/llm/claude.js");
    provider = new ClaudeProvider();
  } else if (name === "openai") {
    const { OpenAIProvider } = await import("../src/llm/openai.js");
    provider = new OpenAIProvider();
  } else {
    throw new Error("--provider 는 anthropic 또는 openai 여야 합니다");
  }
  console.log(
    await runReportLive({
      provider,
      question: values.question,
      choices: values.choices?.split(",").map((c) => c.trim()),
      n: Number(values.n),
      seed: Number(values.seed),
      repeats: Number(values.repeats),
      counterbalance: values["no-counterbalance"]
        ? false
        : (values.counterbalance ?? true),
      concurrency: Number(values.concurrency),
    }),
  );
  if (provider.usage && provider.usage.calls > 0) {
    const u = provider.usage;
    console.error(
      `\n토큰 사용: 입력 ${u.inputTokens.toLocaleString()} · 출력 ${u.outputTokens.toLocaleString()} (${u.calls}회 호출)`,
    );
  }
}

if (process.argv[1]?.endsWith("report-live.js")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

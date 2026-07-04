import { parseArgs } from "node:util";
import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import { assessConsistency } from "../src/assess/reliability.js";
import type { LLMProvider } from "../src/llm/provider.js";
import type { Snapshot } from "../src/population/schema.js";
import { CensusPopulation } from "../src/population/source.js";
import { measureResponseConsistency } from "../src/verify/consistency.js";

export interface B2Options {
  provider: LLMProvider;
  question?: string;
  choices?: string[];
  paraphrases?: string[];
  n?: number;
  seed?: number;
  repeats?: number;
  concurrency?: number;
}

/** B2 실측: 응답 신뢰도(자기일관성·예스맨·순서·패러프레이즈·붕괴)를 재고 판정을 출력한다. */
export async function runB2(opts: B2Options): Promise<string> {
  const question =
    opts.question ?? "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?";
  const choices = opts.choices ?? ["쓴다", "안쓴다"];
  const paraphrases = opts.paraphrases ?? [
    "월 9900원짜리 신선식품 새벽배송 구독 서비스가 있다면 이용하시겠어요?",
    "신선식품을 새벽에 배송해주는 월 9900원 구독, 어떠세요?",
  ];
  const population = new CensusPopulation(snapshotJson as unknown as Snapshot);

  const m = await measureResponseConsistency({
    population,
    provider: opts.provider,
    question,
    paraphrases,
    choices,
    n: opts.n ?? 30,
    seed: opts.seed ?? 7,
    repeats: opts.repeats ?? 3,
    simulate: { concurrency: opts.concurrency ?? 4, retries: 1 },
  });
  const verdict = assessConsistency(m);

  const lines = [
    "# B2 응답 신뢰도 실측",
    "",
    `- 질문: ${question} (${choices.join("/")})`,
    `- 실행: ${m.detail.runs}회 (반복 ${m.detail.repeats} + 순서뒤집기 1 + 패러프레이즈 ${paraphrases.length}) × n=${m.detail.n} = ${m.detail.calls}콜`,
    "",
    "| 지표 | 값 | 판정 기준 |",
    "|---|---|---|",
    `| 자기일관성 | ${m.selfConsistency.toFixed(3)} | < 0.6 경고 |`,
    `| 예스맨(첫 선택지 쏠림) | ${m.positivitySkew.toFixed(3)} | > 0.5 경고 |`,
    `| 분포 다양성(평균) | ${m.meanDispersion.toFixed(3)} | 붕괴: ${m.collapsed ? "🔴 예" : "🟢 아니오"} |`,
    `| 순서 편향 | ${m.orderBiased ? "🔴 있음" : "🟢 없음"} | 최다 선택 반전 여부 |`,
    `| 패러프레이즈 안정 | ${m.paraphraseStable ? "🟢 안정" : "🔴 불안정"} | 최다 선택 유지 여부 |`,
    "",
    `**판정: ${verdict.label}** — ${verdict.reason}`,
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      provider: { type: "string", default: "openai" },
      n: { type: "string", default: "30" },
      repeats: { type: "string", default: "3" },
      seed: { type: "string", default: "7" },
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
    await runB2({
      provider,
      n: Number(values.n),
      repeats: Number(values.repeats),
      seed: Number(values.seed),
    }),
  );
  if (provider.usage && provider.usage.calls > 0) {
    const u = provider.usage;
    console.error(
      `\n토큰 사용: 입력 ${u.inputTokens.toLocaleString()} · 출력 ${u.outputTokens.toLocaleString()} (${u.calls}회 호출)`,
    );
  }
}

if (process.argv[1]?.endsWith("b2-live.js")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

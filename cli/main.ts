import { parseArgs } from "node:util";
import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import { SampleSource } from "../src/data/sample-source.js";
import { formatDistribution, signalDot } from "../src/format.js";
import { ClaudeProvider } from "../src/llm/claude.js";
import { MockProvider } from "../src/llm/mock.js";
import { OpenAIProvider } from "../src/llm/openai.js";
import type { LLMProvider } from "../src/llm/provider.js";
import type { Snapshot } from "../src/population/schema.js";
import { CensusPopulation } from "../src/population/source.js";
import { DEFAULT_MIN_N } from "../src/report/generate.js";
import { runCensusStudy, runStudy } from "../src/study.js";
import type { Persona, StudyResult } from "../src/types.js";

export function parseIntArg(
  raw: string,
  flag: string,
  opts?: { min?: number },
): number {
  const n = Number(raw);
  const min = opts?.min;
  if (!Number.isFinite(n) || !Number.isInteger(n) || (min != null && n < min)) {
    const bound = min != null ? `${min} 이상의 ` : "";
    throw new Error(`${flag} 은(는) ${bound}정수여야 합니다 (입력: "${raw}")`);
  }
  return n;
}

export function parseN(raw: string): number {
  return parseIntArg(raw, "--n", { min: 1 });
}

export function parseSeed(raw: string): number {
  return parseIntArg(raw, "--seed");
}

/**
 * 키 없는 결정적 데모용 mock. 첫 선택지=젊은 층, 둘째=그 외.
 * sample 소스(attrs.age "20대"/"30대")와 census 소스(attrs.연령 "20~24세"…)
 * 둘 다에서 동작한다. 실제 시장 예측이 아니라 데모용 결정적 응답이다.
 */
export function censusAwareDemoMock(
  choices?: string[],
): (persona: Persona) => string {
  const yes = choices?.[0] ?? "A";
  const no = choices?.[1] ?? "B";
  const youngCensus = new Set(["20~24세", "25~29세", "30~34세", "35~39세"]);
  return (persona) => {
    const age = persona.attrs.age ?? persona.attrs.연령 ?? "";
    const young = age === "20대" || age === "30대" || youngCensus.has(age);
    return young ? yes : no;
  };
}

/**
 * 순서 편향 상쇄 기본 정책: 라이브는 기본 on (B2 실측 — 마지막 선택지 편향으로
 * 정방향 단일 실행이 긍정을 ~18%p 과소평가). --no-counterbalance로 해제.
 * mock은 결정성·기존 데모 출력 보존을 위해 기본 off, --counterbalance로만 on.
 */
export function resolveCounterbalance(opts: {
  mock: boolean;
  counterbalance?: boolean;
  noCounterbalance?: boolean;
}): boolean {
  if (opts.noCounterbalance) return false;
  if (opts.mock) return opts.counterbalance ?? false;
  return true;
}

/** --mock이면 결정적 mock, 아니면 --provider(anthropic|openai)로 라이브 프로바이더 선택. */
export function resolveProvider(opts: {
  mock: boolean;
  provider?: string;
  choices?: string[];
}): LLMProvider {
  if (opts.mock) return new MockProvider(censusAwareDemoMock(opts.choices));
  const name = opts.provider ?? "openai"; // 운용 결정(2026-07-04): OpenAI 단독 — anthropic은 명시 선택 시만
  if (name === "anthropic") return new ClaudeProvider();
  if (name === "openai") return new OpenAIProvider();
  throw new Error(
    `--provider 는 anthropic 또는 openai 여야 합니다 (입력: "${name}")`,
  );
}

export function formatResult(
  result: StudyResult,
  opts?: { minN?: number },
): string {
  const minN = opts?.minN ?? DEFAULT_MIN_N;
  const dot = signalDot;
  const lines: string[] = [];
  lines.push(
    "⚠️ synthetic panel response — 실제 시장 반응 아님 · 사람 대상 실측 전 가설 탐색용",
    "",
  );
  lines.push(
    `전체 신호: ${dot(result.signal)} ${result.signal} (분산 ${result.dispersion.toFixed(2)})`,
  );
  if (result.responses.length) {
    const total: Record<string, number> = {};
    for (const r of result.responses) {
      const k = r.choice ?? r.answer;
      total[k] = (total[k] ?? 0) + 1;
    }
    lines.push(`응답 분포: ${formatDistribution(total)}`);
  }
  for (const [dim, segs] of Object.entries(result.bySegment)) {
    lines.push(`\n[${dim}별]`);
    for (const [val, s] of Object.entries(segs)) {
      const n = Object.values(s.breakdown).reduce((a, b) => a + b, 0);
      const bd = formatDistribution(s.breakdown);
      if (n < minN) {
        lines.push(`  ⚪ ${val} (n=${n}): ${bd} — 표본 부족, 판단 보류`);
      } else {
        lines.push(`  ${dot(s.signal)} ${val} (n=${n}): ${bd}`);
      }
    }
  }
  if (result.missing?.length) {
    const total = result.responses.length + result.missing.length;
    const rate = total > 0 ? (result.missing.length / total) * 100 : 0;
    lines.push(
      `\n⚠️ 누락 ${result.missing.length}건(응답 실패) — missing rate ${rate.toFixed(1)}%`,
    );
  }
  return lines.join("\n");
}

export async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      question: { type: "string" },
      choices: { type: "string" },
      n: { type: "string", default: "50" },
      seed: { type: "string" },
      source: { type: "string", default: "sample" },
      mock: { type: "boolean", default: false },
      provider: { type: "string", default: "openai" },
      concurrency: { type: "string", default: "4" },
      counterbalance: { type: "boolean", default: false },
      "no-counterbalance": { type: "boolean", default: false },
      repeats: { type: "string", default: "1" },
    },
  });
  if (!values.question) {
    console.error(
      '사용법: synth-persona --question "A안 vs B안?" --choices "A안,B안" [--n 50] [--source sample|census] [--mock]',
    );
    process.exit(1);
  }
  const source = values.source ?? "sample";
  if (source !== "sample" && source !== "census") {
    console.error(
      `지원하지 않는 소스입니다: "${source}". --source sample (번들 샘플 분포) 또는 census (번들 통계청 합성 인구)를 사용하세요. KOSIS 라이브 소스는 라이브러리 전용입니다.`,
    );
    process.exit(1);
  }
  const choices = values.choices?.split(",").map((c) => c.trim());
  const question = { prompt: values.question, choices };
  const n = parseN(values.n ?? "50");
  const seed = values.seed ? parseSeed(values.seed) : undefined;
  const concurrency = parseIntArg(values.concurrency ?? "4", "--concurrency", {
    min: 1,
  });
  const repeats = parseIntArg(values.repeats ?? "1", "--repeats", { min: 1 });
  const provider: LLMProvider = resolveProvider({
    mock: values.mock ?? false,
    provider: values.provider,
    choices,
  });

  const isLive = !values.mock;
  const simulateOpts = {
    concurrency: isLive ? concurrency : 1, // mock은 순차(결정성·기존 데모 출력 보존)
    retries: isLive ? 1 : 0, // 재시도는 실측 경로 전용 — 라이브러리 기본값(0)은 재호출 없음
    counterbalance: resolveCounterbalance({
      mock: values.mock ?? false,
      counterbalance: values.counterbalance,
      noCounterbalance: values["no-counterbalance"],
    }),
    onProgress: isLive
      ? (done: number, total: number) => {
          process.stderr.write(`\r응답 수집 중 ${done}/${total}`);
          if (done === total) process.stderr.write("\n");
        }
      : undefined,
  };

  let result: StudyResult;
  if (source === "census") {
    const population = new CensusPopulation(
      snapshotJson as unknown as Snapshot,
    );
    result = await runCensusStudy({
      population,
      provider,
      question,
      n,
      seed,
      repeats,
      simulate: simulateOpts,
    });
  } else {
    result = await runStudy({
      source: new SampleSource(),
      provider,
      question,
      n,
      seed,
      repeats,
      simulate: simulateOpts,
    });
  }
  console.log(formatResult(result));
  if (provider.usage && provider.usage.calls > 0) {
    const u = provider.usage;
    console.error(
      `\n토큰 사용: 입력 ${u.inputTokens.toLocaleString()} · 출력 ${u.outputTokens.toLocaleString()} (${u.calls}회 호출) — 단가는 콘솔 요금표 확인`,
    );
  }
}

if (
  process.argv[1]?.endsWith("main.js") ||
  process.argv[1]?.endsWith("main.ts")
) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

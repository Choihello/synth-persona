import { parseArgs } from "node:util";
import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import { SampleSource } from "../src/data/sample-source.js";
import { ClaudeProvider } from "../src/llm/claude.js";
import { MockProvider } from "../src/llm/mock.js";
import type { LLMProvider } from "../src/llm/provider.js";
import type { Snapshot } from "../src/population/schema.js";
import { CensusPopulation } from "../src/population/source.js";
import { runCensusStudy, runStudy } from "../src/study.js";
import type { Persona, StudyResult } from "../src/types.js";

export function parseN(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `--n 은 1 이상의 정수여야 합니다 (입력: "${raw}"). 예: --n 50`,
    );
  }
  return n;
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

export function formatResult(result: StudyResult): string {
  const dot = (s: string) => (s === "split" ? "🔴" : "🟢");
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
    lines.push(
      `응답 분포: ${Object.entries(total)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
  }
  for (const [dim, segs] of Object.entries(result.bySegment)) {
    lines.push(`\n[${dim}별]`);
    for (const [val, s] of Object.entries(segs)) {
      const bd = Object.entries(s.breakdown)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      lines.push(`  ${dot(s.signal)} ${val}: ${bd}`);
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
  const seed = values.seed ? Number(values.seed) : undefined;
  const provider: LLMProvider = values.mock
    ? new MockProvider(censusAwareDemoMock(choices))
    : new ClaudeProvider();

  let result: StudyResult;
  if (source === "census") {
    const population = new CensusPopulation(
      snapshotJson as unknown as Snapshot,
    );
    result = await runCensusStudy({ population, provider, question, n, seed });
  } else {
    result = await runStudy({
      source: new SampleSource(),
      provider,
      question,
      n,
      seed,
    });
  }
  console.log(formatResult(result));
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

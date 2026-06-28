import { parseArgs } from "node:util";
import { SampleSource } from "../src/data/sample-source.js";
import { ClaudeProvider } from "../src/llm/claude.js";
import { MockProvider } from "../src/llm/mock.js";
import type { LLMProvider } from "../src/llm/provider.js";
import { type StudyConfig, runStudy } from "../src/study.js";
import type { StudyResult } from "../src/types.js";

export function formatResult(result: StudyResult): string {
  const dot = (s: string) => (s === "split" ? "🔴" : "🟢");
  const lines: string[] = [];
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
  if (result.missing?.length)
    lines.push(`\n⚠️ 누락 ${result.missing.length}건(응답 실패)`);
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
      '사용법: synth-persona --question "A안 vs B안?" --choices "A안,B안" [--n 50] [--mock]',
    );
    process.exit(1);
  }
  if (values.source !== "sample") {
    console.error(
      "KOSIS 소스는 아직 CLI에서 지원되지 않습니다 (인증키 연동 후 지원 예정). --source sample 을 사용하세요.",
    );
    process.exit(1);
  }
  // demo stub: deterministic mock for key-less demos — assumes an 'age' attribute and binary choices
  const provider: LLMProvider = values.mock
    ? new MockProvider((p) =>
        ["20대", "30대"].includes(p.attrs.age ?? "")
          ? (values.choices?.split(",")[0] ?? "A")
          : (values.choices?.split(",")[1] ?? "B"),
      )
    : new ClaudeProvider();
  const config: StudyConfig = {
    source: new SampleSource(),
    provider,
    question: {
      prompt: values.question,
      choices: values.choices?.split(",").map((c) => c.trim()),
    },
    n: Number(values.n),
    seed: values.seed ? Number(values.seed) : undefined,
  };
  const result = await runStudy(config);
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

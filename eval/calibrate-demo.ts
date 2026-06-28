import { SampleSource } from "../src/data/sample-source.js";
import { MockProvider } from "../src/llm/mock.js";
import { runStudy } from "../src/study.js";
import { type GroundTruthCase, backtest } from "../src/verify/calibrate.js";
import { renderMarkdownReport } from "../src/verify/report.js";
// groundtruth는 정적 JSON import로 번들에 인라인 → vitest와 빌드된 dist 모두에서
// cwd/레이아웃 독립으로 동작 (SampleSource와 동일 전략; 런타임 파일읽기 금지).
import casesJson from "./groundtruth/sample-cases.json" with { type: "json" };

export function loadCases(json: unknown): GroundTruthCase[] {
  const obj = json as { cases?: GroundTruthCase[] };
  return obj.cases ?? [];
}

// 데모용: 연령으로 갈리는 결정적 mock으로 각 사례의 예측 점유를 산출
async function predictShare(
  c: GroundTruthCase,
): Promise<Record<string, number>> {
  const provider = new MockProvider((p) =>
    ["20대", "30대"].includes(p.attrs.age ?? "") ? c.choices[0] : c.choices[1],
  );
  const result = await runStudy({
    source: new SampleSource(),
    provider,
    question: { prompt: c.question, choices: c.choices },
    n: 80,
    seed: 7,
  });
  const counts: Record<string, number> = {};
  for (const r of result.responses) {
    const k = r.choice ?? r.answer;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const total = result.responses.length || 1;
  const share: Record<string, number> = {};
  for (const k of c.choices) share[k] = (counts[k] ?? 0) / total;
  return share;
}

export async function runDemo(): Promise<string> {
  const cases = loadCases(casesJson);
  const calibration = await backtest(cases, predictShare);
  return renderMarkdownReport({
    title: "synth-persona 캘리브레이션 데모",
    calibration,
  });
}

if (
  process.argv[1]?.endsWith("calibrate-demo.ts") ||
  process.argv[1]?.endsWith("calibrate-demo.js")
) {
  runDemo().then((md) => console.log(md));
}

# Verification: Scoring, Calibration & Report Card (Plan 2A of verification harness)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결과를 아는 과거 사례에 시뮬레이션을 백테스트해 "적중률(fidelity)"을 숫자로 내고, 스터디 결과+채점을 단일 마크다운 성적표로 렌더하는 검증 계층(spec 검증 계층 5 + 통합 성적표)을 구현한다.

**Architecture:** 순수 함수 중심. `scoring.ts`(통계 채점) → `calibrate.ts`(주입된 runner로 백테스트, LLM 비의존) → `report.ts`(StudyResult+캘리브레이션 → 마크다운). 모두 결정적이라 LLM/네트워크 없이 TDD.

**Tech Stack:** TypeScript, Node 24(ESM), vitest. 런타임 외부 의존성 추가 없음(여전히 `@anthropic-ai/sdk`만).

## Global Constraints

- 런타임 외부 의존성은 `@anthropic-ai/sdk` 하나뿐. 채점·캘리브레이션·리포트는 무의존(Node 내장만).
- 키 없이 `npm install && npm test`가 항상 초록불. 새 테스트는 LLM/네트워크를 쓰지 않는다(runner 주입).
- 언어 TypeScript, ESM, 들여쓰기 2칸. 모든 무작위성은 시드 주입으로 결정적.
- 기존 `src/types.ts`의 `StudyResult`/`SegmentResult`를 재사용한다(새 중복 타입 금지).
- 빌드 임포트는 `.js` 확장자로 `.ts`를 가리킨다(프로젝트 관례).

---

### Task 1: 통계 채점 함수 (scoring.ts)

**Files:**
- Create: `src/verify/scoring.ts`, `src/verify/scoring.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `function spearman(a: number[], b: number[]): number` — 두 동일길이 배열의 스피어만 순위상관(-1..1). 길이<2거나 분산 0이면 0.
  - `function meanAbsoluteError(pred: number[], actual: number[]): number` — 평균절대오차.
  - `function brierScore(probs: number[], outcomes: number[]): number` — 이진 예측확률 vs 실제(0/1)의 Brier 점수(0=완벽).
  - `function intervalCoverage(intervals: Array<[number, number]>, actuals: number[]): number` — 실제값이 [lo,hi]에 들어간 비율(0..1).

- [ ] **Step 1: 실패 테스트 작성**

`src/verify/scoring.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { brierScore, intervalCoverage, meanAbsoluteError, spearman } from "./scoring.js";

describe("scoring", () => {
  test("spearman: 완전 일치 순위 → 1", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 6);
  });
  test("spearman: 완전 역순 → -1", () => {
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 6);
  });
  test("spearman: 길이<2 또는 분산0 → 0", () => {
    expect(spearman([1], [1])).toBe(0);
    expect(spearman([5, 5, 5], [1, 2, 3])).toBe(0);
  });
  test("meanAbsoluteError", () => {
    expect(meanAbsoluteError([0.5, 0.2], [0.4, 0.4])).toBeCloseTo(0.15, 6);
  });
  test("brierScore: 완벽 예측 → 0, 최악 → 1", () => {
    expect(brierScore([1, 0], [1, 0])).toBeCloseTo(0, 6);
    expect(brierScore([0, 1], [1, 0])).toBeCloseTo(1, 6);
  });
  test("intervalCoverage", () => {
    expect(intervalCoverage([[0, 1], [0, 1], [2, 3]], [0.5, 5, 2.5])).toBeCloseTo(2 / 3, 6);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/verify/scoring.test.ts`
Expected: FAIL ("Cannot find module './scoring.js'")

- [ ] **Step 3: scoring.ts 구현**

`src/verify/scoring.ts`:
```ts
function rank(xs: number[]): number[] {
  // 평균 순위(동점은 평균 처리)
  const idx = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
  const ranks = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // 1-based 평균 순위
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

export function spearman(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2 || b.length !== n) return 0;
  const ra = rank(a);
  const rb = rank(b);
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  if (va === 0 || vb === 0) return 0;
  return cov / Math.sqrt(va * vb);
}

export function meanAbsoluteError(pred: number[], actual: number[]): number {
  const n = Math.min(pred.length, actual.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(pred[i] - actual[i]);
  return s / n;
}

export function brierScore(probs: number[], outcomes: number[]): number {
  const n = Math.min(probs.length, outcomes.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += (probs[i] - outcomes[i]) ** 2;
  return s / n;
}

export function intervalCoverage(intervals: Array<[number, number]>, actuals: number[]): number {
  const n = Math.min(intervals.length, actuals.length);
  if (n === 0) return 0;
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const [lo, hi] = intervals[i];
    if (actuals[i] >= lo && actuals[i] <= hi) hit++;
  }
  return hit / n;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/verify/scoring.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/verify/scoring.ts src/verify/scoring.test.ts
git commit -m "feat: 통계 채점 함수 (spearman/MAE/Brier/coverage)"
```

---

### Task 2: 캘리브레이션 백테스트 (calibrate.ts + groundtruth 픽스처)

**Files:**
- Create: `src/verify/calibrate.ts`, `src/verify/calibrate.test.ts`, `eval/groundtruth/sample-cases.json`

**Interfaces:**
- Consumes: `spearman`, `meanAbsoluteError` (`./scoring.js`)
- Produces:
  - `interface GroundTruthCase { id: string; question: string; choices: string[]; actualShare: Record<string, number> }`
  - `interface CaseScore { id: string; predictedShare: Record<string, number>; rankCorrelation: number; shareMAE: number; directionHit: boolean }`
  - `interface CalibrationReport { cases: CaseScore[]; meanRankCorrelation: number; shareMAE: number; directionAccuracy: number }`
  - `function topChoice(share: Record<string, number>): string | undefined` — 최대 점유 선택지.
  - `async function backtest(cases: GroundTruthCase[], runner: (c: GroundTruthCase) => Promise<Record<string, number>>): Promise<CalibrationReport>` — 각 사례에 runner를 돌려 예측 점유를 얻고 actualShare와 채점. runner를 주입하므로 LLM/네트워크 비의존(테스트는 결정적 runner 사용).

- [ ] **Step 1: groundtruth 샘플 픽스처 작성** (예시용 — 실제 데이터 아님 명시)

`eval/groundtruth/sample-cases.json`:
```json
{
  "_note": "illustrative seed cases only — replace with real survey outcomes as they accumulate",
  "cases": [
    {
      "id": "milkkit-subscribe",
      "question": "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
      "choices": ["쓴다", "안쓴다"],
      "actualShare": { "쓴다": 0.42, "안쓴다": 0.58 }
    },
    {
      "id": "delivery-time",
      "question": "새벽배송 vs 저녁배송?",
      "choices": ["새벽배송", "저녁배송"],
      "actualShare": { "새벽배송": 0.55, "저녁배송": 0.45 }
    }
  ]
}
```

- [ ] **Step 2: 실패 테스트 작성**

`src/verify/calibrate.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { type GroundTruthCase, backtest, topChoice } from "./calibrate.js";

const cases: GroundTruthCase[] = [
  { id: "a", question: "q1", choices: ["X", "Y"], actualShare: { X: 0.4, Y: 0.6 } },
  { id: "b", question: "q2", choices: ["P", "Q"], actualShare: { P: 0.7, Q: 0.3 } },
];

describe("calibrate", () => {
  test("topChoice는 최대 점유 선택지", () => {
    expect(topChoice({ X: 0.4, Y: 0.6 })).toBe("Y");
  });

  test("완벽 예측 runner → 방향정확도 1, MAE 0", async () => {
    const runner = async (c: GroundTruthCase) => c.actualShare;
    const r = await backtest(cases, runner);
    expect(r.directionAccuracy).toBeCloseTo(1, 6);
    expect(r.shareMAE).toBeCloseTo(0, 6);
    expect(r.cases).toHaveLength(2);
  });

  test("방향 틀린 runner → 방향정확도 0", async () => {
    // 점유를 뒤집어 top을 반대로
    const runner = async (c: GroundTruthCase) => {
      const keys = Object.keys(c.actualShare);
      const vals = keys.map((k) => c.actualShare[k]).reverse();
      return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
    };
    const r = await backtest(cases, runner);
    expect(r.directionAccuracy).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/verify/calibrate.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 4: calibrate.ts 구현**

`src/verify/calibrate.ts`:
```ts
import { meanAbsoluteError, spearman } from "./scoring.js";

export interface GroundTruthCase {
  id: string;
  question: string;
  choices: string[];
  actualShare: Record<string, number>;
}
export interface CaseScore {
  id: string;
  predictedShare: Record<string, number>;
  rankCorrelation: number;
  shareMAE: number;
  directionHit: boolean;
}
export interface CalibrationReport {
  cases: CaseScore[];
  meanRankCorrelation: number;
  shareMAE: number;
  directionAccuracy: number;
}

export function topChoice(share: Record<string, number>): string | undefined {
  let best: string | undefined;
  let bestV = Number.NEGATIVE_INFINITY;
  for (const [k, v] of Object.entries(share)) {
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
}

export async function backtest(
  cases: GroundTruthCase[],
  runner: (c: GroundTruthCase) => Promise<Record<string, number>>,
): Promise<CalibrationReport> {
  const scored: CaseScore[] = [];
  for (const c of cases) {
    const predicted = await runner(c);
    // choices 순서로 정렬해 두 분포를 비교
    const pred = c.choices.map((k) => predicted[k] ?? 0);
    const actual = c.choices.map((k) => c.actualShare[k] ?? 0);
    scored.push({
      id: c.id,
      predictedShare: predicted,
      rankCorrelation: spearman(pred, actual),
      shareMAE: meanAbsoluteError(pred, actual),
      directionHit: topChoice(predicted) === topChoice(c.actualShare),
    });
  }
  const n = scored.length || 1;
  return {
    cases: scored,
    meanRankCorrelation: scored.reduce((s, c) => s + c.rankCorrelation, 0) / n,
    shareMAE: scored.reduce((s, c) => s + c.shareMAE, 0) / n,
    directionAccuracy: scored.filter((c) => c.directionHit).length / n,
  };
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/verify/calibrate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/verify/calibrate.ts src/verify/calibrate.test.ts eval/groundtruth/sample-cases.json
git commit -m "feat: 캘리브레이션 백테스트 + groundtruth 샘플 픽스처"
```

---

### Task 3: 마크다운 성적표 (report.ts)

**Files:**
- Create: `src/verify/report.ts`, `src/verify/report.test.ts`

**Interfaces:**
- Consumes: `StudyResult` (`../types.js`), `CalibrationReport` (`./calibrate.js`)
- Produces:
  - `interface ReportInput { title: string; result?: StudyResult; calibration?: CalibrationReport }`
  - `function renderMarkdownReport(input: ReportInput): string` — 제목, 전체 신호(🔴/🟢)+분산, 세그먼트별 신호 표, 분열(🔴) 세그먼트를 "여기 조사 권장"으로 강조, 캘리브레이션이 있으면 fidelity 숫자(평균 순위상관/MAE/방향정확도)와 사례별 행을 포함한 마크다운 문자열.

- [ ] **Step 1: 실패 테스트 작성**

`src/verify/report.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import type { StudyResult } from "../types.js";
import type { CalibrationReport } from "./calibrate.js";
import { renderMarkdownReport } from "./report.js";

const result: StudyResult = {
  responses: [],
  signal: "split",
  dispersion: 0.91,
  bySegment: {
    age: {
      "20대": { signal: "consensus", breakdown: { 쓴다: 10 } },
      "40대": { signal: "consensus", breakdown: { 안쓴다: 10 } },
    },
  },
};
const calibration: CalibrationReport = {
  cases: [{ id: "milkkit", predictedShare: { 쓴다: 0.5, 안쓴다: 0.5 }, rankCorrelation: 1, shareMAE: 0.08, directionHit: true }],
  meanRankCorrelation: 0.74,
  shareMAE: 0.08,
  directionAccuracy: 1,
};

describe("renderMarkdownReport", () => {
  test("제목과 전체 신호를 포함한다", () => {
    const md = renderMarkdownReport({ title: "밀키트 컨셉", result });
    expect(md).toContain("# 밀키트 컨셉");
    expect(md).toContain("🔴");
    expect(md).toContain("0.91");
  });
  test("세그먼트 표와 분열 강조를 포함한다", () => {
    const md = renderMarkdownReport({ title: "t", result });
    expect(md).toContain("age");
    expect(md).toContain("20대");
  });
  test("캘리브레이션이 있으면 fidelity 숫자를 포함한다", () => {
    const md = renderMarkdownReport({ title: "t", result, calibration });
    expect(md).toContain("0.74"); // mean rank correlation
    expect(md).toMatch(/방향 정확도|directionAccuracy|100%/);
  });
  test("result도 calibration도 없으면 안내 문구", () => {
    const md = renderMarkdownReport({ title: "t" });
    expect(md).toContain("# t");
    expect(md.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/verify/report.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: report.ts 구현**

`src/verify/report.ts`:
```ts
import type { StudyResult } from "../types.js";
import type { CalibrationReport } from "./calibrate.js";

export interface ReportInput {
  title: string;
  result?: StudyResult;
  calibration?: CalibrationReport;
}

const dot = (s: string) => (s === "split" ? "🔴" : "🟢");
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function renderResult(result: StudyResult): string {
  const lines: string[] = [];
  lines.push(`## 종합 신호`);
  lines.push("");
  lines.push(`- 전체: ${dot(result.signal)} **${result.signal}** (분산 ${result.dispersion.toFixed(2)})`);
  lines.push("");
  for (const [dim, segs] of Object.entries(result.bySegment)) {
    lines.push(`### ${dim}별`);
    lines.push("");
    lines.push("| 세그먼트 | 신호 | 분포 |");
    lines.push("|---|---|---|");
    for (const [val, s] of Object.entries(segs)) {
      const bd = Object.entries(s.breakdown).map(([k, v]) => `${k}=${v}`).join(", ");
      lines.push(`| ${val} | ${dot(s.signal)} ${s.signal} | ${bd} |`);
    }
    lines.push("");
  }
  const split = Object.entries(result.bySegment).flatMap(([dim, segs]) =>
    Object.entries(segs).filter(([, s]) => s.signal === "split").map(([val]) => `${dim}=${val}`),
  );
  if (split.length) {
    lines.push(`> 🔴 **여기 조사 권장:** ${split.join(", ")} — 의견이 갈리므로 진짜 조사를 조준하세요.`);
    lines.push("");
  }
  return lines.join("\n");
}

function renderCalibration(cal: CalibrationReport): string {
  const lines: string[] = [];
  lines.push(`## 캘리브레이션 (fidelity)`);
  lines.push("");
  lines.push(`- 평균 순위상관: **${cal.meanRankCorrelation.toFixed(2)}**`);
  lines.push(`- 점유 MAE: **${cal.shareMAE.toFixed(2)}**`);
  lines.push(`- 방향 정확도: **${pct(cal.directionAccuracy)}**`);
  lines.push("");
  if (cal.cases.length) {
    lines.push("| 사례 | 순위상관 | MAE | 방향적중 |");
    lines.push("|---|---|---|---|");
    for (const c of cal.cases) {
      lines.push(`| ${c.id} | ${c.rankCorrelation.toFixed(2)} | ${c.shareMAE.toFixed(2)} | ${c.directionHit ? "✅" : "❌"} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderMarkdownReport(input: ReportInput): string {
  const parts: string[] = [`# ${input.title}`, ""];
  if (input.result) parts.push(renderResult(input.result));
  if (input.calibration) parts.push(renderCalibration(input.calibration));
  if (!input.result && !input.calibration) parts.push("_표시할 결과가 없습니다._");
  return parts.join("\n");
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/verify/report.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/verify/report.ts src/verify/report.test.ts
git commit -m "feat: 마크다운 성적표 렌더 (신호+세그먼트+fidelity)"
```

---

### Task 4: 공개 API 노출 + 캘리브레이션 데모 스크립트

**Files:**
- Modify: `src/index.ts`
- Create: `eval/calibrate-demo.ts`, `eval/calibrate-demo.test.ts`
- Modify: `package.json` (scripts), `tsup.config.ts` (entry), `vitest.config.ts` (include), `tsconfig.json` (include)

**Interfaces:**
- Consumes: `backtest`, `GroundTruthCase`, `renderMarkdownReport`, `runStudy`, `SampleSource`, `MockProvider`, `spearman`/등
- Produces:
  - `function loadCases(json: unknown): GroundTruthCase[]` (in `eval/calibrate-demo.ts`) — `{cases:[...]}` 형태 파싱.
  - `async function runDemo(): Promise<string>` — 샘플 픽스처를 로드해 mock 기반 runner로 backtest → renderMarkdownReport 문자열 반환(키 없이 결정적).

- [ ] **Step 1: 실패 테스트 작성**

`eval/calibrate-demo.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { loadCases, runDemo } from "./calibrate-demo.js";

describe("calibrate-demo", () => {
  test("loadCases는 cases 배열을 파싱한다", () => {
    const cs = loadCases({ cases: [{ id: "x", question: "q", choices: ["A", "B"], actualShare: { A: 0.5, B: 0.5 } }] });
    expect(cs).toHaveLength(1);
    expect(cs[0].id).toBe("x");
  });
  test("runDemo는 마크다운 성적표 문자열을 만든다(키 불필요)", async () => {
    const md = await runDemo();
    expect(md).toContain("# ");
    expect(md).toContain("캘리브레이션");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run eval/calibrate-demo.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: index.ts export 추가**

`src/index.ts`에 아래 export 블록을 추가(기존 export 아래):
```ts
export { spearman, meanAbsoluteError, brierScore, intervalCoverage } from "./verify/scoring.js";
export { backtest, topChoice, type GroundTruthCase, type CaseScore, type CalibrationReport } from "./verify/calibrate.js";
export { renderMarkdownReport, type ReportInput } from "./verify/report.js";
```

- [ ] **Step 4: calibrate-demo.ts 구현**

`eval/calibrate-demo.ts`:
```ts
// groundtruth는 정적 JSON import로 번들에 인라인 → vitest와 빌드된 dist 모두에서
// cwd/레이아웃 독립으로 동작 (SampleSource와 동일 전략; 런타임 파일읽기 금지).
import casesJson from "./groundtruth/sample-cases.json" with { type: "json" };
import { SampleSource } from "../src/data/sample-source.js";
import { MockProvider } from "../src/llm/mock.js";
import { runStudy } from "../src/study.js";
import { type GroundTruthCase, backtest } from "../src/verify/calibrate.js";
import { renderMarkdownReport } from "../src/verify/report.js";

export function loadCases(json: unknown): GroundTruthCase[] {
  const obj = json as { cases?: GroundTruthCase[] };
  return obj.cases ?? [];
}

// 데모용: 연령으로 갈리는 결정적 mock으로 각 사례의 예측 점유를 산출
async function predictShare(c: GroundTruthCase): Promise<Record<string, number>> {
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
  return renderMarkdownReport({ title: "synth-persona 캘리브레이션 데모", calibration });
}

if (process.argv[1]?.endsWith("calibrate-demo.ts") || process.argv[1]?.endsWith("calibrate-demo.js")) {
  runDemo().then((md) => console.log(md));
}
```

- [ ] **Step 5: 빌드/테스트 설정 + 스크립트 추가**

`package.json`의 `scripts`에 추가:
```json
"calibrate:demo": "node dist/eval/calibrate-demo.js"
```

`tsup.config.ts`의 `entry` 배열에 `"eval/calibrate-demo.ts"` 추가(빌드 산출물 생성용). 예:
```ts
entry: ["src/index.ts", "cli/main.ts", "eval/calibrate-demo.ts"],
```

`vitest.config.ts`의 `include`에 eval 테스트를 추가(전체 스위트/CI에 포함되도록):
```ts
include: ["src/**/*.test.ts", "test/**/*.test.ts", "eval/**/*.test.ts"],
```

`tsconfig.json`의 `include`에 `"eval"`을 추가(타입 인식용):
```json
"include": ["src", "cli", "test", "eval"]
```

- [ ] **Step 6: 테스트 실행 → 통과 확인**

Run: `npx vitest run eval/calibrate-demo.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: 전체 게이트 + 빌드된 데모 확인**

Run: `npm run lint && npm test && npm run build`
Expected: 모두 통과(초록불). `npm test`가 `eval/calibrate-demo.test.ts`를 포함(전체 카운트 증가).

그다음 **빌드된 데모를 실제로 실행**해 dist에서도 동작하는지 확인(정적 JSON import 검증):
Run: `node dist/eval/calibrate-demo.js`
Expected: "# synth-persona 캘리브레이션 데모" + "캘리브레이션 (fidelity)" 섹션이 출력되고 에러 없음(키 불필요).

- [ ] **Step 8: 커밋**

```bash
git add src/index.ts eval/calibrate-demo.ts eval/calibrate-demo.test.ts package.json tsup.config.ts vitest.config.ts tsconfig.json
git commit -m "feat: 캘리브레이션 데모 스크립트 + 공개 API 노출"
```

---

## Self-Review

**Spec coverage (검증 계층 5 + 성적표 대비):**
- 통계 채점(Spearman/MAE/Brier/coverage) → Task 1 ✅
- groundtruth 백테스트 → fidelity 지표 → Task 2 ✅
- 통합 성적표(마크다운) → Task 3 ✅
- 공개 API + 키 없는 데모 → Task 4 ✅
- 계층 3(편향 탐침)·4(강건성/뮤테이션)·6(드리프트/예산) → **Plan 2B로 이월**(의도된 분할). report.ts는 추후 그 결과를 흡수하도록 확장 가능(현재는 study+calibration).

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. groundtruth 픽스처는 "illustrative seed only"로 명시(실데이터는 누적).

**Type consistency:** `GroundTruthCase`/`CaseScore`/`CalibrationReport`(Task 2 정의) ↔ Task 3·4 소비 일치. `renderMarkdownReport(ReportInput)` 시그니처 Task 3·4 일치. `StudyResult`/`SegmentResult`는 기존 types.ts 재사용(중복 없음). index.ts export 이름은 각 모듈 실제 export와 일치.

**남은 메모:** `eval/calibrate-demo.ts`는 `dist/eval/calibrate-demo.js`로 빌드되며 SampleSource의 정적 JSON import 덕에 cwd-독립. groundtruth 픽스처는 `import.meta.url` 기준 로드.

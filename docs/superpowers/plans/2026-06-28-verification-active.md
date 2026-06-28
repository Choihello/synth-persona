# Verification: Active Checks (Plan 2B — probes, robustness, mutation, governance)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "LLM이 어떻게 틀리는지"를 능동적으로 점검하는 검증 계층을 추가한다 — 편향 탐침(계층3), 강건성 섭동/뮤테이션(계층4), 드리프트·예산 거버넌스(계층6), 그리고 이들을 하나의 마크다운 성적표로 묶는다.

**Architecture:** 순수 분석 함수(probes, governance) + 주입 runner 기반 섭동 검사(robustness, LLM 비의존 테스트). 결과를 `harness-report.ts`가 마크다운으로 렌더. 뮤테이션 테스트는 Stryker로 순수 코어에만 적용하고 별도 스크립트로 분리(느려서 기본 CI 제외).

**Tech Stack:** TypeScript, Node 24(ESM), vitest, fast-check(기존). 신규 devDependency: `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`. 런타임 외부 의존성 추가 없음.

## Global Constraints

- 런타임 외부 의존성은 `@anthropic-ai/sdk` 하나뿐. 신규 검증 모듈은 무의존(Node 내장 + 기존 내부 모듈만).
- 키 없이 `npm install && npm test`가 항상 초록불. 새 테스트는 주입 runner/순수 데이터만(LLM/네트워크 없음).
- 뮤테이션 테스트(`npm run test:mutation`)는 기본 `npm test`/CI 게이트에 포함하지 않는다(온디맨드).
- 언어 TypeScript, ESM, 들여쓰기 2칸. 무작위성은 시드 주입으로 결정적.
- 기존 타입/함수 재사용: `StudyResult`/`SegmentResult`(`src/types.ts`), `normalizedEntropy`(`src/aggregate/uncertainty.ts`), `topChoice`/`CalibrationReport`(`src/verify/calibrate.ts`). 중복 정의 금지.
- 빌드 임포트는 `.js` 확장자로 `.ts`를 가리킨다.

---

### Task 1: 편향 탐침 (probes.ts)

**Files:**
- Create: `src/verify/probes.ts`, `src/verify/probes.test.ts`

**Interfaces:**
- Consumes: `normalizedEntropy` (`../aggregate/uncertainty.js`)
- Produces:
  - `function selfConsistency(answersPerPersona: string[][]): number` — 페르소나별 반복답의 최빈답 비율 평균(1=완전일관, 빈 입력→1).
  - `function modeCollapseFlag(tallies: Array<Record<string, number>>, threshold?: number): { meanDispersion: number; collapsed: boolean }` — 여러 질문 tally의 평균 정규화엔트로피가 임계(기본 0.15) 미만이면 평균회귀/모드붕괴 의심.
  - `function positivitySkew(tally: Record<string, number>, positiveChoice: string): number` — 긍정 선택지가 우연수준(1/k)보다 과선택된 정도(0=우연, 1=전원 긍정). 예스맨 편향 지표.

- [ ] **Step 1: 실패 테스트 작성**

`src/verify/probes.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { modeCollapseFlag, positivitySkew, selfConsistency } from "./probes.js";

describe("probes", () => {
  test("selfConsistency: 최빈답 비율 평균", () => {
    // persona1: A,A,B → 2/3 ; persona2: X,X,X → 1
    expect(selfConsistency([["A", "A", "B"], ["X", "X", "X"]])).toBeCloseTo(5 / 6, 6);
  });
  test("selfConsistency: 빈 입력 → 1", () => {
    expect(selfConsistency([])).toBe(1);
  });
  test("modeCollapseFlag: 전원 동일 응답이면 collapsed", () => {
    const r = modeCollapseFlag([{ A: 10 }, { B: 10 }]);
    expect(r.meanDispersion).toBeCloseTo(0, 6);
    expect(r.collapsed).toBe(true);
  });
  test("modeCollapseFlag: 갈린 응답이면 collapsed=false", () => {
    const r = modeCollapseFlag([{ A: 5, B: 5 }, { X: 5, Y: 5 }]);
    expect(r.meanDispersion).toBeCloseTo(1, 6);
    expect(r.collapsed).toBe(false);
  });
  test("positivitySkew: 전원 긍정 → 1, 우연(균등) → 0", () => {
    expect(positivitySkew({ yes: 10, no: 0 }, "yes")).toBeCloseTo(1, 6);
    expect(positivitySkew({ yes: 5, no: 5 }, "yes")).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/verify/probes.test.ts`
Expected: FAIL ("Cannot find module './probes.js'")

- [ ] **Step 3: probes.ts 구현**

`src/verify/probes.ts`:
```ts
import { normalizedEntropy } from "../aggregate/uncertainty.js";

export function selfConsistency(answersPerPersona: string[][]): number {
  if (answersPerPersona.length === 0) return 1;
  let sum = 0;
  for (const answers of answersPerPersona) {
    if (answers.length === 0) {
      sum += 1;
      continue;
    }
    const counts: Record<string, number> = {};
    for (const a of answers) counts[a] = (counts[a] ?? 0) + 1;
    const mode = Math.max(...Object.values(counts));
    sum += mode / answers.length;
  }
  return sum / answersPerPersona.length;
}

export function modeCollapseFlag(
  tallies: Array<Record<string, number>>,
  threshold = 0.15,
): { meanDispersion: number; collapsed: boolean } {
  if (tallies.length === 0) return { meanDispersion: 0, collapsed: false };
  let sum = 0;
  for (const t of tallies) sum += normalizedEntropy(Object.values(t));
  const meanDispersion = sum / tallies.length;
  return { meanDispersion, collapsed: meanDispersion < threshold };
}

export function positivitySkew(tally: Record<string, number>, positiveChoice: string): number {
  const total = Object.values(tally).reduce((s, v) => s + v, 0);
  const k = Object.keys(tally).length;
  if (total === 0 || k < 2) return 0;
  const observed = (tally[positiveChoice] ?? 0) / total;
  const chance = 1 / k;
  if (observed <= chance) return 0;
  return (observed - chance) / (1 - chance);
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/verify/probes.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/verify/probes.ts src/verify/probes.test.ts
git commit -m "feat: 편향 탐침 (self-consistency/mode-collapse/yea-saying)"
```

---

### Task 2: 강건성 섭동 검사 (robustness.ts)

**Files:**
- Create: `src/verify/robustness.ts`, `src/verify/robustness.test.ts`

**Interfaces:**
- Consumes: `topChoice` (`./calibrate.js`)
- Produces:
  - `type ShareRunner = (prompt: string, choices: string[]) => Promise<Record<string, number>>` — 질문+선택지로 예측 점유를 내는 함수(테스트는 결정적 주입).
  - `async function paraphraseStability(runner: ShareRunner, prompts: string[], choices: string[]): Promise<{ tops: Array<string | undefined>; stable: boolean }>` — 패러프레이즈들의 top-choice가 모두 같으면 stable.
  - `async function orderBias(runner: ShareRunner, prompt: string, choices: string[]): Promise<{ forwardTop?: string; reversedTop?: string; biased: boolean }>` — 선택지 정·역순의 top이 다르면 순서편향.
  - `async function attributeSensitivity(runWith: ShareRunner, runWithout: ShareRunner, prompt: string, choices: string[]): Promise<{ withTop?: string; withoutTop?: string; changed: boolean }>` — 속성 유무로 top이 바뀌면 민감(속성이 영향).

- [ ] **Step 1: 실패 테스트 작성**

`src/verify/robustness.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { attributeSensitivity, orderBias, paraphraseStability, type ShareRunner } from "./robustness.js";

describe("robustness", () => {
  test("paraphraseStability: 모든 패러프레이즈 top 동일 → stable", async () => {
    const runner: ShareRunner = async () => ({ A: 0.7, B: 0.3 });
    const r = await paraphraseStability(runner, ["q1", "q1 다르게", "q1 또"], ["A", "B"]);
    expect(r.stable).toBe(true);
    expect(r.tops).toEqual(["A", "A", "A"]);
  });
  test("paraphraseStability: top 흔들리면 unstable", async () => {
    let call = 0;
    const runner: ShareRunner = async () => (call++ === 0 ? { A: 0.7, B: 0.3 } : { A: 0.3, B: 0.7 });
    const r = await paraphraseStability(runner, ["q", "q2"], ["A", "B"]);
    expect(r.stable).toBe(false);
  });
  test("orderBias: 순서 무관 runner → biased=false", async () => {
    const runner: ShareRunner = async () => ({ A: 0.7, B: 0.3 });
    const r = await orderBias(runner, "q", ["A", "B"]);
    expect(r.biased).toBe(false);
  });
  test("orderBias: 항상 첫 선택지를 고르는 runner → biased=true", async () => {
    const runner: ShareRunner = async (_p, choices) => ({ [choices[0]]: 1 });
    const r = await orderBias(runner, "q", ["A", "B"]);
    expect(r.forwardTop).toBe("A");
    expect(r.reversedTop).toBe("B");
    expect(r.biased).toBe(true);
  });
  test("attributeSensitivity: top 바뀌면 changed=true", async () => {
    const withRunner: ShareRunner = async () => ({ A: 0.8, B: 0.2 });
    const withoutRunner: ShareRunner = async () => ({ A: 0.2, B: 0.8 });
    const r = await attributeSensitivity(withRunner, withoutRunner, "q", ["A", "B"]);
    expect(r.changed).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/verify/robustness.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: robustness.ts 구현**

`src/verify/robustness.ts`:
```ts
import { topChoice } from "./calibrate.js";

export type ShareRunner = (prompt: string, choices: string[]) => Promise<Record<string, number>>;

export async function paraphraseStability(
  runner: ShareRunner,
  prompts: string[],
  choices: string[],
): Promise<{ tops: Array<string | undefined>; stable: boolean }> {
  const tops: Array<string | undefined> = [];
  for (const p of prompts) tops.push(topChoice(await runner(p, choices)));
  const stable = tops.every((t) => t === tops[0]);
  return { tops, stable };
}

export async function orderBias(
  runner: ShareRunner,
  prompt: string,
  choices: string[],
): Promise<{ forwardTop?: string; reversedTop?: string; biased: boolean }> {
  const forwardTop = topChoice(await runner(prompt, choices));
  const reversedTop = topChoice(await runner(prompt, [...choices].reverse()));
  return { forwardTop, reversedTop, biased: forwardTop !== reversedTop };
}

export async function attributeSensitivity(
  runWith: ShareRunner,
  runWithout: ShareRunner,
  prompt: string,
  choices: string[],
): Promise<{ withTop?: string; withoutTop?: string; changed: boolean }> {
  const withTop = topChoice(await runWith(prompt, choices));
  const withoutTop = topChoice(await runWithout(prompt, choices));
  return { withTop, withoutTop, changed: withTop !== withoutTop };
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/verify/robustness.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/verify/robustness.ts src/verify/robustness.test.ts
git commit -m "feat: 강건성 섭동 검사 (패러프레이즈/순서편향/속성민감도)"
```

---

### Task 3: 거버넌스 (governance.ts — 결정성·예산·드리프트)

**Files:**
- Create: `src/verify/governance.ts`, `src/verify/governance.test.ts`

**Interfaces:**
- Consumes: `StudyResult` (`../types.js`), `CalibrationReport` (`./calibrate.js`)
- Produces:
  - `function determinismGate(a: StudyResult, b: StudyResult): boolean` — 두 결과의 (signal, dispersion, bySegment) 구조가 동일한지.
  - `interface Usage { tokens: number; ms: number }`
  - `interface Budget { maxTokens: number; maxMs: number }`
  - `function costBudgetCheck(usage: Usage, budget: Budget): { withinBudget: boolean; tokenOver: boolean; latencyOver: boolean }`
  - `function driftDiff(prev: CalibrationReport, curr: CalibrationReport, threshold?: number): { rankCorrelationDelta: number; directionAccuracyDelta: number; regressed: boolean }` — fidelity가 임계(기본 0.1) 이상 하락하면 regressed.

- [ ] **Step 1: 실패 테스트 작성**

`src/verify/governance.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import type { StudyResult } from "../types.js";
import type { CalibrationReport } from "./calibrate.js";
import { costBudgetCheck, determinismGate, driftDiff } from "./governance.js";

const mk = (dispersion: number): StudyResult => ({
  responses: [],
  signal: "split",
  dispersion,
  bySegment: { age: { "20대": { signal: "consensus", breakdown: { A: 5 } } } },
});

describe("governance", () => {
  test("determinismGate: 동일 구조 → true, 다르면 false", () => {
    expect(determinismGate(mk(0.9), mk(0.9))).toBe(true);
    expect(determinismGate(mk(0.9), mk(0.8))).toBe(false);
  });
  test("costBudgetCheck", () => {
    expect(costBudgetCheck({ tokens: 100, ms: 500 }, { maxTokens: 200, maxMs: 1000 }).withinBudget).toBe(true);
    const over = costBudgetCheck({ tokens: 300, ms: 500 }, { maxTokens: 200, maxMs: 1000 });
    expect(over.withinBudget).toBe(false);
    expect(over.tokenOver).toBe(true);
    expect(over.latencyOver).toBe(false);
  });
  test("driftDiff: fidelity 하락 → regressed", () => {
    const prev: CalibrationReport = { cases: [], meanRankCorrelation: 0.8, shareMAE: 0.1, directionAccuracy: 0.9 };
    const curr: CalibrationReport = { cases: [], meanRankCorrelation: 0.5, shareMAE: 0.2, directionAccuracy: 0.6 };
    const d = driftDiff(prev, curr);
    expect(d.directionAccuracyDelta).toBeCloseTo(-0.3, 6);
    expect(d.regressed).toBe(true);
  });
  test("driftDiff: 안정 → regressed=false", () => {
    const r: CalibrationReport = { cases: [], meanRankCorrelation: 0.8, shareMAE: 0.1, directionAccuracy: 0.9 };
    expect(driftDiff(r, r).regressed).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/verify/governance.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: governance.ts 구현**

`src/verify/governance.ts`:
```ts
import type { StudyResult } from "../types.js";
import type { CalibrationReport } from "./calibrate.js";

export function determinismGate(a: StudyResult, b: StudyResult): boolean {
  const project = (r: StudyResult) => JSON.stringify({ signal: r.signal, dispersion: r.dispersion, bySegment: r.bySegment });
  return project(a) === project(b);
}

export interface Usage {
  tokens: number;
  ms: number;
}
export interface Budget {
  maxTokens: number;
  maxMs: number;
}

export function costBudgetCheck(usage: Usage, budget: Budget): { withinBudget: boolean; tokenOver: boolean; latencyOver: boolean } {
  const tokenOver = usage.tokens > budget.maxTokens;
  const latencyOver = usage.ms > budget.maxMs;
  return { withinBudget: !tokenOver && !latencyOver, tokenOver, latencyOver };
}

export function driftDiff(
  prev: CalibrationReport,
  curr: CalibrationReport,
  threshold = 0.1,
): { rankCorrelationDelta: number; directionAccuracyDelta: number; regressed: boolean } {
  const rankCorrelationDelta = curr.meanRankCorrelation - prev.meanRankCorrelation;
  const directionAccuracyDelta = curr.directionAccuracy - prev.directionAccuracy;
  const regressed = rankCorrelationDelta < -threshold || directionAccuracyDelta < -threshold;
  return { rankCorrelationDelta, directionAccuracyDelta, regressed };
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/verify/governance.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/verify/governance.ts src/verify/governance.test.ts
git commit -m "feat: 거버넌스 (결정성 게이트/비용 예산/드리프트 diff)"
```

---

### Task 4: 통합 하네스 성적표 (harness-report.ts) + 공개 API

**Files:**
- Create: `src/verify/harness-report.ts`, `src/verify/harness-report.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: probes/robustness/governance의 결과 타입들
- Produces:
  - `interface HarnessFindings { selfConsistency?: number; modeCollapse?: { meanDispersion: number; collapsed: boolean }; paraphraseStable?: boolean; orderBiased?: boolean; drift?: { regressed: boolean; directionAccuracyDelta: number } }`
  - `function renderHarnessReport(title: string, f: HarnessFindings): string` — 각 점검 결과를 ✅/⚠️ 와 함께 마크다운 섹션으로. 문제(모드붕괴·순서편향·드리프트 회귀·낮은 자기일관성)는 ⚠️로 강조.
  - `src/index.ts`에서 probes/robustness/governance/harness-report 전부 export.

- [ ] **Step 1: 실패 테스트 작성**

`src/verify/harness-report.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { renderHarnessReport } from "./harness-report.js";

describe("renderHarnessReport", () => {
  test("정상 점검 → ✅ 포함, 제목 포함", () => {
    const md = renderHarnessReport("점검", {
      selfConsistency: 0.95,
      modeCollapse: { meanDispersion: 0.6, collapsed: false },
      paraphraseStable: true,
      orderBiased: false,
    });
    expect(md).toContain("# 점검");
    expect(md).toContain("✅");
  });
  test("문제 발견 → ⚠️ 강조", () => {
    const md = renderHarnessReport("점검", {
      modeCollapse: { meanDispersion: 0.05, collapsed: true },
      orderBiased: true,
      drift: { regressed: true, directionAccuracyDelta: -0.3 },
    });
    expect(md).toContain("⚠️");
    expect(md.toLowerCase()).toContain("모드");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/verify/harness-report.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: harness-report.ts 구현**

`src/verify/harness-report.ts`:
```ts
export interface HarnessFindings {
  selfConsistency?: number;
  modeCollapse?: { meanDispersion: number; collapsed: boolean };
  paraphraseStable?: boolean;
  orderBiased?: boolean;
  drift?: { regressed: boolean; directionAccuracyDelta: number };
}

const mark = (ok: boolean) => (ok ? "✅" : "⚠️");

export function renderHarnessReport(title: string, f: HarnessFindings): string {
  const lines: string[] = [`# ${title}`, "", "## 검증 하네스 점검", ""];
  if (f.selfConsistency !== undefined) {
    lines.push(`- ${mark(f.selfConsistency >= 0.8)} 자기일관성: ${f.selfConsistency.toFixed(2)}`);
  }
  if (f.modeCollapse) {
    lines.push(`- ${mark(!f.modeCollapse.collapsed)} 모드붕괴(평균회귀): 분산 ${f.modeCollapse.meanDispersion.toFixed(2)}${f.modeCollapse.collapsed ? " — ⚠️ 응답이 지나치게 균일(평균회귀 의심)" : ""}`);
  }
  if (f.paraphraseStable !== undefined) {
    lines.push(`- ${mark(f.paraphraseStable)} 패러프레이즈 안정성: ${f.paraphraseStable ? "안정" : "⚠️ 표현 바꾸면 결과 흔들림"}`);
  }
  if (f.orderBiased !== undefined) {
    lines.push(`- ${mark(!f.orderBiased)} 순서 편향: ${f.orderBiased ? "⚠️ 선택지 순서가 결과를 바꿈" : "없음"}`);
  }
  if (f.drift) {
    lines.push(`- ${mark(!f.drift.regressed)} 드리프트: 방향정확도 Δ ${f.drift.directionAccuracyDelta.toFixed(2)}${f.drift.regressed ? " — ⚠️ fidelity 회귀" : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}
```

- [ ] **Step 4: index.ts export 추가**

`src/index.ts`에 추가(기존 verify export 아래):
```ts
export { selfConsistency, modeCollapseFlag, positivitySkew } from "./verify/probes.js";
export { paraphraseStability, orderBias, attributeSensitivity, type ShareRunner } from "./verify/robustness.js";
export { determinismGate, costBudgetCheck, driftDiff, type Usage, type Budget } from "./verify/governance.js";
export { renderHarnessReport, type HarnessFindings } from "./verify/harness-report.js";
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/verify/harness-report.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: 전체 게이트**

Run: `npm run lint && npm test && npm run build`
Expected: 모두 통과(초록불). 새 모듈 테스트가 전체 스위트에 포함.

- [ ] **Step 7: 커밋**

```bash
git add src/verify/harness-report.ts src/verify/harness-report.test.ts src/index.ts
git commit -m "feat: 통합 하네스 성적표 + 공개 API 노출"
```

---

### Task 5: 뮤테이션 테스트 (Stryker, 순수 코어 한정)

**Files:**
- Create: `stryker.conf.json`
- Modify: `package.json` (devDependencies + script)

**Interfaces:**
- Consumes: 기존 순수 모듈(`src/verify/scoring.ts`, `src/personas/ipf.ts`, `src/aggregate/uncertainty.ts`)과 그 테스트
- Produces: `npm run test:mutation` — Stryker가 위 순수 코어를 뮤테이션해 테스트가 버그를 잡는지 점수화. 기본 CI 게이트엔 미포함(온디맨드).

- [ ] **Step 1: 의존성 설치**

Run: `npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner`
Expected: devDependencies에 두 패키지 추가, 설치 성공.

- [ ] **Step 2: Stryker 설정 작성**

`stryker.conf.json`:
```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "mutate": [
    "src/verify/scoring.ts",
    "src/personas/ipf.ts",
    "src/aggregate/uncertainty.ts"
  ],
  "thresholds": { "high": 80, "low": 60, "break": 0 },
  "timeoutMS": 60000
}
```

`package.json`의 `scripts`에 추가:
```json
"test:mutation": "stryker run"
```

- [ ] **Step 3: 뮤테이션 실행 (실제 동작 확인)**

Run: `npm run test:mutation`
Expected: Stryker가 위 3개 파일을 뮤테이션하고 mutation score(예: "Mutation score: NN%")를 출력하며 정상 종료. 점수는 참고치이며 `break: 0`이라 실패로 종료되지 않는다. (실행이 과도하게 느리면 `mutate`를 `src/verify/scoring.ts` 하나로 좁히고 그 사유를 리포트에 기록.)

- [ ] **Step 4: 기본 게이트가 영향받지 않는지 확인**

Run: `npm run lint && npm test && npm run build`
Expected: 모두 통과. `npm test`는 여전히 vitest만 돌고 Stryker는 별도(`test:mutation`)로 분리됨.

- [ ] **Step 5: 커밋**

```bash
git add stryker.conf.json package.json package-lock.json
git commit -m "test: Stryker 뮤테이션 테스트 (순수 코어, 온디맨드 스크립트)"
```

---

## Self-Review

**Spec coverage (검증 계층 3·4·6 대비):**
- 계층3 편향 탐침(예스맨/평균회귀/자기일관성) → Task 1 ✅
- 계층4 강건성(패러프레이즈/순서/속성절제) → Task 2 ✅; 뮤테이션 → Task 5 ✅
- 계층6 거버넌스(결정성 게이트/비용 예산/드리프트) → Task 3 ✅
- 통합 성적표 → Task 4 ✅(harness-report; 2A의 report.ts와 별도 — study/calibration 성적표는 report.ts, 능동 점검 성적표는 harness-report.ts)
- 계층5(외부 벤치마크)는 Plan 2A에서 완료. 라이브 KOSIS·웹 UI는 별도.

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. Task 5는 외부 도구라 "느리면 scope 축소" 분기를 명시(플레이스홀더 아님, 실행 가이드).

**Type consistency:** `ShareRunner`(Task 2)·`HarnessFindings`(Task 4) 일관. `topChoice`/`normalizedEntropy`/`CalibrationReport`/`StudyResult`는 기존 모듈에서 import(재정의 없음). index.ts export 이름은 각 모듈 실제 export와 일치(probes: selfConsistency/modeCollapseFlag/positivitySkew; robustness: paraphraseStability/orderBias/attributeSensitivity/ShareRunner; governance: determinismGate/costBudgetCheck/driftDiff/Usage/Budget; harness-report: renderHarnessReport/HarnessFindings).

**남은 메모:** Stryker는 vitest-runner로 동작하며 기본 게이트와 분리. mutation score는 참고치(break:0).

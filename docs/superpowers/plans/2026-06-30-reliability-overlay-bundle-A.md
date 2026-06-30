# 신뢰성 오버레이 (묶음 A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통계청 합성 인구 기반 시장조사 결과(`StudyResult`)에 키 없이 정직한 신뢰성 카드(1·2·4층 + 3층 자리)를 덧입히는 read-only 오버레이를 추가한다.

**Architecture:** 코어 타입·`aggregate`를 건드리지 않는 순수 함수 오버레이. 새 모듈 `src/assess/`가 `StudyResult`(+선택적 fidelity/bridges)를 *읽기만* 하여 `ReliabilityCard`를 파생하고, 별도 렌더러가 1층(구성)과 2층(LLM 응답)을 시각적으로 분리해 마크다운으로 출력한다. 기존 89 테스트 불변.

**Tech Stack:** TypeScript (Node 24 ESM, 네이티브 TS), vitest, biome, tsup. 런타임 외부 의존성 추가 없음.

## Global Constraints

- 런타임 외부 의존성은 `@anthropic-ai/sdk` 단 하나 — **새 의존성 추가 금지**.
- 코어 타입(`src/types.ts`)·`aggregate`(`src/aggregate/uncertainty.ts`) **수정 금지** (read-only 오버레이).
- 기존 **89 테스트 불변**, `npm run lint`(biome)·`npx tsc --noEmit`·`npm run build` 그린 유지.
- 모든 응답 숫자는 **synthetic panel response**로 라벨 — "구매율/구매의향/시장 예측" 단정 금지.
- 1층(구성)과 2층(LLM 응답)을 출력에서 **시각적으로 분리**.
- provenance 매핑: `matched`→high, `conditioned`→medium, `inferred`→low, 없음→unknown. **conditioned/inferred 결론 = 저확신**.
- 시장판단(4층)은 점수가 아니라 **부정형 가드레일**만.
- "완전 5-way joint" 비주장 · `Persona.weight`·provenance·householder bridge·suppressed(X)≠structural zero(-) 불변식 유지.
- import 경로는 `.js` 확장자 (ESM, 기존 코드 관례). 파일은 `npm run format`으로 biome 정렬.

---

## File Structure

- `src/assess/reliability.ts` — **신규**. `ReliabilityCard`·`AttributeReliability`·`Confidence` 타입 + `assessReliability()` 순수 함수.
- `src/assess/reliability.test.ts` — **신규**. 위 모듈 단위 테스트.
- `src/assess/reliability-report.ts` — **신규**. `renderReliabilityCard()` 마크다운 렌더러.
- `src/assess/reliability-report.test.ts` — **신규**. 렌더러 테스트.
- `src/verify/report.ts` — **수정**. `ReportInput`에 옵셔널 `reliability` 추가, 렌더에 결합.
- `src/verify/report.test.ts` — **수정**. reliability 섹션 결합 테스트 추가.
- `src/index.ts` — **수정**. 배럴 export 추가.
- `eval/reliability-demo.ts` — **신규**. census 합성인구 + mock LLM 기반 key-free 데모.
- `eval/reliability-demo.test.ts` — **신규**. 데모 출력 검증.
- `package.json` — **수정**. `reliability:demo` 스크립트 추가.

**범위 밖(묶음 B로 이월, 본 플랜 제외):** CLI(`cli/main.ts`) 배선 — 현재 CLI는 provenance 없는 `SampleSource`를 써서 카드가 전부 unknown이 됨. CLI는 묶음 B에서 `runStudy`에 `PersonaSource`(census)를 연결할 때 함께 처리한다.

---

### Task 1: `assessReliability` 순수 함수 + 타입

**Files:**
- Create: `src/assess/reliability.ts`
- Test: `src/assess/reliability.test.ts`

**Interfaces:**
- Consumes: `StudyResult`·`Provenance` (`src/types.js`), `FidelityReport` (`src/verify/fidelity.js`).
  - `StudyResult = { responses: { persona: { provenance?: Record<string,Provenance> }, ... }[]; bySegment: Record<string, Record<string, {signal,breakdown}>>; signal; dispersion; missing? }`
  - `FidelityReport.core = { provenance, mae: number, tvd: number, maxError }`
- Produces:
  - `type Confidence = "high" | "medium" | "low" | "unknown"`
  - `interface AttributeReliability { dim: string; provenance: Provenance | "unknown"; confidence: Confidence; note?: string }`
  - `interface ReliabilityCard { composition: { signal: "🟢"|"🔴"; mae: number; tvd: number } | null; attributes: AttributeReliability[]; responseConsistency: { status: "not-measured"; reason: string }; guardrails: string[]; missingAxes: string[] }`
  - `function assessReliability(result: StudyResult, ctx?: { fidelity?: FidelityReport; bridges?: Record<string,string>; priceCriticalAxes?: string[] }): ReliabilityCard`

- [ ] **Step 1: Write the failing test**

Create `src/assess/reliability.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { Response, StudyResult } from "../types.js";
import { assessReliability } from "./reliability.js";

function resp(attrs: Record<string, string>, prov: Record<string, string>): Response {
  return {
    persona: { id: "p", attrs, weight: 1, provenance: prov as never },
    answer: attrs.choice ?? "쓴다",
    choice: "쓴다",
  };
}

function studyWith(responses: Response[]): StudyResult {
  const dims = new Set<string>();
  for (const r of responses) for (const k of Object.keys(r.persona.attrs)) dims.add(k);
  const bySegment: StudyResult["bySegment"] = {};
  for (const d of dims) bySegment[d] = { x: { signal: "split", breakdown: { 쓴다: 1 } } };
  return { responses, signal: "split", dispersion: 1, bySegment };
}

describe("assessReliability", () => {
  test("provenance → confidence 매핑 (matched=high, conditioned=medium, inferred=low)", () => {
    const result = studyWith([
      resp({ 연령: "30대", 혼인: "미혼", 가구원수: "1명" }, { 연령: "matched", 혼인: "conditioned", 가구원수: "inferred" }),
    ]);
    const card = assessReliability(result);
    const byDim = Object.fromEntries(card.attributes.map((a) => [a.dim, a.confidence]));
    expect(byDim.연령).toBe("high");
    expect(byDim.혼인).toBe("medium");
    expect(byDim.가구원수).toBe("low");
  });

  test("provenance 없는 페르소나 → unknown", () => {
    const result = studyWith([resp({ age: "30대" }, {})]);
    const card = assessReliability(result);
    expect(card.attributes[0].provenance).toBe("unknown");
    expect(card.attributes[0].confidence).toBe("unknown");
    expect(card.guardrails.some((g) => g.includes("provenance 정보가 없습니다"))).toBe(true);
  });

  test("결핍 축 → missingAxes + 가격 가드레일", () => {
    const result = studyWith([resp({ 연령: "30대" }, { 연령: "matched" })]);
    const card = assessReliability(result);
    expect(card.missingAxes).toEqual(["소득", "직업", "자녀"]);
    expect(card.guardrails.some((g) => g.includes("가격·구매력 판단 부적합"))).toBe(true);
  });

  test("inferred 속성 → 저확신 가드레일", () => {
    const result = studyWith([resp({ 가구원수: "1명" }, { 가구원수: "inferred" })]);
    const card = assessReliability(result);
    expect(card.guardrails.some((g) => g.includes("저확신 속성"))).toBe(true);
  });

  test("fidelity 주면 1층 composition 채움 (MAE<0.05 → 🟢)", () => {
    const result = studyWith([resp({ 연령: "30대" }, { 연령: "matched" })]);
    const fidelity = {
      core: { name: "성×연령×지역", provenance: "matched" as const, mae: 0, tvd: 0, maxError: { key: "", expected: 0, actual: 0 } },
      conditional: [],
      matched: ["성", "연령", "지역"],
      conditioned: [],
    };
    const card = assessReliability(result, { fidelity });
    expect(card.composition).toEqual({ signal: "🟢", mae: 0, tvd: 0 });
  });

  test("bridges 주면 해당 dim에 note 첨부", () => {
    const result = studyWith([resp({ 가구원수: "1명" }, { 가구원수: "conditioned" })]);
    const card = assessReliability(result, { bridges: { 가구원수: "householder_age_as_proxy" } });
    const a = card.attributes.find((x) => x.dim === "가구원수");
    expect(a?.note).toBe("bridge:householder_age_as_proxy");
  });

  test("항상 synthetic panel response 가드레일 포함", () => {
    const result = studyWith([resp({ 연령: "30대" }, { 연령: "matched" })]);
    const card = assessReliability(result);
    expect(card.guardrails.some((g) => g.includes("synthetic panel response"))).toBe(true);
    expect(card.responseConsistency.status).toBe("not-measured");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/assess/reliability.test.ts`
Expected: FAIL — `Cannot find module './reliability.js'` / `assessReliability is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/assess/reliability.ts`:

```ts
import type { Provenance, StudyResult } from "../types.js";
import type { FidelityReport } from "../verify/fidelity.js";

export type Confidence = "high" | "medium" | "low" | "unknown";

export interface AttributeReliability {
  dim: string;
  provenance: Provenance | "unknown";
  confidence: Confidence;
  note?: string;
}

export interface ReliabilityCard {
  composition: { signal: "🟢" | "🔴"; mae: number; tvd: number } | null;
  attributes: AttributeReliability[];
  responseConsistency: { status: "not-measured"; reason: string };
  guardrails: string[];
  missingAxes: string[];
}

const CONFIDENCE_BY_PROVENANCE: Record<Provenance, Confidence> = {
  matched: "high",
  conditioned: "medium",
  inferred: "low",
  llm_generated: "low",
};

const DEFAULT_PRICE_CRITICAL_AXES = ["소득", "직업", "자녀"];
const COMPOSITION_MAE_THRESHOLD = 0.05;

export function assessReliability(
  result: StudyResult,
  ctx?: {
    fidelity?: FidelityReport;
    bridges?: Record<string, string>;
    priceCriticalAxes?: string[];
  },
): ReliabilityCard {
  const dims = Object.keys(result.bySegment);
  const bridges = ctx?.bridges ?? {};

  const attributes: AttributeReliability[] = dims.map((dim) => {
    let prov: Provenance | undefined;
    for (const r of result.responses) {
      const p = r.persona.provenance?.[dim];
      if (p) {
        prov = p;
        break;
      }
    }
    const provenance: Provenance | "unknown" = prov ?? "unknown";
    const confidence: Confidence = prov ? CONFIDENCE_BY_PROVENANCE[prov] : "unknown";
    const note = bridges[dim] ? `bridge:${bridges[dim]}` : undefined;
    return { dim, provenance, confidence, note };
  });

  const composition = ctx?.fidelity
    ? {
        signal: (ctx.fidelity.core.mae <= COMPOSITION_MAE_THRESHOLD ? "🟢" : "🔴") as
          | "🟢"
          | "🔴",
        mae: ctx.fidelity.core.mae,
        tvd: ctx.fidelity.core.tvd,
      }
    : null;

  const priceAxes = ctx?.priceCriticalAxes ?? DEFAULT_PRICE_CRITICAL_AXES;
  const missingAxes = priceAxes.filter((a) => !dims.includes(a));

  const guardrails: string[] = [];
  guardrails.push(
    "이 숫자는 synthetic panel response입니다 — 실제 구매율/시장 예측이 아니며, 실제 인터뷰·설문으로 검증해야 합니다.",
  );
  if (missingAxes.length) {
    guardrails.push(
      `가격·구매력 판단 부적합: ${missingAxes.join("·")} 축이 없습니다. 방향 가설 탐색엔 사용 가능하나, 가격 결론은 인터뷰로 확인하세요.`,
    );
  }
  const lowDims = attributes.filter((a) => a.confidence === "low").map((a) => a.dim);
  if (lowDims.length) {
    guardrails.push(
      `저확신 속성(${lowDims.join("·")})에서 나온 세그먼트 결론은 추정(inferred)이므로 의사결정에 쓰지 마세요.`,
    );
  }
  if (attributes.length && attributes.every((a) => a.provenance === "unknown")) {
    guardrails.push(
      "이 페르소나 소스에는 provenance 정보가 없습니다(통계청 합성 인구가 아님) — 속성 신뢰도를 평가할 수 없습니다.",
    );
  }

  return {
    composition,
    attributes,
    responseConsistency: { status: "not-measured", reason: "키 필요(묶음 B)" },
    guardrails,
    missingAxes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/assess/reliability.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Lint + commit**

```bash
npx biome check --write src/assess/reliability.ts src/assess/reliability.test.ts
git add src/assess/reliability.ts src/assess/reliability.test.ts
git commit -m "feat: assessReliability — provenance→confidence 카드 파생(1·2·4층)"
```

---

### Task 2: `renderReliabilityCard` 마크다운 렌더러

**Files:**
- Create: `src/assess/reliability-report.ts`
- Test: `src/assess/reliability-report.test.ts`

**Interfaces:**
- Consumes: `ReliabilityCard` (`./reliability.js`, Task 1).
- Produces: `function renderReliabilityCard(card: ReliabilityCard): string` — 마크다운. 1층/2층/3층/가드레일 분리 블록.

- [ ] **Step 1: Write the failing test**

Create `src/assess/reliability-report.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { ReliabilityCard } from "./reliability.js";
import { renderReliabilityCard } from "./reliability-report.js";

const card: ReliabilityCard = {
  composition: { signal: "🟢", mae: 0, tvd: 0 },
  attributes: [
    { dim: "연령", provenance: "matched", confidence: "high" },
    { dim: "가구원수", provenance: "conditioned", confidence: "medium", note: "bridge:householder_age_as_proxy" },
  ],
  responseConsistency: { status: "not-measured", reason: "키 필요(묶음 B)" },
  guardrails: ["이 숫자는 synthetic panel response입니다 — 실제 구매율/시장 예측이 아닙니다."],
  missingAxes: ["소득", "직업", "자녀"],
};

describe("renderReliabilityCard", () => {
  test("1·2·3층 + 가드레일 블록을 분리 렌더", () => {
    const md = renderReliabilityCard(card);
    expect(md).toContain("## 신뢰성 카드");
    expect(md).toContain("### 1층 · 구성 신뢰도");
    expect(md).toContain("### 2층 · 속성 신뢰도");
    expect(md).toContain("### 3층 · 응답 신뢰도");
    expect(md).toContain("⚠️ 가드레일");
  });

  test("2층 표에 provenance·신뢰도·bridge note 노출", () => {
    const md = renderReliabilityCard(card);
    expect(md).toContain("| 연령 | matched | 높음 |");
    expect(md).toContain("bridge:householder_age_as_proxy");
  });

  test("3층은 미측정 표기, 가드레일에 synthetic panel response 포함", () => {
    const md = renderReliabilityCard(card);
    expect(md).toContain("not-measured");
    expect(md).toContain("synthetic panel response");
  });

  test("composition null이면 미측정 표기", () => {
    const md = renderReliabilityCard({ ...card, composition: null });
    expect(md).toContain("측정 안 됨");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/assess/reliability-report.test.ts`
Expected: FAIL — `Cannot find module './reliability-report.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/assess/reliability-report.ts`:

```ts
import type { Confidence, ReliabilityCard } from "./reliability.js";

const CONF_LABEL: Record<Confidence, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
  unknown: "알수없음",
};

export function renderReliabilityCard(card: ReliabilityCard): string {
  const lines: string[] = ["## 신뢰성 카드", ""];

  lines.push("### 1층 · 구성 신뢰도 (통계청 분포 적합)");
  if (card.composition) {
    lines.push(
      `- ${card.composition.signal} MAE ${card.composition.mae.toFixed(4)} · TVD ${card.composition.tvd.toFixed(4)}`,
    );
  } else {
    lines.push("- _측정 안 됨 (fidelity 미제공)_");
  }
  lines.push("");

  lines.push("### 2층 · 속성 신뢰도 (provenance)");
  lines.push("| 속성 | provenance | 신뢰도 | 비고 |");
  lines.push("|---|---|---|---|");
  for (const a of card.attributes) {
    lines.push(`| ${a.dim} | ${a.provenance} | ${CONF_LABEL[a.confidence]} | ${a.note ?? ""} |`);
  }
  lines.push("");

  lines.push("### 3층 · 응답 신뢰도 (LLM 일관성)");
  lines.push(`- _${card.responseConsistency.status} — ${card.responseConsistency.reason}_`);
  lines.push("");

  lines.push("### ⚠️ 가드레일 — 이 결과로 하지 말 것");
  for (const g of card.guardrails) lines.push(`- ${g}`);
  lines.push("");

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/assess/reliability-report.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + commit**

```bash
npx biome check --write src/assess/reliability-report.ts src/assess/reliability-report.test.ts
git add src/assess/reliability-report.ts src/assess/reliability-report.test.ts
git commit -m "feat: renderReliabilityCard — 1/2/3층 분리 마크다운 + 가드레일"
```

---

### Task 3: `renderMarkdownReport` 결합 + 배럴 export

**Files:**
- Modify: `src/verify/report.ts`
- Modify: `src/verify/report.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `ReliabilityCard`·`renderReliabilityCard` (Task 1·2).
- Produces: `ReportInput`에 옵셔널 `reliability?: ReliabilityCard`. 배럴에 `assessReliability`·`renderReliabilityCard`·타입 export.

- [ ] **Step 1: Write the failing test**

`src/verify/report.test.ts`에 추가:

```ts
import { renderMarkdownReport } from "./report.js";
import type { ReliabilityCard } from "../assess/reliability.js";

test("reliability 카드가 주어지면 리포트에 신뢰성 섹션이 결합된다", () => {
  const card: ReliabilityCard = {
    composition: null,
    attributes: [{ dim: "연령", provenance: "matched", confidence: "high" }],
    responseConsistency: { status: "not-measured", reason: "키 필요(묶음 B)" },
    guardrails: ["synthetic panel response — 실제 예측 아님"],
    missingAxes: [],
  };
  const md = renderMarkdownReport({ title: "T", reliability: card });
  expect(md).toContain("## 신뢰성 카드");
  expect(md).toContain("synthetic panel response");
});
```

(상단 import에 위 두 줄을 기존 import 블록과 병합. 이미 vitest의 `test`/`expect`가 import돼 있으면 중복 추가 금지.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/verify/report.test.ts`
Expected: FAIL — `reliability` 속성이 `ReportInput`에 없어 타입 에러 또는 섹션 미출력.

- [ ] **Step 3: Write minimal implementation**

`src/verify/report.ts` 수정 — 상단 import 추가:

```ts
import type { ReliabilityCard } from "../assess/reliability.js";
import { renderReliabilityCard } from "../assess/reliability-report.js";
```

`ReportInput`에 필드 추가:

```ts
export interface ReportInput {
  title: string;
  result?: StudyResult;
  calibration?: CalibrationReport;
  reliability?: ReliabilityCard;
}
```

`renderMarkdownReport` 본문 수정 (reliability를 result 다음, calibration 전에 결합; 빈 결과 판정에도 포함):

```ts
export function renderMarkdownReport(input: ReportInput): string {
  const parts: string[] = [`# ${input.title}`, ""];
  if (input.result) parts.push(renderResult(input.result));
  if (input.reliability) parts.push(renderReliabilityCard(input.reliability));
  if (input.calibration) parts.push(renderCalibration(input.calibration));
  if (!input.result && !input.calibration && !input.reliability)
    parts.push("_표시할 결과가 없습니다._");
  return parts.join("\n");
}
```

`src/index.ts`에 배럴 export 추가 (기존 fidelity export 블록 근처):

```ts
export {
  assessReliability,
  type ReliabilityCard,
  type AttributeReliability,
  type Confidence,
} from "./assess/reliability.js";
export { renderReliabilityCard } from "./assess/reliability-report.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/verify/report.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: report 테스트 PASS, tsc exit 0.

- [ ] **Step 5: Lint + commit**

```bash
npx biome check --write src/verify/report.ts src/verify/report.test.ts src/index.ts
git add src/verify/report.ts src/verify/report.test.ts src/index.ts
git commit -m "feat: renderMarkdownReport에 신뢰성 카드 결합 + 공개 API export"
```

---

### Task 4: census 기반 key-free 데모 + npm 스크립트

**Files:**
- Create: `eval/reliability-demo.ts`
- Test: `eval/reliability-demo.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `loadSnapshot`·`synthesizePopulation`·`sampleForSimulation` (population), `MockProvider` (`src/llm/mock.js`), `simulate` (`src/simulate/simulate.js`), `aggregate` (`src/aggregate/uncertainty.js`), `populationFidelity` (`src/verify/fidelity.js`), `assessReliability` (Task 1), `renderMarkdownReport` (Task 3), 번들 스냅샷 `data/census/kr-2024.json`.
- Produces: `function runReliabilityDemo(): Promise<string>`.

참고 — 시그니처:
- `sampleForSimulation(personas: Persona[], n: number, seed: number): Persona[]` (provenance/flags 보존)
- `simulate(personas, { prompt, choices }, provider): Promise<{ responses, missing }>`
- `aggregate(responses, { missing }): StudyResult`
- `new MockProvider((persona) => string)`
- census 페르소나 attrs 키: `성·연령·지역·혼인·가구원수`; 연령 카테고리 예: `"20~24세"`,`"25~29세"`,`"30~34세"`.

- [ ] **Step 1: Write the failing test**

Create `eval/reliability-demo.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { runReliabilityDemo } from "./reliability-demo.js";

describe("reliability-demo", () => {
  test("census 합성인구로 신뢰성 카드를 렌더한다 (키 불필요·결정적)", async () => {
    const md = await runReliabilityDemo();
    expect(md).toContain("## 신뢰성 카드");
    expect(md).toContain("synthetic panel response");
    // 2층: matched(성/연령/지역) + conditioned(혼인/가구원수) 노출
    expect(md).toContain("matched");
    expect(md).toContain("conditioned");
    // householder bridge note
    expect(md).toContain("householder_age_as_proxy");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run eval/reliability-demo.test.ts`
Expected: FAIL — `Cannot find module './reliability-demo.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `eval/reliability-demo.ts`:

```ts
import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import { aggregate } from "../src/aggregate/uncertainty.js";
import { assessReliability } from "../src/assess/reliability.js";
import { MockProvider } from "../src/llm/mock.js";
import { loadSnapshot } from "../src/population/loader.js";
import { sampleForSimulation } from "../src/population/source.js";
import { synthesizePopulation } from "../src/population/synthesize.js";
import { simulate } from "../src/simulate/simulate.js";
import { renderMarkdownReport } from "../src/verify/report.js";
import { populationFidelity } from "../src/verify/fidelity.js";

export async function runReliabilityDemo(): Promise<string> {
  const snapshot = loadSnapshot(snapshotJson);
  const pop = synthesizePopulation(snapshot);
  const sample = sampleForSimulation(pop, 200, 7);

  const choices = ["쓴다", "안쓴다"];
  const young = new Set(["20~24세", "25~29세", "30~34세"]);
  const provider = new MockProvider((p) => (young.has(p.attrs.연령) ? "쓴다" : "안쓴다"));
  const question = {
    prompt: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
    choices,
  };

  const { responses, missing } = await simulate(sample, question, provider);
  const result = aggregate(responses, { missing });

  const fidelity = populationFidelity(pop, snapshot);
  const bridges = Object.fromEntries(
    snapshot.conditional.filter((c) => c.bridge).map((c) => [c.var, c.bridge as string]),
  );
  const card = assessReliability(result, { fidelity, bridges });

  return renderMarkdownReport({
    title: "synth-persona 신뢰성 카드 데모 (2024 합성 인구)",
    result,
    reliability: card,
  });
}

if (
  process.argv[1]?.endsWith("reliability-demo.ts") ||
  process.argv[1]?.endsWith("reliability-demo.js")
) {
  runReliabilityDemo().then((md) => console.log(md));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run eval/reliability-demo.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: package.json 스크립트 추가**

`package.json`의 `scripts`에 `fidelity:demo` 다음 줄로 추가:

```json
    "reliability:demo": "node dist/eval/reliability-demo.js",
```

- [ ] **Step 6: 빌드 후 데모 실제 실행 확인**

Run: `npm run build && npm run reliability:demo`
Expected: 마크다운 출력에 "## 신뢰성 카드", 2층 표(matched/conditioned), "householder_age_as_proxy", "synthetic panel response" 가드레일 포함.

- [ ] **Step 7: Lint + commit**

```bash
npx biome check --write eval/reliability-demo.ts eval/reliability-demo.test.ts package.json
git add eval/reliability-demo.ts eval/reliability-demo.test.ts package.json
git commit -m "feat: census 기반 key-free 신뢰성 카드 데모 + reliability:demo 스크립트"
```

---

### Task 5: 전체 검증 게이트

**Files:** 없음 (검증 전용).

- [ ] **Step 1: 전체 테스트 그린 확인**

Run: `npm test`
Expected: 기존 89 + 신규(reliability 7 + reliability-report 4 + report 추가 1 + demo 1 = 13) = **102 passed**.

- [ ] **Step 2: lint / tsc / build 그린 확인**

Run: `npm run lint && npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: biome clean, tsc exit 0, build success.

- [ ] **Step 3: 불변식 자가 점검**

- [ ] 코어 타입(`src/types.ts`)·`aggregate` 미수정 확인: `git diff --stat main -- src/types.ts src/aggregate/uncertainty.ts` → 변경 없음.
- [ ] 출력에 "구매율/구매의향/시장 예측" 단정 문구 없음, 모든 숫자 synthetic panel response 라벨.
- [ ] 1층(구성)·2층(LLM) 분리 블록 확인.
- [ ] "완전 5-way joint" 비주장 유지.

- [ ] **Step 4: 최종 커밋 (필요 시)**

이전 태스크에서 모두 커밋됐다면 추가 작업 없음. 미커밋 변경이 있으면:

```bash
git add -A && git commit -m "chore: 묶음 A 신뢰성 오버레이 검증 게이트 통과"
```

---

## Self-Review (plan author)

**Spec coverage (스펙 §4 묶음 A):**
- §4.1 새 모듈 `src/assess/reliability.ts` + `ReliabilityCard` → Task 1 ✓
- §4.2 규칙 1(provenance→confidence) → Task 1 ✓ / 규칙 2(축 결핍 가드레일) → Task 1 ✓ / 규칙 3(숫자 라벨) → Task 1 가드레일 + Task 2 렌더 ✓ / 규칙 4(1층 노출) → Task 1 composition ✓
- §4.3 렌더러 + `renderMarkdownReport` 결합 → Task 2·3 ✓
- §4.4 공개 API 배럴 → Task 3 ✓
- §2 4층 모델: 1층(composition)·2층(attributes)·3층(자리)·4층(guardrails) → Task 1 전부 ✓
- §7 테스트/불변식 → Task 1~5 TDD + Task 5 게이트 ✓
- CLI(§4.3 언급): 의도적 묶음 B 이월 — File Structure에 명시 ✓ (provenance-less SampleSource라 가치 낮음)

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, TODO/TBD 없음. ✓

**Type consistency:** `assessReliability`·`ReliabilityCard`·`AttributeReliability`·`Confidence`·`renderReliabilityCard` 시그니처가 Task 1·2·3·4 전반에서 일치. `FidelityReport.core.mae/tvd`·`provenance` 실제 타입과 일치. `simulate`/`aggregate`/`sampleForSimulation`/`MockProvider` 실제 시그니처와 일치. ✓

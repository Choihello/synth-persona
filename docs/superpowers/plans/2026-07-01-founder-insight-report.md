# Founder Insight Report (Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** synthetic panel 결과(`StudyResult`)를 창업자용 "0차 시장검증 리포트"(`FounderInsightReport`)로 번역하는 read-only 오버레이 + heuristic 처방 + 마크다운 렌더러를 추가한다.

**Architecture:** 코어 타입·`aggregate` 불변. 새 모듈 `src/report/`가 `StudyResult`(+선택적 fidelity/bridges)를 *읽기만* 하여 리포트를 파생한다. 처방은 `PrescriptionGenerator` 인터페이스 뒤로 분리해 키 없는 heuristic v1을 넣고, 후속 LLM v2(issue #4)로 스왑 가능하게 한다.

**Tech Stack:** TypeScript (Node 24 ESM), vitest, biome, tsup. 런타임 외부 의존성 추가 없음.

## Global Constraints

- 런타임 외부 의존성 `@anthropic-ai/sdk` 하나 — **추가 금지**(빌트인 `node:*`는 허용).
- 코어 타입(`src/types.ts`)·`aggregate`(`src/aggregate/uncertainty.ts`) **수정 금지** (read-only 오버레이).
- 모든 응답 숫자는 **synthetic panel response** — "구매율/시장점유율/성공확률" 단정 금지. disclaimer 항상 포함.
- 모든 **처방**(인터뷰/설문/랜딩/드라이버·오브젝션)은 `provenance:"inferred"` + `basis:"heuristic"`.
- 가격/구매력은 소득·직업·자녀 축 없으면 **low** + 가드레일.
- `ctx.fidelity` 없으면 구성 신뢰도는 **unknown**(high로 추정 금지).
- low-n(`sampleCount < minN`) 세그먼트는 랭킹 제외 + "판단 보류".
- "완전 5-way joint" 비주장 · `Persona.weight`·provenance·householder bridge·suppressed(X)≠structural zero(-) 유지.
- import 경로 `.js` 확장자. 파일은 `npm run format`으로 biome 정렬.

---

## 확인된 원자료 (보완 #5)

`StudyResult`는 리포트 파생에 필요한 걸 전부 담고 있어 **코어 타입 변경 불필요**:
- `responses[].persona.attrs` (세그먼트 dim), `.weight`(sampleWeight), `.provenance`(속성 신뢰도), `.flags`(bridge)
- `responses[].choice?` (parsed choice; `undefined`=parse 미매칭)
- `missing[]` (provider 실패, personaId 기준 — responses에 없음)
- **missing 2종**: parse 미매칭(`choice===undefined`인 response) vs provider 실패(`missing[]`).

---

## File Structure

- `src/report/types.ts` — **신규**. `FounderInsightReport` + 모든 서브타입 + `FounderReportOptions`. (P4-1)
- `src/report/segments.ts` — **신규**. 세그먼트 재집계 + opportunity/resistance/observedButHeld 랭킹(순수). (P4-1)
- `src/report/confidence.ts` — **신규**. `ReliabilityCard` → `ConfidenceCard` + `RiskyAssumption[]` 매핑(순수). (P4-1)
- `src/report/generate.ts` — **신규**. `generateFounderInsightReport` 조립(입력검증·overall·요약·appendix·처방 결선). (P4-1 코어, P4-2에서 처방 연결)
- `src/report/prescriptions.ts` — **신규**. `PrescriptionGenerator` 인터페이스 + `HeuristicPrescriptionGenerator`. (P4-2)
- `src/report/render.ts` — **신규**. `renderFounderInsightReport`(markdown, 13 섹션, low-n cap). (P4-3)
- `src/report/*.test.ts` — 각 모듈 테스트.
- `src/index.ts` — **수정**. 배럴 export.
- `eval/report-demo.ts` · `package.json`(`report:demo`) · `tsup.config.ts` · `docs/README-intro.md` — (P4-3)

---

# ===== P4-1: Report Core Schema + Segment Ranking =====

범위: 타입, `generateFounderInsightReport` 코어, 세그먼트 랭킹, minN guard, confidence/riskyAssumptions, disclaimer. **처방은 빈 배열**(P4-2에서 연결).

### Task 1: 타입 + 입력 검증 + Overall/Appendix

**Files:**
- Create: `src/report/types.ts`
- Create: `src/report/generate.ts`
- Test: `src/report/generate.test.ts`

**Interfaces:**
- Consumes: `StudyResult` (`../types.js`), `FidelityReport` (`../verify/fidelity.js`), `ReliabilityCard` (`../assess/reliability.js`).
- Produces:
  - `interface FounderReportOptions { question: string; choices: string[]; positiveChoice?: string; minN?: number; concept?: ConceptMeta; founderGoal?: FounderGoal; run?: { seed?: number; provider?: string; n?: number } }`
  - `function generateFounderInsightReport(result: StudyResult, options: FounderReportOptions, ctx?: { fidelity?: FidelityReport; bridges?: Record<string,string> }): FounderInsightReport`
  - `FounderInsightReport` 및 모든 서브타입(아래 types.ts 참조).

- [ ] **Step 1: Write the failing test**

Create `src/report/generate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { Response, StudyResult } from "../types.js";
import { generateFounderInsightReport } from "./generate.js";

function r(attrs: Record<string, string>, choice: string): Response {
  return { persona: { id: Math.random().toString(), attrs, weight: 1 }, answer: choice, choice };
}
function study(responses: Response[]): StudyResult {
  return { responses, signal: "split", dispersion: 0.9, bySegment: {} };
}
const opts = { question: "쓸 의향?", choices: ["쓴다", "안쓴다"] };

describe("generateFounderInsightReport — core/validation", () => {
  test("choices가 2개 미만이면 throw", () => {
    expect(() =>
      generateFounderInsightReport(study([r({ 연령: "30대" }, "쓴다")]), {
        question: "q",
        choices: ["쓴다"],
      }),
    ).toThrow(/choices/);
  });

  test("positiveChoice가 choices에 없으면 throw", () => {
    expect(() =>
      generateFounderInsightReport(study([r({ 연령: "30대" }, "쓴다")]), {
        ...opts,
        positiveChoice: "몰라",
      }),
    ).toThrow(/positiveChoice/);
  });

  test("positiveChoice 미지정 → choices[0] 가정 + appendix caveat 기록", () => {
    const rep = generateFounderInsightReport(study([r({ 연령: "30대" }, "쓴다")]), opts);
    expect(rep.appendix.caveats.some((c) => c.includes("positiveChoice") && c.includes("쓴다"))).toBe(true);
  });

  test("3지선다 이상이면 collapse caveat 기록", () => {
    const rep = generateFounderInsightReport(
      study([r({ 연령: "30대" }, "써본다")]),
      { question: "q", choices: ["써본다", "잘모르겠다", "안쓴다"], positiveChoice: "써본다" },
    );
    expect(rep.appendix.caveats.some((c) => c.includes("중립"))).toBe(true);
  });

  test("overall: 분포·missingRate·n·synthetic panel 라벨", () => {
    const result: StudyResult = {
      responses: [r({ 연령: "30대" }, "쓴다"), r({ 연령: "40대" }, "안쓴다")],
      signal: "split",
      dispersion: 1,
      bySegment: {},
      missing: [{ personaId: "x", reason: "rate limit" }],
    };
    const rep = generateFounderInsightReport(result, opts);
    expect(rep.overallSignal.n).toBe(2);
    expect(rep.overallSignal.missingRate).toBeCloseTo(1 / 3, 4);
    expect(rep.overallSignal.distribution).toEqual({ 쓴다: 1, 안쓴다: 1 });
    expect(rep.overallSignal.label).toContain("실제 시장 반응 아님");
    expect(rep.disclaimer).toContain("synthetic panel response");
  });

  test("처방 배열은 P4-1에서 비어 있음", () => {
    const rep = generateFounderInsightReport(study([r({ 연령: "30대" }, "쓴다")]), opts);
    expect(rep.recommendedInterviews).toEqual([]);
    expect(rep.interviewQuestions).toEqual([]);
    expect(rep.surveyDraft).toEqual([]);
    expect(rep.landingPageMessageTests).toEqual([]);
    expect(rep.nextValidationPlan).toEqual([]);
    expect(rep.keyDrivers).toEqual([]);
    expect(rep.keyObjections).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/generate.test.ts`
Expected: FAIL — `Cannot find module './generate.js'`.

- [ ] **Step 3: Create `src/report/types.ts`**

```ts
import type { ReliabilityCard } from "../assess/reliability.js";

export type Confidence = "high" | "medium" | "low" | "unknown";
export type Basis = "measured" | "heuristic";
export type FounderGoal =
  | "targeting" | "pricing" | "message" | "problem-validation" | "feature-priority";

export interface ConceptMeta {
  productName?: string;
  conceptDescription?: string;
  targetCustomerHypothesis?: string;
  price?: string;
  channel?: string;
  alternatives?: string[];
}

export interface FounderReportOptions {
  question: string;
  choices: string[];
  positiveChoice?: string;
  minN?: number;
  concept?: ConceptMeta;
  founderGoal?: FounderGoal;
  run?: { seed?: number; provider?: string; n?: number };
}

export interface ExecutiveSummary {
  headline: string;
  topOpportunity?: string;
  topResistance?: string;
  doNotTrustYet: string;
  thisWeekAction: string;
}

export interface OverallSignalSection {
  signal: "consensus" | "split";
  distribution: Record<string, number>;
  missingRate: number;
  n: number;
  seed?: number;
  provider?: string;
  label: string;
}

export interface SegmentInsight {
  segmentLabel: string;
  segmentDefinition: string;
  sampleCount: number;
  sampleWeightShare: number;
  responseDistribution: Record<string, number>;
  positiveRatio: number;
  signal: "consensus" | "split";
  whyItMatters: string;
  likelyReasoning: string;
  confidence: Confidence;
  caveats: string[];
  recommendedFollowUpQuestion: string;
}

export interface DriverInsight {
  label: string;
  rationale: string;
  provenance: "inferred";
  basis: Basis;
  confidence: Confidence;
}

export interface RiskyAssumption {
  assumption: string;
  whyRisky: string;
  howToTest: string;
}

export interface ConfidenceLayer {
  label: Confidence;
  reason: string;
  whatThisAllows: string;
  whatThisDoesNotAllow: string;
}
export interface ConfidenceCard {
  composition: ConfidenceLayer;
  attributes: ConfidenceLayer;
  responseConsistency: ConfidenceLayer;
  marketJudgment: ConfidenceLayer;
}

export interface InterviewTarget {
  targetLabel: string;
  whyInterview: string;
  whatToValidate: string;
  suggestedRecruitingScreener: string;
  sampleSizeRecommendation: string;
  provenance: "inferred";
  basis: Basis;
}
export interface InterviewQuestion {
  text: string;
  type:
    | "problem-discovery" | "current-alternative" | "frequency"
    | "trust-barrier" | "willingness" | "message-test" | "price";
  provenance: "inferred";
  basis: Basis;
  caution?: string;
}
export interface SurveyQuestion {
  text: string;
  kind:
    | "segmentation" | "problem-frequency" | "alternative"
    | "concept-reaction" | "reason" | "price";
  optional?: boolean;
  caution?: string;
  provenance: "inferred";
  basis: Basis;
}
export interface MessageTest {
  headline: string;
  subcopy: string;
  targetSegment: string;
  hypothesis: string;
  successMetric: string;
  caution: string;
  provenance: "inferred";
  basis: Basis;
}
export interface ValidationAction {
  day: string;
  action: string;
}

export interface ReportAppendix {
  generatedAt: string;
  options: FounderReportOptions;
  caveats: string[];
  observedButHeldCount: number;
  reliabilityCardRaw?: ReliabilityCard;
}

export interface FounderInsightReport {
  title: string;
  disclaimer: string;
  executiveSummary: ExecutiveSummary;
  overallSignal: OverallSignalSection;
  opportunitySegments: SegmentInsight[];
  resistanceSegments: SegmentInsight[];
  observedButHeld: SegmentInsight[];
  keyDrivers: DriverInsight[];
  keyObjections: DriverInsight[];
  riskyAssumptions: RiskyAssumption[];
  confidenceCard: ConfidenceCard;
  recommendedInterviews: InterviewTarget[];
  interviewQuestions: InterviewQuestion[];
  surveyDraft: SurveyQuestion[];
  landingPageMessageTests: MessageTest[];
  nextValidationPlan: ValidationAction[];
  appendix: ReportAppendix;
}
```

- [ ] **Step 4: Create `src/report/generate.ts` (Task 1 범위: 검증·overall·appendix·빈 나머지)**

> ⚠️ 이 파일은 Task 2·3에서 segments/confidence를 채워 확장한다. Task 1에서는 **입력검증 + overallSignal + appendix + disclaimer**를 구현하고, 나머지 필드는 빈 배열/placeholder로 둔다.

```ts
import type { FidelityReport } from "../verify/fidelity.js";
import type { StudyResult } from "../types.js";
import type {
  FounderInsightReport,
  FounderReportOptions,
  OverallSignalSection,
  ReportAppendix,
} from "./types.js";

const DISCLAIMER =
  "이 리포트의 모든 수치는 synthetic panel response(가상 패널 응답)이며, 실제 시장 반응·구매율이 아닙니다. 실제 인터뷰·설문으로 검증해야 합니다.";
const DEFAULT_MIN_N = 8;

function overallSection(
  result: StudyResult,
  options: FounderReportOptions,
): OverallSignalSection {
  const distribution: Record<string, number> = {};
  for (const r of result.responses) {
    const k = r.choice ?? r.answer;
    distribution[k] = (distribution[k] ?? 0) + 1;
  }
  const missing = result.missing?.length ?? 0;
  const total = result.responses.length + missing;
  return {
    signal: result.signal,
    distribution,
    missingRate: total > 0 ? missing / total : 0,
    n: options.run?.n ?? result.responses.length,
    seed: options.run?.seed,
    provider: options.run?.provider,
    label: "가상 패널 응답 기준 · 실제 시장 반응 아님 · 탐색 신호",
  };
}

export function generateFounderInsightReport(
  result: StudyResult,
  options: FounderReportOptions,
  _ctx?: { fidelity?: FidelityReport; bridges?: Record<string, string> },
): FounderInsightReport {
  const { choices } = options;
  if (choices.length < 2) {
    throw new Error("choices는 최소 2개여야 합니다 (기회/저항 방향을 정의할 수 없음).");
  }
  const positiveChoice = options.positiveChoice ?? choices[0];
  if (!choices.includes(positiveChoice)) {
    throw new Error(`positiveChoice "${positiveChoice}"가 choices에 없습니다: [${choices.join(", ")}]`);
  }

  const caveats: string[] = [];
  if (options.positiveChoice == null) {
    caveats.push(
      `positiveChoice assumed from choices[0]: "${positiveChoice}" — 의도한 긍정 방향이 맞는지 확인하세요.`,
    );
  }
  if (choices.length > 2) {
    caveats.push(
      `3지선다 이상: positive("${positiveChoice}") 1개 vs 나머지로 접힙니다. "잘 모르겠다" 같은 중립 응답이 negative로 합쳐질 수 있습니다.`,
    );
  }

  const appendix: ReportAppendix = {
    generatedAt: new Date().toISOString(),
    options,
    caveats,
    observedButHeldCount: 0,
  };

  return {
    title: `${options.concept?.productName ?? "컨셉"} — 0차 시장검증 리포트`,
    disclaimer: DISCLAIMER,
    executiveSummary: {
      headline: "",
      doNotTrustYet: "",
      thisWeekAction: "",
    },
    overallSignal: overallSection(result, options),
    opportunitySegments: [],
    resistanceSegments: [],
    observedButHeld: [],
    keyDrivers: [],
    keyObjections: [],
    riskyAssumptions: [],
    confidenceCard: {
      composition: { label: "unknown", reason: "", whatThisAllows: "", whatThisDoesNotAllow: "" },
      attributes: { label: "unknown", reason: "", whatThisAllows: "", whatThisDoesNotAllow: "" },
      responseConsistency: { label: "unknown", reason: "", whatThisAllows: "", whatThisDoesNotAllow: "" },
      marketJudgment: { label: "low", reason: "", whatThisAllows: "", whatThisDoesNotAllow: "" },
    },
    recommendedInterviews: [],
    interviewQuestions: [],
    surveyDraft: [],
    landingPageMessageTests: [],
    nextValidationPlan: [],
    appendix,
  };
}

export { DISCLAIMER, DEFAULT_MIN_N };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/report/generate.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Lint + commit**

```bash
npx biome check --write src/report/types.ts src/report/generate.ts src/report/generate.test.ts
git add src/report/types.ts src/report/generate.ts src/report/generate.test.ts
git commit -m "feat(P4-1): 리포트 타입 + generate 코어(입력검증·overall·appendix caveat)"
```

---

### Task 2: 세그먼트 랭킹 (opportunity/resistance/observedButHeld)

**Files:**
- Create: `src/report/segments.ts`
- Create: `src/report/segments.test.ts`
- Modify: `src/report/generate.ts` (segments 결선)

**Interfaces:**
- Consumes: `StudyResult` (`../types.js`), `SegmentInsight`·`Confidence` (`./types.js`).
- Produces: `function rankSegments(result: StudyResult, positiveChoice: string, minN: number): { opportunity: SegmentInsight[]; resistance: SegmentInsight[]; observedButHeld: SegmentInsight[]; globalPositiveRatio: number }`

랭킹 공식 (보완 #3):
- `globalPositiveRatio = (positive choice 응답 수) / (choice가 있는 응답 수)`
- `opportunityScore = (positiveRatio - globalPositiveRatio) * Math.log(sampleCount)` — 조건: `sampleCount >= minN && positiveRatio > globalPositiveRatio`, 내림차순
- `resistanceScore = (globalPositiveRatio - positiveRatio) * Math.log(sampleCount)` — 조건: `sampleCount >= minN && positiveRatio < globalPositiveRatio`, 내림차순
- `sampleCount < minN` → `observedButHeld`(sampleCount 내림차순), 랭킹 제외
- `sampleCount` = 세그먼트에서 **choice가 있는(파싱된)** 응답 수. `sampleWeightShare` = 세그먼트 weight 합 / 전체 weight 합.

- [ ] **Step 1: Write the failing test**

Create `src/report/segments.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { Response, StudyResult } from "../types.js";
import { rankSegments } from "./segments.js";

function make(pos: number, neg: number, dim = "연령", val = "30대"): Response[] {
  const out: Response[] = [];
  for (let i = 0; i < pos; i++)
    out.push({ persona: { id: `p${i}`, attrs: { [dim]: val }, weight: 1 }, answer: "쓴다", choice: "쓴다" });
  for (let i = 0; i < neg; i++)
    out.push({ persona: { id: `n${i}`, attrs: { [dim]: val }, weight: 1 }, answer: "안쓴다", choice: "안쓴다" });
  return out;
}
function study(responses: Response[]): StudyResult {
  return { responses, signal: "split", dispersion: 1, bySegment: {} };
}

describe("rankSegments", () => {
  test("기준선보다 높은 큰 세그먼트는 opportunity, 낮으면 resistance", () => {
    // 연령 30대: 9긍/1부 (0.9), 60대: 1긍/9부 (0.1). global=0.5
    const responses = [...make(9, 1, "연령", "30대"), ...make(1, 9, "연령", "60대")];
    const { opportunity, resistance, globalPositiveRatio } = rankSegments(study(responses), "쓴다", 8);
    expect(globalPositiveRatio).toBeCloseTo(0.5, 4);
    expect(opportunity[0].segmentLabel).toBe("연령=30대");
    expect(resistance[0].segmentLabel).toBe("연령=60대");
  });

  test("sampleCount < minN 세그먼트는 observedButHeld로 (랭킹 제외)", () => {
    // 20대: 3긍/0부 (100% 긍정이지만 n=3 < 8)
    const responses = [...make(9, 1, "연령", "30대"), ...make(3, 0, "연령", "20대")];
    const { opportunity, observedButHeld } = rankSegments(study(responses), "쓴다", 8);
    expect(opportunity.some((s) => s.segmentLabel === "연령=20대")).toBe(false);
    expect(observedButHeld.some((s) => s.segmentLabel === "연령=20대")).toBe(true);
  });

  test("기준선보다 아주 조금 높은 큰 세그먼트가 과대평가되지 않는다", () => {
    // A: 아주 조금 높음(0.52, n=100), B: 확실히 높음(0.8, n=20). global≈0.57
    const responses = [
      ...make(52, 48, "그룹", "A"),
      ...make(16, 4, "그룹", "B"),
    ];
    const { opportunity } = rankSegments(study(responses), "쓴다", 8);
    // B가 A보다 상위 (기준선 대비 차이 × log(n))
    expect(opportunity[0].segmentLabel).toBe("그룹=B");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/segments.test.ts`
Expected: FAIL — `Cannot find module './segments.js'`.

- [ ] **Step 3: Create `src/report/segments.ts`**

```ts
import type { StudyResult } from "../types.js";
import type { Confidence, SegmentInsight } from "./types.js";

interface Bucket {
  dim: string;
  value: string;
  total: number; // choice 있는 응답 수
  positive: number;
  weightSum: number;
  dist: Record<string, number>;
}

export function rankSegments(
  result: StudyResult,
  positiveChoice: string,
  minN: number,
): {
  opportunity: SegmentInsight[];
  resistance: SegmentInsight[];
  observedButHeld: SegmentInsight[];
  globalPositiveRatio: number;
} {
  const buckets = new Map<string, Bucket>();
  let totalWeight = 0;
  let globalTotal = 0;
  let globalPositive = 0;

  for (const r of result.responses) {
    if (r.choice == null) continue; // parse 미매칭 제외
    globalTotal++;
    if (r.choice === positiveChoice) globalPositive++;
    for (const [dim, value] of Object.entries(r.persona.attrs)) {
      const key = `${dim}=${value}`;
      let b = buckets.get(key);
      if (!b) {
        b = { dim, value, total: 0, positive: 0, weightSum: 0, dist: {} };
        buckets.set(key, b);
      }
      b.total++;
      b.weightSum += r.persona.weight;
      b.dist[r.choice] = (b.dist[r.choice] ?? 0) + 1;
      if (r.choice === positiveChoice) b.positive++;
    }
    for (const p of Object.values(r.persona.attrs)) void p;
    totalWeight += r.persona.weight;
  }

  const globalPositiveRatio = globalTotal > 0 ? globalPositive / globalTotal : 0;

  const toInsight = (b: Bucket): SegmentInsight => {
    const positiveRatio = b.total > 0 ? b.positive / b.total : 0;
    const signal: "consensus" | "split" =
      positiveRatio >= 0.7 || positiveRatio <= 0.3 ? "consensus" : "split";
    return {
      segmentLabel: `${b.dim}=${b.value}`,
      segmentDefinition: `${b.dim}이(가) "${b.value}"인 응답자`,
      sampleCount: b.total,
      sampleWeightShare: totalWeight > 0 ? b.weightSum / totalWeight : 0,
      responseDistribution: b.dist,
      positiveRatio,
      signal,
      whyItMatters:
        positiveRatio > globalPositiveRatio
          ? "전체 평균보다 긍정 반응이 강한 세그먼트"
          : "전체 평균보다 저항이 강한 세그먼트",
      likelyReasoning: "(추정) 응답 분포에서 유추 — 실제 이유는 인터뷰로 확인 필요",
      confidence: "unknown" as Confidence, // Task 3에서 provenance 반영해 덮어씀
      caveats:
        b.total < minN ? [`표본 ${b.total}명(minN ${minN} 미만) — 판단 보류`] : [],
      recommendedFollowUpQuestion: `${b.dim}="${b.value}" 응답자에게 이 반응의 실제 이유를 물어볼 것`,
    };
  };

  const opportunity: Array<{ s: SegmentInsight; score: number }> = [];
  const resistance: Array<{ s: SegmentInsight; score: number }> = [];
  const held: SegmentInsight[] = [];

  for (const b of buckets.values()) {
    const insight = toInsight(b);
    if (b.total < minN) {
      held.push(insight);
      continue;
    }
    if (insight.positiveRatio > globalPositiveRatio) {
      opportunity.push({
        s: insight,
        score: (insight.positiveRatio - globalPositiveRatio) * Math.log(b.total),
      });
    } else if (insight.positiveRatio < globalPositiveRatio) {
      resistance.push({
        s: insight,
        score: (globalPositiveRatio - insight.positiveRatio) * Math.log(b.total),
      });
    }
  }

  opportunity.sort((a, b) => b.score - a.score);
  resistance.sort((a, b) => b.score - a.score);
  held.sort((a, b) => b.sampleCount - a.sampleCount);

  return {
    opportunity: opportunity.map((x) => x.s),
    resistance: resistance.map((x) => x.s),
    observedButHeld: held,
    globalPositiveRatio,
  };
}
```

> 참고: 위 `for (const p of Object.values(...)) void p;` 는 불필요하니 구현 시 제거한다(biome no-unused 경고 방지). `totalWeight`는 응답 1건당 1회만 누적한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/report/segments.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: generate.ts에 segments 결선**

`src/report/generate.ts`에서: import `rankSegments`, 호출해 `opportunitySegments`/`resistanceSegments`/`observedButHeld` 채우고 `appendix.observedButHeldCount = observedButHeld.length`로 설정. `executiveSummary.topOpportunity/topResistance`도 각 배열 첫 항목의 `segmentLabel`로 채운다.

- [ ] **Step 6: Lint + commit**

```bash
npx biome check --write src/report/segments.ts src/report/segments.test.ts src/report/generate.ts
git add src/report/segments.ts src/report/segments.test.ts src/report/generate.ts
git commit -m "feat(P4-1): 세그먼트 랭킹(기준선 대비 차이×log n, minN low-n 판단보류)"
```

---

### Task 3: Confidence Card + Risky Assumptions + Executive Summary + 배럴 + 게이트

**Files:**
- Create: `src/report/confidence.ts`
- Create: `src/report/confidence.test.ts`
- Modify: `src/report/generate.ts` (confidence/risky/execSummary 결선, segment confidence 덮어쓰기)
- Modify: `src/index.ts` (배럴 export)

**Interfaces:**
- Consumes: `assessReliability`·`ReliabilityCard` (`../assess/reliability.js`), `ConfidenceCard`·`RiskyAssumption`·`Confidence` (`./types.js`).
- Produces:
  - `function buildConfidenceCard(card: ReliabilityCard): ConfidenceCard`
  - `function buildRiskyAssumptions(card: ReliabilityCard, hasPriceSignal: boolean, observedButHeldCount: number): RiskyAssumption[]`
  - `function worstAttributeConfidence(card: ReliabilityCard): Confidence`

- [ ] **Step 1: Write the failing test**

Create `src/report/confidence.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { ReliabilityCard } from "../assess/reliability.js";
import { buildConfidenceCard, buildRiskyAssumptions } from "./confidence.js";

const base: ReliabilityCard = {
  composition: null,
  attributes: [{ dim: "연령", provenance: "matched", confidence: "high" }],
  responseConsistency: { status: "not-measured", reason: "키 필요(묶음 B)" },
  guardrails: ["synthetic panel response — 실제 예측 아님"],
  missingAxes: ["소득", "직업", "자녀"],
};

describe("confidence mapping", () => {
  test("fidelity 없으면(composition null) 구성 신뢰도 unknown (high 추정 금지)", () => {
    const cc = buildConfidenceCard(base);
    expect(cc.composition.label).toBe("unknown");
    expect(cc.composition.reason).toMatch(/검증 정보|미제공/);
  });

  test("composition 있으면 🟢→high", () => {
    const cc = buildConfidenceCard({ ...base, composition: { signal: "🟢", mae: 0, tvd: 0 } });
    expect(cc.composition.label).toBe("high");
  });

  test("응답 신뢰도는 항상 unknown(미측정), 시장판단은 low(부정형)", () => {
    const cc = buildConfidenceCard(base);
    expect(cc.responseConsistency.label).toBe("unknown");
    expect(cc.marketJudgment.label).toBe("low");
    expect(cc.marketJudgment.whatThisDoesNotAllow).toMatch(/소득|가격/);
  });

  test("가격 신호 + 소득축 결핍 → 가격 riskyAssumption 포함", () => {
    const ra = buildRiskyAssumptions(base, true, 0);
    expect(ra.some((a) => a.assumption.includes("가격"))).toBe(true);
  });

  test("low-n 세그먼트 있으면 표본 riskyAssumption 포함", () => {
    const ra = buildRiskyAssumptions(base, false, 3);
    expect(ra.some((a) => a.assumption.includes("소표본") || a.whyRisky.includes("minN"))).toBe(true);
  });

  test("LLM 실측 아님 riskyAssumption은 항상 포함", () => {
    const ra = buildRiskyAssumptions(base, false, 0);
    expect(ra.some((a) => a.assumption.includes("실제 사용자 반응") || a.assumption.includes("가상 응답"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/report/confidence.test.ts`
Expected: FAIL — `Cannot find module './confidence.js'`.

- [ ] **Step 3: Create `src/report/confidence.ts`**

```ts
import type { ReliabilityCard } from "../assess/reliability.js";
import type { Confidence, ConfidenceCard, RiskyAssumption } from "./types.js";

export function worstAttributeConfidence(card: ReliabilityCard): Confidence {
  const labels = card.attributes.map((a) => a.confidence);
  if (labels.includes("low")) return "low";
  if (labels.includes("unknown") || labels.length === 0) return "unknown";
  if (labels.includes("medium")) return "medium";
  return "high";
}

export function buildConfidenceCard(card: ReliabilityCard): ConfidenceCard {
  const composition = card.composition
    ? {
        label: (card.composition.signal === "🟢" ? "high" : "medium") as Confidence,
        reason: `통계청 재집계 MAE ${card.composition.mae.toFixed(4)} · TVD ${card.composition.tvd.toFixed(4)}`,
        whatThisAllows: "성·연령·권역 등 패널 구성의 대표성 참고",
        whatThisDoesNotAllow: "응답 내용의 정확성 보증",
      }
    : {
        label: "unknown" as Confidence,
        reason: "구성 신뢰도 검증 정보(fidelity)가 미제공되어 통계청 분포 적합도를 알 수 없음",
        whatThisAllows: "패널 구조 참고(주의)",
        whatThisDoesNotAllow: "통계청 분포 적합도 보증",
      };

  const attrLabel = worstAttributeConfidence(card);
  const attributes = {
    label: attrLabel,
    reason: card.attributes
      .map((a) => `${a.dim}:${a.provenance}`)
      .join(", "),
    whatThisAllows: "matched 속성 기반 세그먼트 해석",
    whatThisDoesNotAllow: "conditioned/inferred 속성에 기댄 결론의 확신",
  };

  const responseConsistency = {
    label: "unknown" as Confidence,
    reason: card.responseConsistency.reason,
    whatThisAllows: "구조·파이프라인 점검",
    whatThisDoesNotAllow: "LLM 응답 일관성(예스맨/평균회귀) 판단 — 미측정",
  };

  const marketJudgment = {
    label: "low" as Confidence,
    reason: card.guardrails.join(" "),
    whatThisAllows: "방향 가설 탐색 · 인터뷰 대상 좁히기",
    whatThisDoesNotAllow: card.missingAxes.length
      ? `${card.missingAxes.join("·")} 축 없음 — 가격·구매력·실제 구매율 판단`
      : "실측 전이라 의사결정 근거로 사용",
  };

  return { composition, attributes, responseConsistency, marketJudgment };
}

export function buildRiskyAssumptions(
  card: ReliabilityCard,
  hasPriceSignal: boolean,
  observedButHeldCount: number,
): RiskyAssumption[] {
  const out: RiskyAssumption[] = [];
  out.push({
    assumption: "LLM 응답이 실제 사용자 반응과 같다",
    whyRisky: "조건화된 가상 응답(synthetic panel)이라 실제 행동과 다를 수 있음",
    howToTest: "우선순위 세그먼트 대상 실제 고객 인터뷰",
  });
  if (hasPriceSignal && card.missingAxes.length) {
    out.push({
      assumption: "이 결과로 가격/구매력을 판단할 수 있다",
      whyRisky: `${card.missingAxes.join("·")} 축이 없어 지불의향 추정 불가`,
      howToTest: "소득 포함 설문 또는 지불의향 인터뷰",
    });
  }
  if (card.attributes.some((a) => a.provenance === "conditioned" || a.provenance === "inferred")) {
    out.push({
      assumption: "추정(conditioned/inferred) 속성 기반 세그먼트 결론이 견고하다",
      whyRisky: "해당 속성은 연령 경유 조건부 추정이라 상관이 약함",
      howToTest: "해당 속성을 실제 응답자에게 직접 수집",
    });
  }
  if (observedButHeldCount > 0) {
    out.push({
      assumption: "소표본 세그먼트의 신호가 유효하다",
      whyRisky: `${observedButHeldCount}개 세그먼트가 minN 미만 — 우연일 수 있음`,
      howToTest: "표본 수(N)를 늘려 재확인",
    });
  }
  return out;
}
```

- [ ] **Step 4: generate.ts 결선**

`src/report/generate.ts`에서:
- `assessReliability(result, { fidelity: ctx?.fidelity, bridges: ctx?.bridges })` 호출 → `card`
- `confidenceCard = buildConfidenceCard(card)`
- `hasPriceSignal = /원|월|구독|가격|₩|price/i.test(`${options.question} ${positiveChoice}`)`
- `riskyAssumptions = buildRiskyAssumptions(card, hasPriceSignal, observedButHeld.length)`
- `appendix.reliabilityCardRaw = card`
- **세그먼트 confidence 덮어쓰기**: 각 SegmentInsight에 대해, 그 dim의 `card.attributes` 항목 confidence를 찾아 대입(없으면 unknown). 가격 신호 + 축 결핍이면 관련 세그먼트 caveat에 "가격 판단 저신뢰" 추가.
- `executiveSummary` 완성:
  - `headline`: 전체 signal 기반 — split이면 `"전체 반응은 갈렸지만, ${topOpportunity ?? "일부 세그먼트"}에서 상대적으로 긍정 신호가 강합니다."`, consensus면 `"전체적으로 ${result.signal === "consensus" ? "합의된" : ""} 반응입니다."` (성공 단정 금지)
  - `doNotTrustYet = confidenceCard.marketJudgment.whatThisDoesNotAllow`
  - `thisWeekAction = topOpportunity ? `${topOpportunity} 세그먼트부터 인터뷰 대상 좁히기` : "표본이 큰 세그먼트부터 인터뷰 설계"`

- [ ] **Step 5: 배럴 export**

`src/index.ts`에 추가:

```ts
export {
  generateFounderInsightReport,
  type FounderReportOptions,
} from "./report/generate.js";
export type {
  FounderInsightReport,
  SegmentInsight,
  ConfidenceCard,
  ConfidenceLayer,
  RiskyAssumption,
  DriverInsight,
  InterviewTarget,
  InterviewQuestion,
  SurveyQuestion,
  MessageTest,
  ValidationAction,
  ReportAppendix,
  Confidence,
  Basis,
  FounderGoal,
  ConceptMeta,
} from "./report/types.js";
```

- [ ] **Step 6: Run tests + gate**

Run: `npx vitest run src/report/ && npx tsc --noEmit && npm run lint`
Expected: report 테스트 전부 PASS, tsc exit 0, biome clean.

- [ ] **Step 7: Lint + commit + 전체 게이트**

```bash
npx biome check --write src/report/confidence.ts src/report/confidence.test.ts src/report/generate.ts src/index.ts
git add src/report/confidence.ts src/report/confidence.test.ts src/report/generate.ts src/index.ts
git commit -m "feat(P4-1): confidence card + risky assumptions + exec summary + 배럴 export"
npm test && npm run lint && npx tsc --noEmit && npm run build
```
Expected: 전부 그린.

---

## P4-1 Self-Review (plan author)

**Spec coverage (P4-1 범위):** 타입(Task1) · 입력검증+overall+appendix caveat(Task1, 보완 #1·#2) · 세그먼트 랭킹 기준선 대비 차이(Task2, 보완 #3) · minN low-n 판단보류(Task2, 보완 #4 데이터 보존; cap은 P4-3) · confidence/risky(Task3) · fidelity 없으면 unknown(Task3, 보완 #6) · disclaimer(Task1) · 처방 빈 배열(보완 #7). ✓
**Placeholder scan:** 모든 스텝에 실제 코드. Task2/3의 generate 결선은 정확한 함수·필드명 명시(코드 조각). ✓
**Type consistency:** `generateFounderInsightReport`·`rankSegments`·`buildConfidenceCard`·`buildRiskyAssumptions`·`worstAttributeConfidence`·`SegmentInsight` 필드가 types.ts와 일치. `ReliabilityCard` 실제 구조(composition/attributes/responseConsistency/guardrails/missingAxes)와 일치. ✓

---

# ===== P4-2: Actionable Founder Prescriptions (heuristic v1) — 아웃라인 =====

> P4-1 완료 후 이 절을 bite-sized로 상세화한다. 범위·인터페이스만 확정.

**목표:** 리포트에 처방(다음 행동)을 채운다 — 전부 `provenance:"inferred"`, `basis:"heuristic"`.

**파일:** `src/report/prescriptions.ts`(+test), `src/report/generate.ts` 수정(generator 주입).

**인터페이스:**
```ts
interface PrescriptionContext {
  options: FounderReportOptions;
  positiveChoice: string;
  opportunitySegments: SegmentInsight[];
  resistanceSegments: SegmentInsight[];
  confidenceCard: ConfidenceCard;
  hasPriceSignal: boolean;
}
interface PrescriptionGenerator {
  drivers(ctx: PrescriptionContext): { drivers: DriverInsight[]; objections: DriverInsight[] };
  interviews(ctx: PrescriptionContext): InterviewTarget[];       // 3~5개
  interviewQuestions(ctx: PrescriptionContext): InterviewQuestion[]; // 8~12개, 과거행동 우선
  survey(ctx: PrescriptionContext): SurveyQuestion[];
  landingTests(ctx: PrescriptionContext): MessageTest[];
  validationPlan(ctx: PrescriptionContext): ValidationAction[];  // Day 1~7
}
```
`generateFounderInsightReport(result, options, ctx, generator = new HeuristicPrescriptionGenerator())` — generator 주입 기본값. issue #4 LLM v2가 이 인터페이스를 구현해 스왑.

**규칙:** 질문 키워드 heuristic(신뢰/가격/구독) → 매칭 실패 시 generic 폴백 + "free-text reason 수집 필요". 가격 축 결핍 → price 문항 caution. 인터뷰 질문 과거행동형("최근 한 달…"). "이 앱 쓰겠어요?" 지양.

**테스트:** 처방 전부 heuristic/inferred · 축결핍→price caution · 인터뷰 질문 과거행동형 존재 · opportunity 없으면 안전한 폴백.

---

# ===== P4-3: Markdown Renderer + Demo + Docs — 아웃라인 =====

**목표:** 리포트를 markdown으로 렌더 + 키 없는 데모 + 문서.

**파일:** `src/report/render.ts`(+test), `eval/report-demo.ts`(+test), `package.json`(`report:demo`), `tsup.config.ts`(entry), `docs/README-intro.md`.

**렌더 13 섹션:** 한줄요약·전체신호·기회·저항·관심/거부 이유·위험가정·신뢰도카드·추천인터뷰·인터뷰질문·설문초안·랜딩테스트·다음7일·라벨(상단+하단).
- 처방 섹션(추천인터뷰~랜딩)에 **"⚠️ AI 생성 초안 · 검토 필요"** 배너.
- **observedButHeld cap (보완 #4)**: markdown엔 상위 `min(10, N)`개만, 나머지는 `appendix.observedButHeldCount` 기반 "외 N개 (판단 보류)" 요약. 데이터 객체엔 전량 보존.
- 모든 숫자 옆 synthetic panel 라벨/주의.

**데모:** `eval/report-demo.ts` = census 합성인구 + MockProvider로 study 실행 → `generateFounderInsightReport` → `renderFounderInsightReport` 출력. `npm run report:demo`(tsup entry 추가 필수).

**테스트:** 13 섹션 존재 · "초안 검토 필요" 배너 · synthetic panel 라벨 · low-n cap 동작 · report:demo 실측.

**게이트:** `npm test`/`lint`/`tsc`/`build`/`report:demo`.

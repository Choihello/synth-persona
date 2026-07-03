# Founder Report P4-2(처방 heuristic) + P4-3(렌더러·데모·문서) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** P4-1에서 빈 배열로 남긴 처방 필드 7종을 heuristic v1으로 채우고, 리포트를 markdown으로 렌더하는 키 없는 데모까지 완성한다.

**Architecture:** `PrescriptionGenerator` 인터페이스 + `HeuristicPrescriptionGenerator` 기본 구현(순수 함수·rule/template, LLM 호출 없음)을 `generateFounderInsightReport`에 주입한다. 렌더러는 `FounderInsightReport` → markdown 순수 변환. 데모는 기존 `reliability-demo` 패턴 재사용.

**Tech Stack:** TypeScript(ESM, `.js` 확장자 import), vitest, biome, tsup. 신규 의존성 없음.

## Global Constraints

- 모든 수치는 **synthetic panel response** — disclaimer 상단+하단 필수.
- 처방은 전부 `provenance:"inferred"` + `basis:"heuristic"`, 렌더 시 "⚠️ AI 생성 초안 · 검토 필요" 배너.
- **LLM/외부 API 호출 금지** (LLM v2는 issue #4 후속).
- `src/types.ts`·`src/aggregate/uncertainty.ts` 수정 금지 (read-only 오버레이).
- 런타임 의존성 추가 금지 (`@anthropic-ai/sdk` 단일 유지).
- 각 태스크 완료 시 `npm test` + `npm run lint` + `npx tsc --noEmit` 그린 후 커밋.
- 브랜치: `feat/founder-report-p4-1`에 이어서 커밋 (P4-1 커밋 3개 위에 쌓는다).
- 기존 플랜의 P4-2 아웃라인 대비 인터페이스 변경 1건: `PrescriptionContext`에 `priceAxisMissing: boolean` 추가 (가격 축 결핍 caution 규칙을 generator가 알아야 하므로 — generate.ts의 `card.missingAxes.length > 0`를 전달).

---

### Task 1: 테마 감지 + drivers/objections heuristic

**Files:**
- Create: `src/report/prescriptions.ts`
- Test: `src/report/prescriptions.test.ts`

**Interfaces:**
- Consumes: `src/report/types.ts`의 `DriverInsight`, `SegmentInsight`, `ConfidenceCard`, `FounderReportOptions` (P4-1에서 정의됨, 수정 금지)
- Produces: `PrescriptionContext`, `PrescriptionGenerator`, `HeuristicPrescriptionGenerator`(drivers만), `detectThemes(question: string): Theme[]` — Task 2~4가 이 타입/클래스에 메서드를 추가·사용한다

- [x] **Step 1: 실패하는 테스트 작성**

```ts
// src/report/prescriptions.test.ts
import { describe, expect, it } from "vitest";
import type { ConfidenceCard, SegmentInsight } from "./types.js";
import {
  detectThemes,
  HeuristicPrescriptionGenerator,
  type PrescriptionContext,
} from "./prescriptions.js";

export function fakeLayer(label = "low") {
  return {
    label: label as "high" | "medium" | "low" | "unknown",
    reason: "",
    whatThisAllows: "",
    whatThisDoesNotAllow: "",
  };
}
export function fakeCard(): ConfidenceCard {
  return {
    composition: fakeLayer("unknown"),
    attributes: fakeLayer("medium"),
    responseConsistency: fakeLayer("unknown"),
    marketJudgment: fakeLayer("low"),
  };
}
export function seg(
  label: string,
  over: Partial<SegmentInsight> = {},
): SegmentInsight {
  return {
    segmentLabel: label,
    segmentDefinition: `${label.split("=")[0]}이(가) "${label.split("=")[1]}"인 응답자`,
    sampleCount: 20,
    sampleWeightShare: 0.2,
    responseDistribution: { 쓴다: 14, 안쓴다: 6 },
    positiveRatio: 0.7,
    signal: "consensus",
    whyItMatters: "",
    likelyReasoning: "",
    confidence: "high",
    caveats: [],
    recommendedFollowUpQuestion: "",
    ...over,
  };
}
export function baseCtx(
  over: Partial<PrescriptionContext> = {},
): PrescriptionContext {
  return {
    options: {
      question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
      choices: ["쓴다", "안쓴다"],
    },
    positiveChoice: "쓴다",
    opportunitySegments: [seg("연령=25~29세")],
    resistanceSegments: [seg("연령=50~54세", { positiveRatio: 0.2 })],
    confidenceCard: fakeCard(),
    hasPriceSignal: true,
    priceAxisMissing: true,
    ...over,
  };
}

describe("detectThemes", () => {
  it("가격·구독 키워드를 감지한다", () => {
    expect(detectThemes("월 9900원에 구독?")).toEqual(
      expect.arrayContaining(["price", "subscription"]),
    );
  });
  it("매칭 실패 시 generic 폴백", () => {
    expect(detectThemes("이 색상 어때요?")).toEqual(["generic"]);
  });
});

describe("drivers", () => {
  const gen = new HeuristicPrescriptionGenerator();
  it("모든 driver/objection이 inferred+heuristic+low", () => {
    const { drivers, objections } = gen.drivers(baseCtx());
    for (const d of [...drivers, ...objections]) {
      expect(d.provenance).toBe("inferred");
      expect(d.basis).toBe("heuristic");
      expect(d.confidence).toBe("low");
    }
    expect(drivers.length).toBeGreaterThan(0);
    expect(objections.length).toBeGreaterThan(0);
  });
  it("generic 폴백 시 free-text 수집 필요 문구 포함", () => {
    const ctx = baseCtx({
      options: { question: "이 색상 어때요?", choices: ["A", "B"] },
      hasPriceSignal: false,
    });
    const { drivers } = gen.drivers(ctx);
    expect(drivers.some((d) => d.rationale.includes("인터뷰로 확인"))).toBe(
      true,
    );
  });
});
```

- [x] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/report/prescriptions.test.ts`
Expected: FAIL — `Cannot find module './prescriptions.js'`

- [x] **Step 3: 최소 구현**

```ts
// src/report/prescriptions.ts
import type {
  ConfidenceCard,
  DriverInsight,
  FounderReportOptions,
  InterviewQuestion,
  InterviewTarget,
  MessageTest,
  SegmentInsight,
  SurveyQuestion,
  ValidationAction,
} from "./types.js";

export interface PrescriptionContext {
  options: FounderReportOptions;
  positiveChoice: string;
  opportunitySegments: SegmentInsight[];
  resistanceSegments: SegmentInsight[];
  confidenceCard: ConfidenceCard;
  hasPriceSignal: boolean;
  /** 가격 판단에 필요한 축(소득·직업·자녀)이 데이터에 없는가 (card.missingAxes 기반) */
  priceAxisMissing: boolean;
}

export interface PrescriptionGenerator {
  drivers(ctx: PrescriptionContext): {
    drivers: DriverInsight[];
    objections: DriverInsight[];
  };
  interviews(ctx: PrescriptionContext): InterviewTarget[];
  interviewQuestions(ctx: PrescriptionContext): InterviewQuestion[];
  survey(ctx: PrescriptionContext): SurveyQuestion[];
  landingTests(ctx: PrescriptionContext): MessageTest[];
  validationPlan(ctx: PrescriptionContext): ValidationAction[];
}

export type Theme = "price" | "subscription" | "trust" | "generic";

const THEME_PATTERNS: Array<{ theme: Theme; pattern: RegExp }> = [
  { theme: "price", pattern: /원|₩|가격|비용|유료|price/i },
  { theme: "subscription", pattern: /구독|정기|멤버십|월\s?\d/i },
  { theme: "trust", pattern: /신뢰|안전|보안|개인정보|위생/i },
];

export function detectThemes(question: string): Theme[] {
  const hits = THEME_PATTERNS.filter((t) => t.pattern.test(question)).map(
    (t) => t.theme,
  );
  return hits.length ? hits : ["generic"];
}

// 처방 공통 라벨: 전부 추정(heuristic 초안). LLM v2(issue #4)가 같은 인터페이스로 교체.
const INF = { provenance: "inferred", basis: "heuristic" } as const;
const LOW = { ...INF, confidence: "low" } as const;

const DRIVER_TEMPLATES: Record<
  Theme,
  { driver: DriverInsight; objection: DriverInsight }
> = {
  price: {
    driver: {
      label: "가격 대비 효용 기대",
      rationale:
        "질문에 가격 신호 — 효용>비용으로 인식한 응답자가 긍정했을 가능성 (추정, 인터뷰로 확인)",
      ...LOW,
    },
    objection: {
      label: "가격 부담 · 대체재 대비 비쌈",
      rationale:
        "가격이 명시된 질문에서 거부의 1순위 후보는 지불 저항 (추정, 인터뷰로 확인)",
      ...LOW,
    },
  },
  subscription: {
    driver: {
      label: "반복 필요의 자동화(습관화) 기대",
      rationale:
        "구독형 질문 — 반복 소비를 자동화하려는 동기가 긍정을 이끌었을 가능성 (추정, 인터뷰로 확인)",
      ...LOW,
    },
    objection: {
      label: "구독 피로 · 해지 번거로움",
      rationale:
        "구독형 질문에서 흔한 거부 요인은 구독 누적 피로와 락인 우려 (추정, 인터뷰로 확인)",
      ...LOW,
    },
  },
  trust: {
    driver: {
      label: "신뢰·안전이 확보되면 쓰겠다는 조건부 긍정",
      rationale:
        "신뢰/안전 키워드 — 품질 보증이 충족될 때만 긍정으로 전환되는 조건부 수요 가능성 (추정, 인터뷰로 확인)",
      ...LOW,
    },
    objection: {
      label: "신뢰·안전 우려(품질/보안/개인정보)",
      rationale:
        "신뢰 관련 질문에서 거부는 대개 검증 안 된 공급자에 대한 불안 (추정, 인터뷰로 확인)",
      ...LOW,
    },
  },
  generic: {
    driver: {
      label: "문제 해결 기대 (구체 이유 미상)",
      rationale:
        "질문에서 도메인 신호를 찾지 못함 — free-text 이유 미수집 상태이므로 실제 끌림 이유는 인터뷰로 확인 필요",
      ...LOW,
    },
    objection: {
      label: "현상 유지 · 대체재 관성",
      rationale:
        "구체 신호 없음 — 가장 흔한 기본 거부 요인은 '지금 방식으로 충분함'. 실제 이유는 인터뷰로 확인 필요",
      ...LOW,
    },
  },
};

export class HeuristicPrescriptionGenerator implements PrescriptionGenerator {
  drivers(ctx: PrescriptionContext): {
    drivers: DriverInsight[];
    objections: DriverInsight[];
  } {
    const themes = detectThemes(ctx.options.question);
    return {
      drivers: themes.map((t) => DRIVER_TEMPLATES[t].driver),
      objections: themes.map((t) => DRIVER_TEMPLATES[t].objection),
    };
  }
  // interviews/interviewQuestions/survey/landingTests/validationPlan은 Task 2~3에서 구현
  interviews(_ctx: PrescriptionContext): InterviewTarget[] {
    throw new Error("not implemented — Task 2");
  }
  interviewQuestions(_ctx: PrescriptionContext): InterviewQuestion[] {
    throw new Error("not implemented — Task 2");
  }
  survey(_ctx: PrescriptionContext): SurveyQuestion[] {
    throw new Error("not implemented — Task 3");
  }
  landingTests(_ctx: PrescriptionContext): MessageTest[] {
    throw new Error("not implemented — Task 3");
  }
  validationPlan(_ctx: PrescriptionContext): ValidationAction[] {
    throw new Error("not implemented — Task 3");
  }
}
```

- [x] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/report/prescriptions.test.ts`
Expected: PASS (4 tests)

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/report/prescriptions.ts src/report/prescriptions.test.ts
git commit -m "feat(report): heuristic drivers/objections + theme detection"
```

---

### Task 2: 인터뷰 대상 + 인터뷰 질문 heuristic

**Files:**
- Modify: `src/report/prescriptions.ts` (Task 1의 `interviews`/`interviewQuestions` placeholder 교체)
- Test: `src/report/prescriptions.test.ts` (추가)

**Interfaces:**
- Consumes: Task 1의 `PrescriptionContext`, `detectThemes`, `INF` 상수, 테스트 헬퍼 `baseCtx`/`seg`
- Produces: `interviews(ctx): InterviewTarget[]` (3~5개, opportunity 없으면 폴백 1개 이상), `interviewQuestions(ctx): InterviewQuestion[]` (8~12개, 과거행동형 우선)

- [x] **Step 1: 실패하는 테스트 추가**

```ts
// src/report/prescriptions.test.ts 에 추가
describe("interviews", () => {
  const gen = new HeuristicPrescriptionGenerator();
  it("기회+저항에서 3~5개 대상, 전부 inferred/heuristic", () => {
    const ctx = baseCtx({
      opportunitySegments: [seg("연령=25~29세"), seg("가구원수=1인가구")],
      resistanceSegments: [seg("연령=50~54세", { positiveRatio: 0.2 })],
    });
    const targets = gen.interviews(ctx);
    expect(targets.length).toBeGreaterThanOrEqual(3);
    expect(targets.length).toBeLessThanOrEqual(5);
    for (const t of targets) {
      expect(t.provenance).toBe("inferred");
      expect(t.basis).toBe("heuristic");
      expect(t.sampleSizeRecommendation).toContain("5~8");
    }
  });
  it("기회/저항이 비면 안전한 폴백 대상을 낸다", () => {
    const ctx = baseCtx({ opportunitySegments: [], resistanceSegments: [] });
    const targets = gen.interviews(ctx);
    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect(targets[0].whyInterview).toContain("랭킹");
  });
});

describe("interviewQuestions", () => {
  const gen = new HeuristicPrescriptionGenerator();
  it("8~12개, 과거 행동형 질문이 존재하고 가정형 사용의향 직문이 없다", () => {
    const qs = gen.interviewQuestions(baseCtx());
    expect(qs.length).toBeGreaterThanOrEqual(8);
    expect(qs.length).toBeLessThanOrEqual(12);
    expect(qs.some((q) => /최근|마지막|실제로/.test(q.text))).toBe(true);
    expect(qs.some((q) => /쓰시겠어요\?|쓰겠어요\?/.test(q.text))).toBe(false);
  });
  it("가격 테마 + 축 결핍이면 price 질문에 caution", () => {
    const qs = gen.interviewQuestions(baseCtx({ priceAxisMissing: true }));
    const priceQ = qs.find((q) => q.type === "price");
    expect(priceQ).toBeDefined();
    expect(priceQ?.caution).toContain("소득");
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/report/prescriptions.test.ts`
Expected: FAIL — `not implemented — Task 2`

- [x] **Step 3: 구현 (placeholder 메서드 교체)**

```ts
// HeuristicPrescriptionGenerator 내부 — interviews/interviewQuestions 교체
interviews(ctx: PrescriptionContext): InterviewTarget[] {
  const targets: InterviewTarget[] = [];
  for (const s of ctx.opportunitySegments.slice(0, 2)) {
    targets.push({
      targetLabel: s.segmentLabel,
      whyInterview: "긍정 신호가 전체 평균보다 강함 — 끌리는 실제 이유 확인",
      whatToValidate: `"${ctx.positiveChoice}" 반응의 실제 동기와 사용/지불 맥락`,
      suggestedRecruitingScreener: `${s.segmentDefinition} 조건으로 스크리닝`,
      sampleSizeRecommendation: "5~8명 (질적 포화 최소선)",
      ...INF,
    });
  }
  for (const s of ctx.resistanceSegments.slice(0, 2)) {
    targets.push({
      targetLabel: s.segmentLabel,
      whyInterview: "저항이 전체 평균보다 강함 — 거부 이유·병목 확인",
      whatToValidate: "거부의 실제 이유(가격·신뢰·습관·대체재 중 무엇인지)",
      suggestedRecruitingScreener: `${s.segmentDefinition} 조건으로 스크리닝`,
      sampleSizeRecommendation: "5~8명 (질적 포화 최소선)",
      ...INF,
    });
  }
  if (targets.length === 0) {
    targets.push({
      targetLabel: "표본 최다 세그먼트 (판단 보류 상태)",
      whyInterview:
        "minN을 넘는 기회/저항 세그먼트가 없어 랭킹이 비어 있음 — 표본이 큰 집단부터 이유 수집",
      whatToValidate: "반응 방향과 그 이유 (탐색적)",
      suggestedRecruitingScreener: "핵심 인구 축(연령/가구) 기준 광범위 모집",
      sampleSizeRecommendation: "5~8명 (질적 포화 최소선)",
      ...INF,
    });
  }
  return targets.slice(0, 5);
}

interviewQuestions(ctx: PrescriptionContext): InterviewQuestion[] {
  const themes = detectThemes(ctx.options.question);
  const qs: InterviewQuestion[] = [
    {
      text: "최근 한 달 동안 이 질문의 상황과 관련해 가장 불편했던 순간을 구체적으로 말씀해 주세요.",
      type: "problem-discovery",
      ...INF,
    },
    {
      text: "지금은 그 문제를 어떻게 해결하고 계세요? 최근에 실제로 쓴 방법 기준으로요.",
      type: "current-alternative",
      ...INF,
    },
    { text: "그 상황이 최근 한 달에 몇 번쯤 있었나요?", type: "frequency", ...INF },
    {
      text: "지금 방식에 돈이나 시간을 실제로 얼마나 쓰고 계세요?",
      type: "current-alternative",
      ...INF,
    },
    {
      text: "그 문제를 해결하려고 마지막으로 시도했다가 그만둔 것이 있다면, 무엇이었고 왜 그만두셨나요?",
      type: "problem-discovery",
      ...INF,
    },
    {
      text: "비슷한 서비스나 제품에 실제로 돈을 내 본 적이 있나요? 언제, 왜였나요?",
      type: "willingness",
      caution: "가정형('쓰실 건가요?') 대신 과거 지불 행동으로 확인",
      ...INF,
    },
    {
      text: "새로운 서비스를 쓰기 전에 가장 걱정되는 점은 보통 무엇인가요?",
      type: "trust-barrier",
      ...INF,
    },
    {
      text: "이 컨셉 설명을 들었을 때 가장 와닿는 부분과 가장 걸리는 부분은 어디인가요?",
      type: "message-test",
      ...INF,
    },
  ];
  if (themes.includes("price")) {
    qs.push({
      text: "가장 최근에 '비싸서 포기한' 비슷한 지출은 무엇이었나요?",
      type: "price",
      caution: ctx.priceAxisMissing
        ? "소득·직업 축 없음 — 지불의향은 참고만, 단정 금지"
        : undefined,
      ...INF,
    });
  }
  if (themes.includes("subscription")) {
    qs.push({
      text: "지금 유지 중인 구독과 최근 6개월 안에 해지한 구독은 무엇이고, 해지한 이유는요?",
      type: "current-alternative",
      ...INF,
    });
  }
  if (themes.includes("trust")) {
    qs.push({
      text: "믿고 쓰게 된 서비스가 하나 있다면, 무엇이 그 신뢰를 만들었나요?",
      type: "trust-barrier",
      ...INF,
    });
  }
  return qs.slice(0, 12);
}
```

- [x] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/report/prescriptions.test.ts`
Expected: PASS

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/report/prescriptions.ts src/report/prescriptions.test.ts
git commit -m "feat(report): heuristic interview targets and questions"
```

---

### Task 3: 설문 초안 + 랜딩 테스트 + 7일 검증 플랜

**Files:**
- Modify: `src/report/prescriptions.ts` (`survey`/`landingTests`/`validationPlan` placeholder 교체)
- Test: `src/report/prescriptions.test.ts` (추가)

**Interfaces:**
- Consumes: Task 1~2와 동일
- Produces: `survey(ctx): SurveyQuestion[]`, `landingTests(ctx): MessageTest[]`, `validationPlan(ctx): ValidationAction[]` (Day 1~7)

- [x] **Step 1: 실패하는 테스트 추가**

```ts
// src/report/prescriptions.test.ts 에 추가
describe("survey / landingTests / validationPlan", () => {
  const gen = new HeuristicPrescriptionGenerator();
  it("설문에 free-text reason 문항이 있고, 가격 축 결핍 시 price 문항은 optional+caution", () => {
    const out = gen.survey(baseCtx({ priceAxisMissing: true }));
    expect(out.some((q) => q.kind === "reason")).toBe(true);
    const price = out.find((q) => q.kind === "price");
    expect(price?.optional).toBe(true);
    expect(price?.caution).toContain("소득");
  });
  it("랜딩 테스트는 기회 세그먼트를 타겟팅하고 caution을 가진다", () => {
    const tests = gen.landingTests(baseCtx());
    expect(tests.length).toBeGreaterThanOrEqual(1);
    expect(tests[0].targetSegment).toBe("연령=25~29세");
    expect(tests[0].caution).toContain("검토");
  });
  it("기회 세그먼트가 없어도 랜딩 테스트 폴백 1개", () => {
    const tests = gen.landingTests(baseCtx({ opportunitySegments: [] }));
    expect(tests.length).toBe(1);
    expect(tests[0].targetSegment).toContain("미확정");
  });
  it("검증 플랜은 Day 1~7을 덮는다", () => {
    const plan = gen.validationPlan(baseCtx());
    expect(plan.length).toBeGreaterThanOrEqual(5);
    expect(plan[0].day).toContain("Day 1");
    expect(plan[plan.length - 1].day).toContain("Day 7");
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/report/prescriptions.test.ts`
Expected: FAIL — `not implemented — Task 3`

- [x] **Step 3: 구현 (placeholder 메서드 교체)**

```ts
// HeuristicPrescriptionGenerator 내부 — survey/landingTests/validationPlan 교체
survey(ctx: PrescriptionContext): SurveyQuestion[] {
  const out: SurveyQuestion[] = [
    { text: "연령대를 선택해 주세요.", kind: "segmentation", ...INF },
    {
      text: "이 질문의 상황을 한 달에 몇 번쯤 겪으시나요?",
      kind: "problem-frequency",
      ...INF,
    },
    {
      text: "지금은 주로 어떻게 해결하시나요? (복수 선택)",
      kind: "alternative",
      ...INF,
    },
    {
      text: `이 컨셉을 보고 어느 쪽에 가깝나요? (${ctx.options.choices.join(" / ")})`,
      kind: "concept-reaction",
      ...INF,
    },
    {
      text: "그렇게 답한 가장 큰 이유를 자유롭게 적어 주세요.",
      kind: "reason",
      caution:
        "synthetic panel에는 없는 free-text 이유 — 실측에서 반드시 수집",
      ...INF,
    },
  ];
  if (ctx.hasPriceSignal) {
    out.push({
      text: "제시된 가격은 어떻게 느껴지나요? (너무 싸다/적당하다/비싸지만 살 만하다/너무 비싸다)",
      kind: "price",
      optional: true,
      caution: ctx.priceAxisMissing
        ? "소득 축 없는 상태의 가격 반응은 참고용 — 단정 금지"
        : undefined,
      ...INF,
    });
  }
  return out;
}

landingTests(ctx: PrescriptionContext): MessageTest[] {
  const name = ctx.options.concept?.productName ?? "이 컨셉";
  const tops = ctx.opportunitySegments.slice(0, 2);
  if (tops.length === 0) {
    return [
      {
        headline: `${name} — 핵심 효용 한 줄 (초안)`,
        subcopy: "대상 세그먼트 미확정 — 광범위 카피로 세그먼트별 반응 수집",
        targetSegment: "전체 (세그먼트 미확정)",
        hypothesis: "특정 세그먼트에서 전환이 상대적으로 높게 나타날 것",
        successMetric: "방문→이메일 등록 전환율 (세그먼트별 비교)",
        caution: "AI 생성 초안 — 실제 카피는 검토·수정 필요",
        ...INF,
      },
    ];
  }
  return tops.map((s) => ({
    headline: `${name}, ${s.segmentLabel.split("=")[1]}을(를) 위한 핵심 효용 한 줄 (초안)`,
    subcopy: `"${ctx.positiveChoice}" 반응이 강했던 세그먼트용 카피 초안 — 실제 효용 문구로 교체할 것`,
    targetSegment: s.segmentLabel,
    hypothesis: "이 세그먼트 유입에서 등록 전환율이 다른 세그먼트보다 높을 것",
    successMetric: "방문→이메일 등록 전환율 (세그먼트 간 상대 비교)",
    caution: "AI 생성 초안 — 카피·타겟팅 모두 검토 필요",
    ...INF,
  }));
}

validationPlan(ctx: PrescriptionContext): ValidationAction[] {
  const top = ctx.opportunitySegments[0]?.segmentLabel;
  return [
    {
      day: "Day 1",
      action: `인터뷰 대상 확정(${top ?? "표본 최다 세그먼트"}) + 리크루팅 스크리너 작성`,
    },
    { day: "Day 2~3", action: "5~8명 리크루팅 (지인 제외, 스크리너 통과자만)" },
    { day: "Day 4~5", action: "인터뷰 실행 — 과거 행동 중심, 가정형 질문 금지" },
    {
      day: "Day 6",
      action: "응답 태깅 — 끌림/거부 이유와 병목(가격·신뢰·습관·대체재) 분류",
    },
    {
      day: "Day 7",
      action: "다음 단계 결정 — 설문/랜딩 테스트 진행 또는 컨셉 수정(피벗)",
    },
  ];
}
```

- [x] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/report/prescriptions.test.ts`
Expected: PASS

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/report/prescriptions.ts src/report/prescriptions.test.ts
git commit -m "feat(report): heuristic survey, landing tests, validation plan"
```

---

### Task 4: generate.ts에 generator 주입 + 배럴 export

**Files:**
- Modify: `src/report/generate.ts` (처방 필드 채움)
- Modify: `src/index.ts` (export 추가)
- Test: `src/report/generate.test.ts` (추가)

**Interfaces:**
- Consumes: Task 1~3의 `PrescriptionGenerator`, `HeuristicPrescriptionGenerator`, `PrescriptionContext`
- Produces: `generateFounderInsightReport(result, options, ctx?, generator?)` — 4번째 인자 기본값 `new HeuristicPrescriptionGenerator()`. P4-3 렌더러가 채워진 리포트를 소비한다.

- [x] **Step 1: 실패하는 테스트 추가**

```ts
// src/report/generate.test.ts 에 추가 (기존 헬퍼로 StudyResult를 만드는 패턴 재사용)
it("처방 필드가 heuristic generator로 채워진다", () => {
  // 기존 테스트 파일의 StudyResult 픽스처 헬퍼 사용
  const report = generateFounderInsightReport(fixtureResult(), {
    question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
    choices: ["쓴다", "안쓴다"],
  });
  expect(report.keyDrivers.length).toBeGreaterThan(0);
  expect(report.recommendedInterviews.length).toBeGreaterThanOrEqual(1);
  expect(report.interviewQuestions.length).toBeGreaterThanOrEqual(8);
  expect(report.surveyDraft.length).toBeGreaterThan(0);
  expect(report.nextValidationPlan.length).toBeGreaterThanOrEqual(5);
  for (const d of [...report.keyDrivers, ...report.keyObjections]) {
    expect(d.provenance).toBe("inferred");
    expect(d.basis).toBe("heuristic");
  }
});

it("커스텀 generator를 주입할 수 있다 (issue #4 LLM v2 스왑 지점)", () => {
  const stub = {
    drivers: () => ({ drivers: [], objections: [] }),
    interviews: () => [],
    interviewQuestions: () => [],
    survey: () => [],
    landingTests: () => [],
    validationPlan: () => [],
  };
  const report = generateFounderInsightReport(
    fixtureResult(),
    { question: "q?", choices: ["A", "B"] },
    undefined,
    stub,
  );
  expect(report.keyDrivers).toEqual([]);
  expect(report.nextValidationPlan).toEqual([]);
});
```

주의: `fixtureResult()`는 기존 `generate.test.ts`에 이미 있는 StudyResult 생성 헬퍼를 지칭한다 — 실제 이름이 다르면 그 파일의 기존 헬퍼를 그대로 사용할 것 (새로 만들지 말 것).

- [x] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/report/generate.test.ts`
Expected: FAIL — `keyDrivers.length` 0 (빈 배열)

- [x] **Step 3: generate.ts 수정**

시그니처와 처방 결선(기존 코드 유지, 아래만 변경):

```ts
// import 추가
import {
  HeuristicPrescriptionGenerator,
  type PrescriptionContext,
  type PrescriptionGenerator,
} from "./prescriptions.js";

// 시그니처 변경
export function generateFounderInsightReport(
  result: StudyResult,
  options: FounderReportOptions,
  ctx?: { fidelity?: FidelityReport; bridges?: Record<string, string> },
  generator: PrescriptionGenerator = new HeuristicPrescriptionGenerator(),
): FounderInsightReport {

// riskyAssumptions 계산 뒤, return 직전에 추가:
  const pctx: PrescriptionContext = {
    options,
    positiveChoice,
    opportunitySegments,
    resistanceSegments,
    confidenceCard,
    hasPriceSignal,
    priceAxisMissing: card.missingAxes.length > 0,
  };
  const { drivers, objections } = generator.drivers(pctx);

// return 객체의 처방 필드 교체:
    keyDrivers: drivers,
    keyObjections: objections,
    recommendedInterviews: generator.interviews(pctx),
    interviewQuestions: generator.interviewQuestions(pctx),
    surveyDraft: generator.survey(pctx),
    landingPageMessageTests: generator.landingTests(pctx),
    nextValidationPlan: generator.validationPlan(pctx),
```

`src/index.ts`에 추가:

```ts
export {
  HeuristicPrescriptionGenerator,
  detectThemes,
  type PrescriptionGenerator,
  type PrescriptionContext,
  type Theme,
} from "./report/prescriptions.js";
```

- [x] **Step 4: 테스트 통과 + 기존 테스트 회귀 확인**

Run: `npm test`
Expected: PASS 전체 (기존 P4-1 테스트 포함 — 처방이 빈 배열이라고 단언하는 기존 테스트가 있으면 "채워진다"로 업데이트)

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm run lint && npx tsc --noEmit && npm run build
git add src/report/generate.ts src/report/generate.test.ts src/index.ts
git commit -m "feat(report): inject prescription generator, fill founder report"
```

---

### Task 5: Markdown 렌더러 — 코어 섹션 (1~7)

**Files:**
- Create: `src/report/render.ts`
- Test: `src/report/render.test.ts`

**Interfaces:**
- Consumes: `FounderInsightReport` (P4-1 타입), Task 4로 채워진 리포트
- Produces: `renderFounderInsightReport(report: FounderInsightReport): string` — Task 6이 처방 섹션을 추가, Task 7 데모가 호출. `HELD_CAP = 10` export.

**렌더 순서 (13 섹션):** ① 제목+상단 disclaimer ② 한줄요약 ③ 전체 신호 ④ 기회 세그먼트 ⑤ 저항 세그먼트(+판단 보류 cap) ⑥ 관심/거부 이유 ⑦ 위험한 가정 ⑧ 신뢰도 카드 ⑨ 추천 인터뷰 ⑩ 인터뷰 질문 ⑪ 설문 초안 ⑫ 랜딩 메시지 테스트 ⑬ 다음 7일 + 하단 라벨. 이 태스크는 ①~⑧, Task 6이 ⑨~⑬.

- [x] **Step 1: 실패하는 테스트 작성**

```ts
// src/report/render.test.ts
import { describe, expect, it } from "vitest";
import { generateFounderInsightReport } from "./generate.js";
import { HELD_CAP, renderFounderInsightReport } from "./render.js";
import type { StudyResult } from "../types.js";

// 세그먼트 다수를 가진 StudyResult 픽스처 (판단 보류 cap 테스트용)
function bigResult(): StudyResult {
  const responses = [];
  // 연령 15구간 × 2명(소표본) → observedButHeld 15개 생성
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 2; j++) {
      responses.push({
        persona: {
          id: `p${i}-${j}`,
          attrs: { 연령: `구간${i}` },
          weight: 1,
        },
        answer: "쓴다",
        choice: "쓴다",
      });
    }
  }
  return {
    responses,
    signal: "consensus" as const,
    dispersion: 0,
    bySegment: { 연령: {} },
  };
}

describe("renderFounderInsightReport — 코어 섹션", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
    choices: ["쓴다", "안쓴다"],
  });
  const md = renderFounderInsightReport(report);

  it("상단과 하단에 synthetic panel disclaimer가 있다", () => {
    const first = md.indexOf("synthetic panel");
    const last = md.lastIndexOf("synthetic panel");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(last).toBeGreaterThan(first);
  });
  it("코어 섹션 헤더가 존재한다", () => {
    for (const h of [
      "## 한 줄 요약",
      "## 전체 신호",
      "## 기회 세그먼트",
      "## 저항 세그먼트",
      "## 관심을 끄는 이유 / 거부 이유 (추정)",
      "## 위험한 가정",
      "## 신뢰도 카드",
    ]) {
      expect(md).toContain(h);
    }
  });
  it("판단 보류 세그먼트는 HELD_CAP개까지만 렌더하고 '외 N개'로 요약한다", () => {
    expect(report.observedButHeld.length).toBe(15);
    expect(md).toContain(`외 ${15 - HELD_CAP}개 (판단 보류)`);
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/report/render.test.ts`
Expected: FAIL — `Cannot find module './render.js'`

- [x] **Step 3: 구현**

```ts
// src/report/render.ts
import type {
  ConfidenceLayer,
  FounderInsightReport,
  SegmentInsight,
} from "./types.js";

export const HELD_CAP = 10;

export const AI_DRAFT_BANNER =
  "> ⚠️ **AI 생성 초안 · 검토 필요** — 아래 항목은 heuristic으로 생성된 추정 초안입니다. 그대로 쓰지 말고 반드시 검토·수정하세요.";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function segmentLines(s: SegmentInsight): string[] {
  const dist = Object.entries(s.responseDistribution)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const lines = [
    `### ${s.segmentLabel}  (n=${s.sampleCount} · 긍정 ${pct(s.positiveRatio)} · 신뢰도 ${s.confidence})`,
    `- 분포: ${dist} · 인구 가중 비율 ≈ ${pct(s.sampleWeightShare)}`,
    `- 왜 중요한가: ${s.whyItMatters}`,
    `- 다음 질문: ${s.recommendedFollowUpQuestion}`,
  ];
  for (const c of s.caveats) lines.push(`- ⚠️ ${c}`);
  return lines;
}

function layerLines(name: string, l: ConfidenceLayer): string[] {
  return [
    `| ${name} | ${l.label} | ${l.reason} | ${l.whatThisAllows} | ${l.whatThisDoesNotAllow} |`,
  ];
}

export function renderFounderInsightReport(
  report: FounderInsightReport,
): string {
  const md: string[] = [];
  // ① 제목 + 상단 라벨
  md.push(`# ${report.title}`, "", `> ⚠️ ${report.disclaimer}`, "");
  // ② 한 줄 요약
  const es = report.executiveSummary;
  md.push("## 한 줄 요약", "", es.headline, "");
  if (es.topOpportunity) md.push(`- 최우선 기회: **${es.topOpportunity}**`);
  if (es.topResistance) md.push(`- 최대 저항: **${es.topResistance}**`);
  md.push(
    `- 아직 믿으면 안 되는 것: ${es.doNotTrustYet}`,
    `- 이번 주 행동: ${es.thisWeekAction}`,
    "",
  );
  // ③ 전체 신호
  const o = report.overallSignal;
  const dist = Object.entries(o.distribution)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  md.push(
    "## 전체 신호",
    "",
    `- ${o.signal === "split" ? "🔴 split(분열)" : "🟢 consensus(합의)"} · 응답 분포: ${dist}`,
    `- n=${o.n}${o.seed != null ? ` · seed=${o.seed}` : ""}${o.provider ? ` · provider=${o.provider}` : ""} · 누락률 ${pct(o.missingRate)}`,
    `- ${o.label}`,
    "",
  );
  // ④ 기회 세그먼트
  md.push("## 기회 세그먼트", "");
  if (report.opportunitySegments.length === 0)
    md.push("(minN을 넘는 기회 세그먼트 없음)", "");
  for (const s of report.opportunitySegments) md.push(...segmentLines(s), "");
  // ⑤ 저항 세그먼트 + 판단 보류 cap
  md.push("## 저항 세그먼트", "");
  if (report.resistanceSegments.length === 0)
    md.push("(minN을 넘는 저항 세그먼트 없음)", "");
  for (const s of report.resistanceSegments) md.push(...segmentLines(s), "");
  if (report.observedButHeld.length > 0) {
    md.push("### 판단 보류 (표본 부족)", "");
    for (const s of report.observedButHeld.slice(0, HELD_CAP)) {
      md.push(`- ${s.segmentLabel} (n=${s.sampleCount}) — 표본 부족으로 랭킹 제외`);
    }
    const rest = report.observedButHeld.length - HELD_CAP;
    if (rest > 0) md.push(`- …외 ${rest}개 (판단 보류)`);
    md.push("");
  }
  // ⑥ 관심/거부 이유
  md.push("## 관심을 끄는 이유 / 거부 이유 (추정)", "", AI_DRAFT_BANNER, "");
  for (const d of report.keyDrivers)
    md.push(`- ✅ **${d.label}** — ${d.rationale} _(신뢰도 ${d.confidence})_`);
  for (const d of report.keyObjections)
    md.push(`- ❌ **${d.label}** — ${d.rationale} _(신뢰도 ${d.confidence})_`);
  md.push("");
  // ⑦ 위험한 가정
  md.push("## 위험한 가정", "");
  for (const a of report.riskyAssumptions) {
    md.push(
      `- **${a.assumption}**`,
      `  - 왜 위험한가: ${a.whyRisky}`,
      `  - 검증 방법: ${a.howToTest}`,
    );
  }
  md.push("");
  // ⑧ 신뢰도 카드
  md.push(
    "## 신뢰도 카드",
    "",
    "| 층 | 신뢰도 | 근거 | 허용되는 사용 | 허용 안 되는 사용 |",
    "|---|---|---|---|---|",
    ...layerLines("1층 · 패널 구성", report.confidenceCard.composition),
    ...layerLines("2층 · 속성 출처", report.confidenceCard.attributes),
    ...layerLines("3층 · 응답 일관성", report.confidenceCard.responseConsistency),
    ...layerLines("4층 · 시장 판단", report.confidenceCard.marketJudgment),
    "",
  );
  // ⑨~⑬ 처방 섹션은 Task 6에서 추가
  md.push(`> ⚠️ ${report.disclaimer}`); // ⑬ 하단 라벨 (처방 섹션은 이 앞에 삽입됨)
  return md.join("\n");
}
```

- [x] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/report/render.test.ts`
Expected: PASS

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/report/render.ts src/report/render.test.ts
git commit -m "feat(report): markdown renderer core sections with held-cap"
```

---

### Task 6: 렌더러 — 처방 섹션 (9~13) + AI 초안 배너

**Files:**
- Modify: `src/report/render.ts` (하단 라벨 push 직전에 ⑨~⑬ 삽입)
- Modify: `src/index.ts` (`renderFounderInsightReport`, `HELD_CAP` export)
- Test: `src/report/render.test.ts` (추가)

**Interfaces:**
- Consumes: Task 4로 처방이 채워진 `FounderInsightReport`
- Produces: 13 섹션 완성된 markdown. Task 7 데모가 그대로 출력.

- [x] **Step 1: 실패하는 테스트 추가**

```ts
// src/report/render.test.ts 에 추가
describe("renderFounderInsightReport — 처방 섹션", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
    choices: ["쓴다", "안쓴다"],
  });
  const md = renderFounderInsightReport(report);

  it("처방 섹션 헤더가 모두 존재한다", () => {
    for (const h of [
      "## 추천 인터뷰 대상",
      "## 인터뷰 질문 초안",
      "## 설문 문항 초안",
      "## 랜딩 메시지 테스트",
      "## 다음 7일",
    ]) {
      expect(md).toContain(h);
    }
  });
  it("AI 생성 초안 배너가 처방 섹션들에 나타난다", () => {
    const count = md.split("AI 생성 초안").length - 1;
    expect(count).toBeGreaterThanOrEqual(3); // ⑥ + 인터뷰/설문/랜딩 등
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/report/render.test.ts`
Expected: FAIL — "## 추천 인터뷰 대상" 없음

- [x] **Step 3: 구현 — 하단 라벨 push 직전에 삽입**

```ts
  // ⑨ 추천 인터뷰
  md.push("## 추천 인터뷰 대상", "", AI_DRAFT_BANNER, "");
  for (const t of report.recommendedInterviews) {
    md.push(
      `### ${t.targetLabel}`,
      `- 왜: ${t.whyInterview}`,
      `- 검증할 것: ${t.whatToValidate}`,
      `- 모집 스크리너: ${t.suggestedRecruitingScreener}`,
      `- 권장 인원: ${t.sampleSizeRecommendation}`,
      "",
    );
  }
  // ⑩ 인터뷰 질문
  md.push("## 인터뷰 질문 초안", "", AI_DRAFT_BANNER, "");
  report.interviewQuestions.forEach((q, i) => {
    md.push(
      `${i + 1}. ${q.text} _(${q.type})_${q.caution ? ` — ⚠️ ${q.caution}` : ""}`,
    );
  });
  md.push("");
  // ⑪ 설문 초안
  md.push("## 설문 문항 초안", "", AI_DRAFT_BANNER, "");
  report.surveyDraft.forEach((q, i) => {
    md.push(
      `${i + 1}. ${q.text} _(${q.kind}${q.optional ? " · optional" : ""})_${q.caution ? ` — ⚠️ ${q.caution}` : ""}`,
    );
  });
  md.push("");
  // ⑫ 랜딩 메시지 테스트
  md.push("## 랜딩 메시지 테스트", "", AI_DRAFT_BANNER, "");
  for (const t of report.landingPageMessageTests) {
    md.push(
      `### ${t.headline}`,
      `- 서브카피: ${t.subcopy}`,
      `- 타겟: ${t.targetSegment}`,
      `- 가설: ${t.hypothesis}`,
      `- 성공 지표: ${t.successMetric}`,
      `- ⚠️ ${t.caution}`,
      "",
    );
  }
  // ⑬ 다음 7일
  md.push("## 다음 7일", "");
  for (const a of report.nextValidationPlan) md.push(`- **${a.day}**: ${a.action}`);
  md.push("");
```

`src/index.ts`에 추가:

```ts
export { renderFounderInsightReport, HELD_CAP } from "./report/render.js";
```

- [x] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/report/render.test.ts`
Expected: PASS

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
git add src/report/render.ts src/report/render.test.ts src/index.ts
git commit -m "feat(report): renderer prescription sections with AI-draft banner"
```

---

### Task 7: report-demo (키 없는 census + mock 데모)

**Files:**
- Create: `eval/report-demo.ts`
- Test: `eval/report-demo.test.ts`
- Modify: `package.json` (scripts에 `"report:demo": "node dist/eval/report-demo.js"`)
- Modify: `tsup.config.ts` (entry에 `"eval/report-demo.ts"` 추가 — **필수**, 빠지면 dist에 없음)

**Interfaces:**
- Consumes: `generateFounderInsightReport`, `renderFounderInsightReport`, 기존 census 파이프라인 (`loadSnapshot`/`synthesizePopulation`/`sampleForSimulation`/`simulate`/`aggregate`/`populationFidelity`) — `eval/reliability-demo.ts`와 동일 패턴
- Produces: `runReportDemo(): Promise<string>` — markdown 리포트 문자열

- [x] **Step 1: 실패하는 테스트 작성**

```ts
// eval/report-demo.test.ts
import { describe, expect, it } from "vitest";
import { runReportDemo } from "./report-demo.js";

describe("report-demo", () => {
  it("키 없이 13섹션 markdown 리포트를 만든다", async () => {
    const md = await runReportDemo();
    expect(md).toContain("0차 시장검증 리포트");
    expect(md).toContain("## 다음 7일");
    expect(md).toContain("synthetic panel");
    expect(md).toContain("AI 생성 초안");
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `npx vitest run eval/report-demo.test.ts`
Expected: FAIL — `Cannot find module './report-demo.js'`

- [x] **Step 3: 구현 (reliability-demo 패턴)**

```ts
// eval/report-demo.ts
import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import { aggregate } from "../src/aggregate/uncertainty.js";
import { MockProvider } from "../src/llm/mock.js";
import { loadSnapshot } from "../src/population/loader.js";
import { sampleForSimulation } from "../src/population/source.js";
import { synthesizePopulation } from "../src/population/synthesize.js";
import { generateFounderInsightReport } from "../src/report/generate.js";
import { renderFounderInsightReport } from "../src/report/render.js";
import { simulate } from "../src/simulate/simulate.js";
import { populationFidelity } from "../src/verify/fidelity.js";

export async function runReportDemo(): Promise<string> {
  const snapshot = loadSnapshot(snapshotJson);
  const pop = synthesizePopulation(snapshot);
  const sample = sampleForSimulation(pop, 200, 7);

  const choices = ["쓴다", "안쓴다"];
  const young = new Set(["20~24세", "25~29세", "30~34세"]);
  const provider = new MockProvider((p) =>
    young.has(p.attrs.연령) ? "쓴다" : "안쓴다",
  );
  const question = {
    prompt: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
    choices,
  };

  const { responses, missing } = await simulate(sample, question, provider);
  const result = aggregate(responses, { missing });

  const fidelity = populationFidelity(pop, snapshot);
  const bridges = Object.fromEntries(
    snapshot.conditional
      .filter((c) => c.bridge)
      .map((c) => [c.var, c.bridge as string]),
  );

  const report = generateFounderInsightReport(
    result,
    {
      question: question.prompt,
      choices,
      concept: { productName: "새벽배송 구독" },
      run: { seed: 7, n: 200, provider: "mock(demo)" },
    },
    { fidelity, bridges },
  );
  return renderFounderInsightReport(report);
}

if (
  process.argv[1]?.endsWith("report-demo.ts") ||
  process.argv[1]?.endsWith("report-demo.js")
) {
  runReportDemo().then((md) => console.log(md));
}
```

`tsup.config.ts` entry 배열에 `"eval/report-demo.ts"` 추가. `package.json` scripts에 `"report:demo": "node dist/eval/report-demo.js"` 추가.

- [x] **Step 4: 테스트 + 실제 데모 실행 확인 (실행·관찰)**

```bash
npx vitest run eval/report-demo.test.ts   # PASS
npm run build && npm run report:demo      # markdown 리포트가 stdout에 출력되는지 눈으로 확인
```

Expected: 13 섹션 리포트 출력, 처방 섹션에 배너, 상·하단 disclaimer.

- [x] **Step 5: 전체 게이트 + 커밋**

```bash
npm test && npm run lint && npx tsc --noEmit
git add eval/report-demo.ts eval/report-demo.test.ts package.json tsup.config.ts
git commit -m "feat(eval): founder report demo (census + mock, key-free)"
```

---

### Task 8: 문서 갱신 + 최종 게이트

**Files:**
- Modify: `README.md` (빠른 시작 + 로드맵)
- Modify: `docs/README-intro.md` (리포트 데모 소개 한 절 — 파일 끝에 추가)

**Interfaces:** 없음 (문서만)

- [x] **Step 1: README.md 빠른 시작에 4번째 항목 추가**

"키 없이 바로 돌려보는 3가지" 절의 코드블록에 추가하고 제목을 "4가지"로 수정:

```bash
# 4) 창업자 인사이트 리포트 — 진단(🔴/🟢)을 다음 행동(인터뷰·설문·랜딩 초안)으로 번역
npm run report:demo
```

- [x] **Step 2: README.md 로드맵 항목 갱신**

`- [x] **진단→처방: 다음 행동 생성물 (묶음 B)**` 항목 **앞에** 새 항목 추가:

```markdown
- [x] **창업자 인사이트 리포트 (Plan 4, heuristic v1)** — 진단을 창업자 행동으로 번역: 기회/저항 세그먼트 랭킹(+판단 보류) · 4층 신뢰도 카드 · heuristic 처방(인터뷰 대상/질문·설문·랜딩·7일 플랜, 전부 "AI 생성 초안" 라벨) · markdown 렌더 (`npm run report:demo`, 키 불필요). LLM 생성 v2는 issue #4.
```

기존 "진단→처방 (묶음 B)" 항목의 설명 끝에 `(heuristic v1은 완료 — 남은 것은 2층 LLM 생성)` 을 덧붙인다.

- [x] **Step 3: docs/README-intro.md 끝에 데모 소개 절 추가**

```markdown
## 창업자 리포트 데모

`npm run report:demo` 는 번들 합성 인구(2024 인구총조사) + 결정적 mock으로 "0차 시장검증 리포트"를 출력한다 — 기회/저항 세그먼트 랭킹, 4층 신뢰도 카드, 그리고 인터뷰 대상·질문지·설문 초안·랜딩 메시지·7일 검증 플랜까지. 처방은 전부 heuristic 초안("AI 생성 초안 · 검토 필요" 라벨)이며, LLM 기반 생성은 후속(issue #4)이다.
```

- [x] **Step 4: 최종 게이트 (전 스크립트 실행·관찰)**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
npm run report:demo && npm run reliability:demo && npm run fidelity:demo
```

Expected: 전부 그린, 데모 3종 정상 출력.

- [x] **Step 5: 커밋**

```bash
git add README.md docs/README-intro.md
git commit -m "docs: founder report demo + roadmap update (Plan 4 complete)"
```

---

## 완료 기준

- [x] `FounderInsightReport`의 처방 필드 7종이 전부 채워짐 (heuristic, 전부 inferred 라벨)
- [x] `renderFounderInsightReport` 13 섹션 + AI 초안 배너 + held cap
- [x] `npm run report:demo` 키 없이 동작
- [x] `npm test`/`lint`/`tsc`/`build` 전부 그린, 코어 타입·aggregate diff 없음
- [x] 다음 단계: `2026-07-03-live-inference-readiness.md` 플랜 (Claude 실측 준비 + B1)

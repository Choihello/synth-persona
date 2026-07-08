# 범위 밖 질문 탐지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세그먼트가 하나도 승격되지 않은 리포트가 "합의"라고 거짓 보고하는 것을 멈추고, 그 질문이 이 도구의 범위 밖임을 정직하게 알린다.

**Architecture:** 순수 판정 함수 `scopeVerdict(report)`를 `src/report/scope.ts`에 하나만 두고, 마크다운 렌더(`src/report/render.ts`)와 웹 카드(`web/easy-summary.ts`)가 함께 소비한다. 판정이 한 곳에 있어야 본문과 카드가 어긋나지 않는다. 기존 필드(`opportunitySegments`·`resistanceSegments`·`weakSignals`·`overallSignal.distribution`)만 쓰며 타입·집계·게이트는 건드리지 않는다.

**Tech Stack:** TypeScript (ESM, `.js` 확장자 import), vitest, biome.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-08-out-of-scope-question-detection-design.md`
- **타입 변경 금지** — `src/types.ts`·`src/report/types.ts` 무수정, 신규 필드 없음.
- **로직 변경 금지** — `src/aggregate`·세그먼트 집계·게이트 판정(2표본 z-검정)·`overallSignal.signal` 필드 무수정. `signal`은 **표시만** 바꾼다.
- **정직성 신호 0개 삭제.** 제거하는 문장은 딱 하나 — 거짓인 `전체 방향(위)이 핵심 신호입니다` (단, `underpowered` 갈래에서는 유지).
- **헤더 문자열 보존** — `## 전체 신호\n`·`## 기회 세그먼트\n` (pipeline 차트 주입).
- **`· 응답 분포: ` 불릿 형식 보존** — `web/og-stats.ts` 파서 소스.
- **없는 근거를 지어내지 않는다.** `no-effect`를 "표본을 키워도 안 갈린다"고 **단언하지 않는다**(10%p는 의사결정 임계이지 진실의 경계가 아니다). "가능성이 큽니다"까지만.
- 테스트는 API 키 없이 그린이어야 한다.
- 게이트 4종: `npx vitest run --pool=threads` (⚠️ `--pool=threads` 필수) / `npx tsc --noEmit` / `npm run lint` (⚠️ `tail -1` 금지, 전체 출력) / `cd app && npx next build`.
- ⚠️ vitest teardown에서 비결정적 segfault가 요약 줄을 자를 수 있다. **테스트는 통과한 것이다** — 재실행하면 카운트가 보인다.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/report/scope.ts` | 판정 하나 (순수 함수) | Task 1 신규 |
| `src/report/scope.test.ts` | 위 회귀 | Task 1 신규 |
| `src/report/render.ts` | 마크다운 렌더 | Task 2·3·4 |
| `src/report/render.test.ts` | 위 회귀 | Task 2·3·4 |
| `web/easy-summary.ts` | 쉬운 요약 카드 | Task 5 |
| `web/easy-summary.test.ts` | 위 회귀 | Task 5 |

**⚠️ 이 픽스처들이 `unanimous`다.** `src/report/test-fixtures.ts`의 `bigResult()`는 30 페르소나 전원이 `"쓴다"`로 답한다 → `distribution = { 쓴다: 30 }` → 단일 버킷 → `unanimous`. `render.test.ts`의 `baseReport()`가 이것을 쓴다. 기존 테스트 2건이 옛 문구를 단언하므로 Task 3에서 함께 고친다.

---

### Task 1: `scopeVerdict` 판정 함수

**Files:**
- Create: `src/report/scope.ts`
- Create: `src/report/scope.test.ts`

**Interfaces:**
- Consumes: `FounderInsightReport` (`src/report/types.ts`)
- Produces: `export type ScopeVerdict = "segmented" | "underpowered" | "no-effect" | "unanimous"` · `export function scopeVerdict(report: FounderInsightReport): ScopeVerdict`

Task 2~5가 이 두 심볼을 import 한다.

- [ ] **Step 1: Write the failing test**

`src/report/scope.test.ts` 신규:

```ts
import { describe, expect, it } from "vitest";
import type { FounderInsightReport } from "./types.js";
import { scopeVerdict } from "./scope.js";

/** 판정에 필요한 네 필드만 채운 최소 픽스처 */
function reportWith(over: {
  opp?: number;
  res?: number;
  weak?: number;
  dist?: Record<string, number>;
}): FounderInsightReport {
  return {
    opportunitySegments: Array.from({ length: over.opp ?? 0 }, () => ({}) as never),
    resistanceSegments: Array.from({ length: over.res ?? 0 }, () => ({}) as never),
    weakSignals: Array.from({ length: over.weak ?? 0 }, () => ({}) as never),
    overallSignal: { distribution: over.dist ?? { 쓴다: 30, 안쓴다: 30 } },
  } as unknown as FounderInsightReport;
}

describe("scopeVerdict", () => {
  it("승격 세그먼트가 하나라도 있으면 segmented", () => {
    expect(scopeVerdict(reportWith({ opp: 1 }))).toBe("segmented");
    expect(scopeVerdict(reportWith({ res: 1 }))).toBe("segmented");
  });

  it("응답이 단일 버킷이면 unanimous", () => {
    expect(scopeVerdict(reportWith({ dist: { 끈다: 180 } }))).toBe("unanimous");
  });

  it("0 카운트 버킷은 무시하고 unanimous로 본다", () => {
    expect(scopeVerdict(reportWith({ dist: { 끈다: 180, 켠다: 0 } }))).toBe(
      "unanimous",
    );
  });

  it("승격 0 + weakSignals 있으면 underpowered", () => {
    expect(
      scopeVerdict(reportWith({ weak: 3, dist: { 수용한다: 9, "수용 못 한다": 171 } })),
    ).toBe("underpowered");
  });

  it("승격 0 + weakSignals 0 + 응답은 갈림이면 no-effect", () => {
    expect(
      scopeVerdict(reportWith({ dist: { 찬성: 78, 반대: 12 } })),
    ).toBe("no-effect");
  });

  it("승격이 있으면 만장일치여도 segmented가 우선한다 (방어적)", () => {
    expect(scopeVerdict(reportWith({ opp: 1, dist: { 끈다: 180 } }))).toBe(
      "segmented",
    );
  });

  it("빈 distribution은 unanimous로 본다 (버킷 0개)", () => {
    expect(scopeVerdict(reportWith({ dist: {} }))).toBe("unanimous");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/report/scope.test.ts`
Expected: FAIL — `Cannot find module './scope.js'`.

- [ ] **Step 3: Write minimal implementation**

`src/report/scope.ts` 신규:

```ts
import type { FounderInsightReport } from "./types.js";

/**
 * 리포트가 "무엇을 알아냈는가"의 등급.
 *
 * - segmented    — 승격된 세그먼트가 있다. 정상 리포트.
 * - underpowered — 승격 0. 효과는 크지만(≥10%p) 표본이 작아 유의하지 않다. 표본을 키우면 갈릴 수 있다.
 * - no-effect    — 승격 0, 큰 효과도 없다. 인구 축에서 10%p 이상의 차이가 없다.
 * - unanimous    — 응답이 전부 같다. 인구 구성이 답에 기여한 바가 0이므로,
 *                  전체 비율은 인구 분포가 아니라 언어모델의 사전 판단이다.
 *
 * 순수 함수. 기존 필드만 읽고 아무것도 변형하지 않는다.
 */
export type ScopeVerdict =
  | "segmented"
  | "underpowered"
  | "no-effect"
  | "unanimous";

export function scopeVerdict(report: FounderInsightReport): ScopeVerdict {
  // 방어적: 논리상 만장일치면 승격이 불가능하지만, 그런 입력이 와도 승격을 우선한다.
  if (report.opportunitySegments.length + report.resistanceSegments.length > 0)
    return "segmented";
  const buckets = Object.values(report.overallSignal.distribution).filter(
    (v) => v > 0,
  );
  if (buckets.length <= 1) return "unanimous";
  if (report.weakSignals.length > 0) return "underpowered";
  return "no-effect";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --pool=threads src/report/scope.test.ts`
Expected: PASS (7건).

- [ ] **Step 5: Commit**

```bash
git add src/report/scope.ts src/report/scope.test.ts
git commit -m "feat(report): scopeVerdict — 리포트가 무엇을 알아냈는지 4갈래 판정 (순수 함수)"
```

---

### Task 2: 한 줄 요약 배너 + `할 수 있는 것` 보정

**Files:**
- Modify: `src/report/render.ts` (배너 상수 추가, `## 한 줄 요약` 블록 = 현재 65~77행)
- Test: `src/report/render.test.ts`

**Interfaces:**
- Consumes: `scopeVerdict`, `ScopeVerdict` (Task 1)
- Produces: `export const OUT_OF_SCOPE_BANNER_UNANIMOUS`, `export const OUT_OF_SCOPE_BANNER_NO_EFFECT`

**주의:** `bigResult()` 기반 리포트는 `unanimous`다. 이 태스크 이후 기존 테스트 다수의 md에 배너가 등장한다. 순서·존재 단언들은 영향받지 않는다.

- [ ] **Step 1: Write the failing test**

`src/report/render.test.ts` 끝에 새 describe 추가:

```ts
describe("renderFounderInsightReport — 범위 밖 배너", () => {
  it("unanimous면 범위 밖 배너가 한 줄 요약 위에 온다", () => {
    // bigResult()는 30명 전원 "쓴다" → 단일 버킷 → unanimous
    const md = renderFounderInsightReport(
      generateFounderInsightReport(bigResult(), {
        question: "q?",
        choices: ["쓴다", "안쓴다"],
      }),
    );
    expect(md).toContain("이 질문은 이 도구의 범위 밖입니다");
    expect(md).toContain("언어모델의 사전 판단");
    const banner = md.indexOf("이 질문은 이 도구의 범위 밖입니다");
    const summary = md.indexOf("## 한 줄 요약");
    expect(banner).toBeGreaterThan(summary);
    expect(banner).toBeLessThan(md.indexOf("## 전체 신호"));
  });

  it("segmented면 배너가 없다", () => {
    const responses = [];
    for (let i = 0; i < 15; i++)
      responses.push({
        persona: { id: `a${i}`, attrs: { 연령: "30대" }, weight: 1 },
        answer: "쓴다",
        choice: "쓴다",
      });
    for (let i = 0; i < 15; i++)
      responses.push({
        persona: { id: `b${i}`, attrs: { 연령: "60대" }, weight: 1 },
        answer: i < 3 ? "쓴다" : "안쓴다",
        choice: i < 3 ? "쓴다" : "안쓴다",
      });
    const report = generateFounderInsightReport(
      { responses, signal: "split" as const, dispersion: 0.5, bySegment: { 연령: {} } },
      { question: "q?", choices: ["쓴다", "안쓴다"] },
    );
    expect(report.opportunitySegments.length).toBeGreaterThan(0);
    const md = renderFounderInsightReport(report);
    expect(md).not.toContain("이 질문은 이 도구의 범위 밖입니다");
    expect(md).not.toContain("인구 축에서 갈리지 않았습니다");
  });

  it("segmented가 아니면 '할 수 있는 것'에 보정 문구가 붙는다", () => {
    const md = renderFounderInsightReport(
      generateFounderInsightReport(bigResult(), {
        question: "q?",
        choices: ["쓴다", "안쓴다"],
      }),
    );
    expect(md).toContain(
      "이 리포트로 할 수 있는 것: 방향 가설 탐색 · 인터뷰 대상 좁히기 — 단, 이 질문에선 세그먼트가 갈리지 않아 인터뷰 대상을 좁힐 수 없습니다.",
    );
  });

  it("정직성 신호는 배너와 무관하게 남는다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain("아직 믿으면 안 되는 것:");
    expect(md).toContain(report.executiveSummary.doNotTrustYet);
    expect(md).toContain("## 기술 상세 — 신뢰도 4층");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/report/render.test.ts -t "범위 밖 배너"`
Expected: FAIL — `"이 질문은 이 도구의 범위 밖입니다"`가 md에 없다.

- [ ] **Step 3: Write minimal implementation**

`src/report/render.ts` 상단, `LLM_QUESTION_BANNER` 선언 다음에 추가:

```ts
export const OUT_OF_SCOPE_BANNER_UNANIMOUS =
  "> ⚠️ **이 질문은 이 도구의 범위 밖입니다.** 표본 전원이 매번 같은 선택을 했습니다 — 인구 구성이 답을 전혀 바꾸지 못했습니다. 따라서 아래 비율은 통계청 인구 분포가 아니라 **언어모델의 사전 판단**입니다.";

export const OUT_OF_SCOPE_BANNER_NO_EFFECT =
  "> ⚠️ **인구 축에서 갈리지 않았습니다.** 연령·성·지역·가구원수·혼인 어디에서도 10%p 이상의 차이가 없었습니다 — 이 질문의 답은 인구 구성보다 다른 요인에 달려 있습니다.";
```

`render.ts` 최상단 import에 추가:

```ts
import { type ScopeVerdict, scopeVerdict } from "./scope.js";
```

`renderFounderInsightReport` 본문에서 `const md: string[] = [];` 바로 다음 줄에 추가:

```ts
  const scope: ScopeVerdict = scopeVerdict(report);
```

`## 한 줄 요약` 블록(현재 67~77행)을 다음으로 교체:

```ts
  md.push("## 한 줄 요약", "");
  if (scope === "unanimous") md.push(OUT_OF_SCOPE_BANNER_UNANIMOUS, "");
  else if (scope === "no-effect") md.push(OUT_OF_SCOPE_BANNER_NO_EFFECT, "");
  md.push(es.headline, "");
  if (es.topOpportunity) md.push(`- 최우선 기회: **${es.topOpportunity}**`);
  if (es.topResistance) md.push(`- 최대 저항: **${es.topResistance}**`);
  // 정직성 신호는 "못 하는 말"만 두지 않는다 — 부록 신뢰도 4층의 허용 범위를 짝지어 올린다.
  // 단 세그먼트가 갈리지 않았으면 "인터뷰 대상 좁히기"는 거짓이므로 보정한다(원 문자열은 보존).
  const mj = report.confidenceCard.marketJudgment;
  const allowsSuffix =
    scope === "segmented"
      ? ""
      : " — 단, 이 질문에선 세그먼트가 갈리지 않아 인터뷰 대상을 좁힐 수 없습니다.";
  md.push(
    `- 이 리포트로 할 수 있는 것: ${mj.whatThisAllows}${allowsSuffix}`,
    `- 아직 믿으면 안 되는 것: ${es.doNotTrustYet}`,
    `- 이번 주 행동: ${es.thisWeekAction}`,
    "",
  );
```

**`const es = report.executiveSummary;` 선언은 `md.push("## 한 줄 요약", ...)` 앞으로 옮기거나 그대로 둔다 — 이미 그 위에 있다.**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=threads src/report/render.test.ts`
Expected: PASS (신규 4건 포함).

- [ ] **Step 5: Commit**

```bash
git add src/report/render.ts src/report/render.test.ts
git commit -m "feat(report): 범위 밖 배너 + '할 수 있는 것' 보정 (세그먼트 미승격 시)"
```

---

### Task 3: 세그먼트 0개 문구를 삼분 (두 곳)

**Files:**
- Modify: `src/report/render.ts` (현재 124~128행 기회, 132~136행 저항)
- Modify: `src/report/render.test.ts:137`, `src/report/render.test.ts:251` (기존 단언 갱신)

**Interfaces:**
- Consumes: `scope` (Task 2에서 함수 본문에 이미 선언됨)
- Produces: `export const NO_SEGMENT_UNDERPOWERED`, `export const NO_SEGMENT_NO_EFFECT`

**⚠️ 문구가 두 곳에 중복돼 있다.** `## 기회 세그먼트` 0개일 때와 `## 저항 세그먼트` 0개일 때 같은 문자열이 쓰인다. 둘 다 고쳐야 한다.

**⚠️ 기존 테스트 2건이 옛 문구를 단언한다.** 둘 다 `bigResult()`(= `unanimous`)를 쓰므로 새 문구가 나온다. 함께 고친다:
- `render.test.ts:133-138` — `it("기회 세그먼트 0개면 유의성 문구로 안내한다")`, `toContain("세그먼트로 쪼개 보려면 표본을 키우세요")`
- `render.test.ts:245-252` — `it("세그먼트 없음은 표본 키우기 안내로 리프레이밍된다")`, 같은 단언

- [ ] **Step 1: Write the failing test**

`render.test.ts:133-138`의 테스트를 **다음으로 교체**:

```ts
  it("unanimous면 세그먼트 0개 문구가 '인구 축에서 차이 없음'으로 바뀐다", () => {
    const rep = baseReport(); // bigResult() → unanimous
    rep.opportunitySegments = [];
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("10%p 이상 벌어지는 차이가 없었습니다");
    expect(md).toContain("전체 비율을 세그먼트 근거로 쓰지 마세요");
    // 거짓 문장 제거 확인
    expect(md).not.toContain("전체 방향(위)이 핵심 신호입니다");
    expect(md).not.toContain("세그먼트로 쪼개 보려면 표본을 키우세요");
  });
```

`render.test.ts:245-252`의 테스트를 **다음으로 교체**:

```ts
  it("세그먼트 없음은 범위 밖 안내로 리프레이밍된다 (표본 탓으로 돌리지 않음)", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain("10%p 이상 벌어지는 차이가 없었습니다");
    expect(md).not.toContain("유의한 기회 세그먼트 없음");
  });
```

같은 파일 끝에 `underpowered` 회귀 테스트 추가 (과잉 적용 방지):

```ts
describe("renderFounderInsightReport — underpowered는 표본 문구를 유지한다", () => {
  it("weakSignals가 있고 승격이 0이면 기존 표본 안내가 그대로 나온다", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    // 승격 0 · weakSignals 1 · 응답은 갈림 → underpowered
    const rep = {
      ...base,
      opportunitySegments: [],
      resistanceSegments: [],
      weakSignals: [base.observedButHeld[0] ?? ({} as never)],
      overallSignal: {
        ...base.overallSignal,
        distribution: { 쓴다: 20, 안쓴다: 10 },
      },
    };
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("세그먼트로 쪼개 보려면 표본을 키우세요");
    expect(md).not.toContain("이 질문은 이 도구의 범위 밖입니다");
    expect(md).not.toContain("인구 축에서 갈리지 않았습니다");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/report/render.test.ts`
Expected: FAIL — `"10%p 이상 벌어지는 차이가 없었습니다"`가 md에 없다.

- [ ] **Step 3: Write minimal implementation**

`src/report/render.ts` 배너 상수들 아래에 추가:

```ts
/** 표본이 작아 유의하지 않았을 뿐, 효과는 관측된 경우 — 표본을 키우면 갈릴 수 있다. */
export const NO_SEGMENT_UNDERPOWERED =
  "이 규모(표본 소수)에선 세그먼트별 차이가 통계적으로 뚜렷하지 않았어요 — 전체 방향(위)이 핵심 신호입니다. 세그먼트로 쪼개 보려면 표본을 키우세요.";

/**
 * 인구 축에서 의사결정에 쓸 만한 크기(10%p)의 차이 자체가 없는 경우.
 * 10%p는 의사결정 임계이지 진실의 경계가 아니므로 "안 갈린다"고 단언하지 않는다.
 */
export const NO_SEGMENT_NO_EFFECT =
  "우리가 가진 인구 축(연령·성·지역·가구원수·혼인)에서 10%p 이상 벌어지는 차이가 없었습니다. 표본을 키워도 이 축들로는 갈리지 않을 가능성이 큽니다 — 전체 비율을 세그먼트 근거로 쓰지 마세요.";
```

`render.ts`의 `## 기회 세그먼트` 0개 분기(현재 124~128행)를 교체:

```ts
  if (report.opportunitySegments.length === 0)
    md.push(
      scope === "underpowered" ? NO_SEGMENT_UNDERPOWERED : NO_SEGMENT_NO_EFFECT,
      "",
    );
```

`render.ts`의 `## 저항 세그먼트` 0개 분기(현재 132~136행)를 교체:

```ts
  if (report.resistanceSegments.length === 0)
    md.push(
      scope === "underpowered" ? NO_SEGMENT_UNDERPOWERED : NO_SEGMENT_NO_EFFECT,
      "",
    );
```

**`scope === "segmented"`이면 두 분기 모두 도달하지 않는다** — 승격이 있으면 두 배열 중 하나는 비어 있을 수 있으나, 그 경우엔 상대 섹션에 `NO_SEGMENT_NO_EFFECT`가 나온다. 이는 의도된 동작이다: 기회는 있는데 저항이 없으면 "저항 축에서 10%p 이상 차이가 없었다"가 참이다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=threads src/report/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/render.ts src/report/render.test.ts
git commit -m "fix(report): 세그먼트 0개를 표본 탓으로 돌리지 않는다 — underpowered/no-effect 삼분"
```

---

### Task 4: `unanimous`일 때 전체 신호 라벨 + og-stats 회귀

**Files:**
- Modify: `src/report/render.ts` (현재 90~97행 `## 전체 신호` push)
- Test: `src/report/render.test.ts`, `web/og-stats.test.ts`

**Interfaces:**
- Consumes: `scope` (함수 본문에 선언됨), `signalDot` (`src/format.ts`)
- Produces: 없음

**⚠️ `overallSignal.signal` 필드는 절대 건드리지 않는다.** 집계 로직이다. 바꾸는 건 화면에 찍히는 문자열뿐이다.

**⚠️ `· 응답 분포: ${dist}` 부분은 글자 하나 바꾸지 않는다.** `web/og-stats.ts:28`의 `/^- .*?· 응답 분포: ([^\n]+)/m`가 이 줄을 판다. 불릿 접두(`- `)와 `· 응답 분포: `를 보존하면 `.*?` 와일드카드가 새 라벨을 흡수한다.

- [ ] **Step 1: Write the failing test**

`src/report/render.test.ts`의 `describe("renderFounderInsightReport — 범위 밖 배너")` 안에 추가:

```ts
  it("unanimous면 전체 신호 라벨이 '응답 전부 동일'로 바뀐다 (signal 필드는 무수정)", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    expect(report.overallSignal.signal).toBe("consensus"); // 필드는 그대로
    const md = renderFounderInsightReport(report);
    expect(md).toContain("⚪ 응답 전부 동일");
    expect(md).not.toContain("🟢 consensus(합의)");
    // og-stats 파서 소스는 보존
    expect(md).toMatch(/^- .*?· 응답 분포: /m);
  });

  it("unanimous가 아니면 기존 consensus/split 라벨을 유지한다", () => {
    const responses = [];
    for (let i = 0; i < 15; i++)
      responses.push({
        persona: { id: `a${i}`, attrs: { 연령: "30대" }, weight: 1 },
        answer: "쓴다",
        choice: "쓴다",
      });
    for (let i = 0; i < 15; i++)
      responses.push({
        persona: { id: `b${i}`, attrs: { 연령: "60대" }, weight: 1 },
        answer: i < 3 ? "쓴다" : "안쓴다",
        choice: i < 3 ? "쓴다" : "안쓴다",
      });
    const md = renderFounderInsightReport(
      generateFounderInsightReport(
        { responses, signal: "split" as const, dispersion: 0.5, bySegment: { 연령: {} } },
        { question: "q?", choices: ["쓴다", "안쓴다"] },
      ),
    );
    expect(md).not.toContain("응답 전부 동일");
    expect(md).toMatch(/- (🟢 consensus\(합의\)|🔴 split\(분열\))/);
  });
```

`web/og-stats.test.ts` 끝에 회귀 추가:

```ts
it("unanimous 리포트의 새 라벨(⚪ 응답 전부 동일)에서도 분포를 파싱한다", () => {
  const md = [
    "## 전체 신호",
    "",
    "- ⚪ 응답 전부 동일 · 응답 분포: 끈다=180",
    "- 표본 60명 · 각 3회 응답(총 180) · 누락률 0.0%",
    "",
  ].join("\n");
  const s = extractOgStats(md);
  expect(s?.n).toBe(180);
  expect(s?.dist).toEqual([["끈다", 180]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/report/render.test.ts web/og-stats.test.ts`
Expected: `render.test.ts` FAIL — `"⚪ 응답 전부 동일"` 없음. `og-stats.test.ts`의 신규 테스트는 **이미 통과할 수 있다**(정규식이 라벨을 신경 쓰지 않으므로). 통과하면 그대로 두고 회귀 가드로 삼는다 — 라벨 변경이 파서를 깨지 않음을 고정한다.

- [ ] **Step 3: Write minimal implementation**

`src/report/render.ts`의 `## 전체 신호` push(현재 90~97행)를 교체:

```ts
  // unanimous면 "합의"가 아니라 "무변별"이다 — signal 필드는 건드리지 않고 표시만 바꾼다.
  const signalLabel =
    scope === "unanimous"
      ? "⚪ 응답 전부 동일"
      : `${signalDot(o.signal)} ${o.signal === "split" ? "split(분열)" : "consensus(합의)"}`;
  md.push(
    "## 전체 신호",
    "",
    `- ${signalLabel} · 응답 분포: ${dist}`,
    `- ${sampleLabel}${o.seed != null ? ` · seed=${o.seed}` : ""}${o.provider ? ` · provider=${o.provider}` : ""} · 누락률 ${pct(o.missingRate)}`,
    `- ${o.label}`,
    "",
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=threads src/report/render.test.ts web/og-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/render.ts src/report/render.test.ts web/og-stats.test.ts
git commit -m "fix(report): unanimous는 consensus(합의)가 아니라 '응답 전부 동일' — 표시만 변경"
```

---

### Task 5: 쉬운 요약 카드의 판정문 분기

**Files:**
- Modify: `web/easy-summary.ts` (현재 72행 `const verdict = verdictSentence(...)`)
- Modify: `web/easy-summary.test.ts` (픽스처에 `weakSignals` 추가 + 판정문 테스트 갱신)

**Interfaces:**
- Consumes: `scopeVerdict` (Task 1) — import 경로 `../src/report/scope.js`
- Produces: 없음

**⚠️ 기존 픽스처가 터진다.** `web/easy-summary.test.ts:42-57`의 `reportWith`는 `weakSignals`를 채우지 않는다. `scopeVerdict`가 `report.weakSignals.length`를 읽으므로 `undefined.length` 런타임 에러가 난다. 픽스처에 `weakSignals: []`를 추가해야 한다.

**⚠️ 기존 판정문 테스트 3건이 바뀐다.** `reportWith({})`는 세그먼트 0개·weakSignals 0개·버킷 3개 → `no-effect`다. 따라서 `"반응이 뚜렷하게 긍정적이에요"`가 더 이상 나오지 않는다. **이것이 이 변경의 목적이다.** 시장 판정문을 시험하려면 픽스처에 `opp`를 줘서 `segmented`로 만든다.
- `web/easy-summary.test.ts:63` — `toContain("반응이 뚜렷하게 긍정적이에요")`
- `web/easy-summary.test.ts:97` — `at(80, 100)` → `"반응이 뚜렷하게 긍정적이에요"`
- `web/easy-summary.test.ts:101` — `at(10, 100)` → `"반응이 뚜렷하게 부정적이에요"`

- [ ] **Step 1: Write the failing test**

`web/easy-summary.test.ts`의 `reportWith` 헬퍼를 **다음으로 교체** (`weak` 파라미터 + `weakSignals` 필드 추가):

```ts
/** 판정에 필요한 필드까지 채운 최소 리포트 픽스처 */
function reportWith(over: {
  signal?: "consensus" | "split";
  dist?: Record<string, number>;
  n?: number;
  opp?: string;
  res?: string;
  weak?: number;
  consistency?: "high" | "medium" | "low" | "unknown";
  panelSize?: number;
  panelPositive?: number;
}): FounderInsightReport {
  return {
    overallSignal: {
      signal: over.signal ?? "consensus",
      distribution: over.dist ?? { 찬성: 78, 반대: 4, 유보: 8 },
      n: over.n ?? 90,
      missingRate: 0,
      label: "",
      panelSize: over.panelSize,
      panelPositive: over.panelPositive,
    },
    opportunitySegments: over.opp ? [{ segmentLabel: over.opp } as never] : [],
    resistanceSegments: over.res ? [{ segmentLabel: over.res } as never] : [],
    weakSignals: Array.from({ length: over.weak ?? 0 }, () => ({}) as never),
    confidenceCard: {
      responseConsistency: { label: over.consistency ?? "medium" },
    } as never,
  } as unknown as FounderInsightReport;
}
```

`:63`이 있는 테스트를 **다음으로 교체** (`opp`를 줘서 `segmented`로 만든다):

```ts
  test("segmented · consensus r=0.87 → 뚜렷 긍정 + 10명 중 9명 + n 기준", () => {
    const html = easySummaryHTML(reportWith({ opp: "연령=30대" }), "찬성");
    expect(html).toContain("반응이 뚜렷하게 긍정적이에요");
    expect(html).toContain("10명 중 9명");
    expect(html).toContain("가상 응답 90개 기준");
  });
```

`:92-96`의 지역 헬퍼 `at`을 **다음으로 교체**한다 (`opp`를 넘겨 `segmented`로 고정 — 판정문 경계값을 시험하는 테스트이므로 scope 분기에 걸리면 안 된다):

```ts
    const at = (pos: number, total: number) =>
      easySummaryHTML(
        reportWith({
          dist: { 찬성: pos, 반대: total - pos },
          opp: "연령=30대", // segmented 고정 — 이 테스트의 관심사는 verdictSentence 경계값
        }),
        "찬성",
      );
```

파일 끝에 새 describe 추가:

```ts
describe("easySummaryHTML — 범위 밖 판정", () => {
  test("unanimous면 시장 판정문 대신 범위 밖을 말한다", () => {
    const html = easySummaryHTML(reportWith({ dist: { 끈다: 180 } }), "켠다");
    expect(html).toContain("이 질문은 이 도구의 범위 밖이에요");
    expect(html).not.toContain("반응이 뚜렷하게 부정적이에요");
  });

  test("no-effect면 인구 축에서 갈리지 않았다고 말한다", () => {
    const html = easySummaryHTML(reportWith({ dist: { 찬성: 78, 반대: 12 } }), "찬성");
    expect(html).toContain("인구 축에서는 갈리지 않았어요");
    expect(html).not.toContain("반응이 뚜렷하게 긍정적이에요");
  });

  test("underpowered면 기존 판정문을 유지한다", () => {
    const html = easySummaryHTML(
      reportWith({ dist: { 찬성: 78, 반대: 12 }, weak: 2 }),
      "찬성",
    );
    expect(html).toContain("반응이 뚜렷하게 긍정적이에요");
    expect(html).not.toContain("범위 밖");
  });

  test("segmented면 기존 판정문을 유지한다", () => {
    const html = easySummaryHTML(
      reportWith({ dist: { 찬성: 78, 반대: 12 }, opp: "연령=30대" }),
      "찬성",
    );
    expect(html).toContain("반응이 뚜렷하게 긍정적이에요");
  });

  test("whoLine 폴백은 그대로 유지된다", () => {
    const html = easySummaryHTML(reportWith({ dist: { 끈다: 180 } }), "켠다");
    expect(html).toContain("세그먼트 간 뚜렷한 차이는 없었어요.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads web/easy-summary.test.ts`
Expected: FAIL — `"이 질문은 이 도구의 범위 밖이에요"`가 없다.

- [ ] **Step 3: Write minimal implementation**

`web/easy-summary.ts` import에 추가:

```ts
import { scopeVerdict } from "../src/report/scope.js";
```

`web/easy-summary.ts` 72행 `const verdict = verdictSentence(report.overallSignal.signal, r);`를 교체:

```ts
  // 세그먼트가 갈리지 않았으면 시장 판정을 주장하지 않는다 — 판정은 scope.ts 한 곳에서만.
  const scope = scopeVerdict(report);
  const verdict =
    scope === "unanimous"
      ? "이 질문은 이 도구의 범위 밖이에요"
      : scope === "no-effect"
        ? "인구 축에서는 갈리지 않았어요"
        : verdictSentence(report.overallSignal.signal, r);
```

`verdictSentence` 함수 자체는 건드리지 않는다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=threads web/easy-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/easy-summary.ts web/easy-summary.test.ts
git commit -m "fix(web): 쉬운 요약 카드가 세그먼트 없을 때 시장 판정을 주장하지 않는다"
```

---

### Task 6: 전체 게이트 + 실물 렌더 확인

**Files:** 없음 (검증만). 실패 시 해당 Task로 되돌아간다.

**Interfaces:**
- Consumes: Task 1~5의 산출물
- Produces: 없음

- [ ] **Step 1: 게이트 4종 (⚠️ 함정 3개)**

```bash
npx vitest run --pool=threads
npx tsc --noEmit
npm run lint
cd app && npx next build
```

Expected: 전건 PASS · tsc 무출력 · biome 0 errors · next build 성공.

**⚠️ `--pool=threads` 필수** (기본 forks 풀은 이 샌드박스에서 죽는다).
**⚠️ `npm run lint 2>&1 | tail -1` 금지** (위쪽 에러를 가린다).
**⚠️ teardown segfault로 요약 줄이 잘릴 수 있다** — 재실행하면 카운트가 보인다. 실패로 오인하지 말 것.

- [ ] **Step 2: 실물 렌더로 `unanimous` 경로 확인**

`eval/report-demo.ts`는 연령 20~34세만 `"쓴다"`로 답하는 mock을 쓴다. **실측 결과 승격 세그먼트가 19개이므로 데모는 `segmented`다.** 따라서 데모로는 배너도 새 문구도 볼 수 없다 — 데모는 **회귀 확인용**이다(배너가 잘못 새어 나오지 않는지).

```bash
npm run build
npm run report:demo > /tmp/demo.md
```

확인 (전부 `segmented` 기준):
```bash
grep -c "^### .*긍정 " /tmp/demo.md                        # 19 — segmented 확인
grep -c "이 질문은 이 도구의 범위 밖입니다" /tmp/demo.md   # 0 (배너 누출 없음)
grep -c "인구 축에서 갈리지 않았습니다" /tmp/demo.md        # 0
grep -c "10%p 이상 벌어지는 차이가 없었습니다" /tmp/demo.md # 0 (기회·저항 둘 다 승격 있음)
grep -c "⚪ 응답 전부 동일" /tmp/demo.md                    # 0
grep -c "아직 믿으면 안 되는 것" /tmp/demo.md               # ≥1 (정직성 신호 보존)
grep -c "## 기술 상세 — 신뢰도 4층" /tmp/demo.md            # =1
```

`grep -c`는 매치 0건일 때 exit 1이므로 `&&` 체인으로 묶지 말 것.

- [ ] **Step 3: `unanimous` 경로 실물 확인 (Node 일회성 스크립트)**

데모가 `unanimous`가 아니므로, 픽스처와 동일한 전원 동일 응답으로 렌더를 한 번 찍어 눈으로 본다.

```bash
cat > .scope-check.mjs <<'EOF'
import { generateFounderInsightReport } from "./dist/src/index.js";
import { renderFounderInsightReport } from "./dist/src/index.js";
const responses = [];
for (let i = 0; i < 30; i++)
  responses.push({ persona: { id: `p${i}`, attrs: { 연령: `구간${i % 15}` }, weight: 1 }, answer: "끈다", choice: "끈다" });
const md = renderFounderInsightReport(
  generateFounderInsightReport(
    { responses, signal: "consensus", dispersion: 0, bySegment: { 연령: {} } },
    { question: "AI가 통화를 자동 녹음할까요?", choices: ["켠다", "끈다"] },
  ),
);
console.log(md.slice(0, md.indexOf("## 전체 신호") + 400));
EOF
node .scope-check.mjs
rm .scope-check.mjs
```

Expected 출력에 다음이 보여야 한다:
```
> ⚠️ **이 질문은 이 도구의 범위 밖입니다.** …언어모델의 사전 판단…
- 이 리포트로 할 수 있는 것: … — 단, 이 질문에선 세그먼트가 갈리지 않아 …
- ⚪ 응답 전부 동일 · 응답 분포: 끈다=30
```

**⚠️ `generateFounderInsightReport`·`renderFounderInsightReport`가 `dist/src/index.js`에서 export되는지 먼저 확인한다.** 안 되면 `src/index.ts`의 export 목록을 보고 경로를 맞춘다. 스크립트는 **커밋하지 않는다**(실행 후 삭제).

- [ ] **Step 4: Commit (변경 없으면 생략)**

게이트만 돌린 경우 커밋할 것이 없다.

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | Task |
|---|---|
| `scope.ts` 판정 함수 (4갈래) | Task 1 |
| render (a) 한 줄 요약 배너 | Task 2 |
| render (c) `할 수 있는 것` 보정 | Task 2 |
| render (b) 세그먼트 0개 문구 삼분 | Task 3 (**두 곳** — 스펙은 저항만 적었으나 기회에도 같은 문자열이 있다) |
| render (d) `unanimous` 전체 신호 라벨 | Task 4 |
| `easy-summary` verdict 분기 | Task 5 |
| 검증 1~9 | T1(1) · T2(5,6,8) · T3(3,4) · T4(2,7) · T5(9) |
| 범위 밖(YAGNI) 4건 | 어떤 Task에도 없음 ✅ |

**스펙 대비 보강 2건** (플랜 작성 중 발견):
- 스펙 §2(b)는 `## 저항 세그먼트`만 언급하나, 같은 문자열이 `## 기회 세그먼트` 0개 분기에도 있다(`render.ts:126`·`:134`). Task 3이 둘 다 고친다.
- `web/easy-summary.test.ts`의 `reportWith` 픽스처에 `weakSignals`가 없어 `scopeVerdict`가 런타임 에러를 낸다. Task 5가 픽스처를 보강한다.

**2. 플레이스홀더 스캔** — TBD·TODO 없음. 모든 코드 스텝에 실제 코드 있음.
플랜 작성 중 다음을 실제로 확인했다:
- `src/index.ts:111`·`:116`이 `generateFounderInsightReport`·`renderFounderInsightReport`를 export 한다 → Task 6 Step 3의 `dist/src/index.js` import가 성립한다.
- `web/easy-summary.test.ts:92-96`의 `at` 헬퍼는 지역 `const`다 → Task 5에 교체 코드를 그대로 실었다.
- 데모 리포트의 승격 세그먼트는 19개다 → 데모는 `segmented`이고, Task 6 Step 2는 회귀 확인용으로 규정했다.

**3. 타입 일관성**
- `ScopeVerdict` — Task 1 정의, Task 2에서 `import { type ScopeVerdict, scopeVerdict }`.
- `scopeVerdict(report: FounderInsightReport): ScopeVerdict` — Task 1 정의, Task 2·5 소비. `web/easy-summary.ts`의 import 경로는 `../src/report/scope.js`(같은 파일이 이미 `../src/report/types.js`를 import 한다).
- `scope` 지역 변수 — Task 2가 `renderFounderInsightReport` 본문 최상단에 선언하고 Task 3·4가 같은 변수를 읽는다. **Task 3·4를 Task 2보다 먼저 실행하면 컴파일되지 않는다. 순서를 지킬 것.**
- 배너·문구 상수 4개(`OUT_OF_SCOPE_BANNER_UNANIMOUS`·`OUT_OF_SCOPE_BANNER_NO_EFFECT`·`NO_SEGMENT_UNDERPOWERED`·`NO_SEGMENT_NO_EFFECT`) 전부 `render.ts`에서 `export`.
- `signalDot`은 `src/format.ts`의 기존 export. `render.ts:1`이 이미 import 한다.

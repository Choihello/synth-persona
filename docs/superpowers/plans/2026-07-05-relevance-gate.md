# LLM 관련성 게이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통계 게이트를 통과했지만 질문과 인과적으로 무관한 축(예: 보안솔루션 ↔ 혼인)을 LLM 1콜 판정으로 승격에서 제외하고 이유와 함께 참고 영역에 보존한다.

**Architecture:** `src/report/relevance.ts`의 `judgeDimensionRelevance`(generateJson 옵셔널, 실패 시 null — llm-prescriptions 계약)가 질문↔차원 관련성을 판정하고, `generate.ts`가 승격된 opportunity/resistance에서 low 차원을 `lowRelevance`로 이동, `render.ts`가 참고 섹션(제목 일반화)에 표기한다. 호출은 web/pipeline.ts에서 처방 생성 옆 1콜.

**Tech Stack:** TypeScript 순수 함수 + provider.generateJson (기존 인터페이스), vitest mock provider (키 없이).

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-05-relevance-gate-design.md`
- `src/types.ts`·`src/aggregate` 무수정. 테스트는 전부 키 없이 그린
- 보수 규칙: 확신할 때만 low (프롬프트에 명시), 판정 실패는 조용한 폴백(null → 게이트 미적용)
- caveat 문구 고정: `질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: {reason})` / reason 없으면 `질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단)`
- 참고 섹션 새 제목: `## 참고 — 순위에 올리지 않은 차이` (기존 "우연일 수 있는 차이" 제목의 테스트 문자열 갱신 필요)
- og-stats `· 응답 분포:` 불릿 무수정 · 쉬운 요약 카드 문구 변화 없음
- 커밋 메시지 끝 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- push는 사용자 승인 후에만 (Task 4). app/vercel.json ignoreCommand 덕에 src/·web/ 변경도 이제 항상 배포됨

---

### Task 1: judgeDimensionRelevance (src/report/relevance.ts)

**Files:**
- Create: `src/report/relevance.ts`
- Test: `src/report/relevance.test.ts`

**Interfaces:**
- Consumes: `LLMProvider.generateJson?(system, user, schema)` (src/llm/provider.ts)
- Produces: `RelevanceVerdict { relevant: Record<string,"high"|"low">; reasons: Record<string,string>; basis:"llm" }`, `judgeDimensionRelevance(opts: { provider; question; dimensions }): Promise<RelevanceVerdict | null>` — Task 2·3이 소비

- [ ] **Step 1: Write the failing tests**

`src/report/relevance.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { LLMProvider } from "../llm/provider.js";
import { judgeDimensionRelevance } from "./relevance.js";

const jsonProvider = (raw: unknown): LLMProvider => ({
  ask: async () => "",
  generateJson: async () => raw,
});

describe("judgeDimensionRelevance", () => {
  const dims = ["연령", "혼인"];

  test("정상 판정: high/low와 low 이유를 파싱한다", async () => {
    const v = await judgeDimensionRelevance({
      provider: jsonProvider({
        verdicts: [
          { dimension: "연령", relevance: "high" },
          { dimension: "혼인", relevance: "low", reason: "보안 수요와 무관" },
        ],
      }),
      question: "보안솔루션을 구독하시겠습니까?",
      dimensions: dims,
    });
    expect(v).toEqual({
      relevant: { 연령: "high", 혼인: "low" },
      reasons: { 혼인: "보안 수요와 무관" },
      basis: "llm",
    });
  });

  test("generateJson 미구현 provider는 null", async () => {
    const v = await judgeDimensionRelevance({
      provider: { ask: async () => "" },
      question: "q",
      dimensions: dims,
    });
    expect(v).toBeNull();
  });

  test("호출이 throw하면 null (조용한 폴백)", async () => {
    const provider: LLMProvider = {
      ask: async () => "",
      generateJson: async () => {
        throw new Error("boom");
      },
    };
    expect(
      await judgeDimensionRelevance({ provider, question: "q", dimensions: dims }),
    ).toBeNull();
  });

  test("스키마 위반(relevance 오타 값)은 null", async () => {
    const v = await judgeDimensionRelevance({
      provider: jsonProvider({
        verdicts: [{ dimension: "연령", relevance: "maybe" }],
      }),
      question: "q",
      dimensions: dims,
    });
    expect(v).toBeNull();
  });

  test("dimensions 밖 항목은 무시, 누락 차원은 relevant에 없음(호출자 high 취급)", async () => {
    const v = await judgeDimensionRelevance({
      provider: jsonProvider({
        verdicts: [
          { dimension: "직업", relevance: "low", reason: "x" },
          { dimension: "연령", relevance: "high" },
        ],
      }),
      question: "q",
      dimensions: dims,
    });
    expect(v).toEqual({ relevant: { 연령: "high" }, reasons: {}, basis: "llm" });
  });

  test("dimensions가 비면 null (콜 낭비 방지)", async () => {
    const v = await judgeDimensionRelevance({
      provider: jsonProvider({ verdicts: [] }),
      question: "q",
      dimensions: [],
    });
    expect(v).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/report/relevance.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write implementation**

`src/report/relevance.ts`:

```ts
import type { LLMProvider } from "../llm/provider.js";

/** 질문↔인구 차원 관련성 판정 (AI). low는 확신 시에만 — 잘못 제외 > 잘못 포함. */
export interface RelevanceVerdict {
  /** 차원 → 관련성. 판정 누락 차원은 소비자가 high로 취급한다. */
  relevant: Record<string, "high" | "low">;
  /** low 차원의 한 줄 이유 (렌더 caveat용) */
  reasons: Record<string, string>;
  basis: "llm";
}

const SYSTEM_PROMPT = [
  "너는 설문 문항과 인구통계 차원의 관련성을 판정하는 리서치 방법론 심사자다.",
  "질문에 대한 응답 성향이 해당 차원에 따라 달라질 타당한 인과·상관 경로가 있으면 high.",
  "확실히 무관할 때만 low. 불확실하면 반드시 high로 판정한다.",
  "low로 판정한 차원에는 반드시 한 줄 reason을 붙인다.",
].join("\n");

const RELEVANCE_SCHEMA = {
  name: "dimension_relevance",
  schema: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension: { type: "string" },
            relevance: { type: "string", enum: ["high", "low"] },
            reason: { type: "string" },
          },
          required: ["dimension", "relevance"],
          additionalProperties: false,
        },
      },
    },
    required: ["verdicts"],
    additionalProperties: false,
  },
};

interface RawVerdict {
  dimension: string;
  relevance: "high" | "low";
  reason?: string;
}

function isVerdicts(raw: unknown): raw is { verdicts: RawVerdict[] } {
  if (typeof raw !== "object" || raw === null) return false;
  const v = (raw as { verdicts?: unknown }).verdicts;
  if (!Array.isArray(v)) return false;
  return v.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const it = item as { dimension?: unknown; relevance?: unknown };
    return (
      typeof it.dimension === "string" &&
      (it.relevance === "high" || it.relevance === "low")
    );
  });
}

/**
 * 질문↔차원 관련성을 LLM 1콜로 판정한다. provider가 generateJson을 지원하지
 * 않거나 호출/검증이 실패하면 null — 호출자는 게이트를 적용하지 않는다
 * (llm-prescriptions와 동일한 조용한 폴백 계약).
 */
export async function judgeDimensionRelevance(opts: {
  provider: LLMProvider;
  question: string;
  dimensions: string[];
}): Promise<RelevanceVerdict | null> {
  const { provider, question, dimensions } = opts;
  if (!provider.generateJson || dimensions.length === 0) return null;

  const user = [
    `질문: ${question}`,
    `인구 차원: ${dimensions.join(", ")}`,
    "각 차원에 대해 relevance(high|low)를, low인 경우 reason을 JSON으로 답하라.",
  ].join("\n");

  let raw: unknown;
  try {
    raw = await provider.generateJson(SYSTEM_PROMPT, user, RELEVANCE_SCHEMA);
  } catch {
    return null;
  }
  if (!isVerdicts(raw)) return null;

  const relevant: Record<string, "high" | "low"> = {};
  const reasons: Record<string, string> = {};
  for (const v of raw.verdicts) {
    if (!dimensions.includes(v.dimension)) continue;
    relevant[v.dimension] = v.relevance;
    if (v.relevance === "low" && typeof v.reason === "string" && v.reason)
      reasons[v.dimension] = v.reason;
  }
  return { relevant, reasons, basis: "llm" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/report/relevance.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: biome + Commit**

```bash
npx biome check --write src/report/relevance.ts src/report/relevance.test.ts
git add src/report/relevance.ts src/report/relevance.test.ts
git commit -m "feat(report): judgeDimensionRelevance — LLM 질문-차원 관련성 판정 (조용한 폴백)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: generate·render 반영 (제외 + 이유 명시)

**Files:**
- Modify: `src/report/types.ts` (FounderInsightReport에 `lowRelevance: SegmentInsight[]`)
- Modify: `src/report/generate.ts` (5번째 선택 인자 + strip 로직)
- Modify: `src/report/render.ts` (섹션 제목 일반화 + lowRelevance 라인)
- Test: `src/report/generate.test.ts`, `src/report/render.test.ts`

**Interfaces:**
- Consumes: Task 1의 `RelevanceVerdict`
- Produces: `generateFounderInsightReport(result, options, reliability?, llmGen?, relevance?: RelevanceVerdict | null)` — Task 3의 pipeline이 5번째 인자로 전달; `FounderInsightReport.lowRelevance`

- [ ] **Step 1: Write the failing tests**

`src/report/generate.test.ts`에 추가 — 파일의 기존 픽스처 스타일을 따르되, 승격이 보장되는 결정적 응답 셋을 직접 구성 (segments.test.ts의 make/study 헬퍼 패턴 복사):

```ts
// (테스트 파일 로컬 헬퍼 — segments.test.ts 패턴)
function mk(pos: number, neg: number, dim: string, val: string): Response[] {
  const out: Response[] = [];
  for (let i = 0; i < pos; i++)
    out.push({
      persona: { id: `p${dim}${val}${i}`, attrs: { [dim]: val }, weight: 1 },
      answer: "쓴다",
      choice: "쓴다",
    });
  for (let i = 0; i < neg; i++)
    out.push({
      persona: { id: `n${dim}${val}${i}`, attrs: { [dim]: val }, weight: 1 },
      answer: "안쓴다",
      choice: "안쓴다",
    });
  return out;
}

test("relevance low 차원의 승격 세그먼트는 lowRelevance로 이동한다", () => {
  // 혼인=A 15/15 긍정 vs 혼인=B 3/12 — 둘 다 뚜렷한 신호로 승격되는 구성
  const responses = [...mk(15, 0, "혼인", "A"), ...mk(3, 12, "혼인", "B")];
  const result: StudyResult = {
    responses,
    signal: "split",
    dispersion: 1,
    bySegment: {},
  };
  const rep = generateFounderInsightReport(
    result,
    { question: "q?", choices: ["쓴다", "안쓴다"], minN: 8 },
    undefined,
    undefined,
    { relevant: { 혼인: "low" }, reasons: { 혼인: "질문과 무관" }, basis: "llm" },
  );
  expect(rep.opportunitySegments).toHaveLength(0);
  expect(rep.resistanceSegments).toHaveLength(0);
  expect(rep.lowRelevance.map((s) => s.segmentLabel).sort()).toEqual([
    "혼인=A",
    "혼인=B",
  ]);
  expect(
    rep.lowRelevance[0].caveats.some((c) =>
      c.includes("질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: 질문과 무관)"),
    ),
  ).toBe(true);
  expect(
    rep.appendix.caveats.some((c) => c.includes("관련성 판단(AI): low = 혼인")),
  ).toBe(true);
});

test("relevance 미전달/null이면 lowRelevance는 빈 배열, 이동 없음", () => {
  const responses = [...mk(15, 0, "혼인", "A"), ...mk(3, 12, "혼인", "B")];
  const result: StudyResult = {
    responses,
    signal: "split",
    dispersion: 1,
    bySegment: {},
  };
  const rep = generateFounderInsightReport(result, {
    question: "q?",
    choices: ["쓴다", "안쓴다"],
    minN: 8,
  });
  expect(rep.lowRelevance).toEqual([]);
  expect(rep.opportunitySegments.length).toBeGreaterThan(0);
});
```

(import에 `Response`/`StudyResult` 타입과 필요 시 픽스처 추가. 기존 테스트 파일에 이미 동등한 헬퍼가 있으면 그것을 재사용하고 mk 중복 생성 금지.)

`src/report/render.test.ts`:
- 기존 "## 참고 — 우연일 수 있는 차이" 문자열 단언을 전부 "## 참고 — 순위에 올리지 않은 차이"로 갱신
- 신규 테스트:

```ts
it("lowRelevance 항목은 참고 섹션 맨 앞에 AI 판단 사유와 함께 나온다", () => {
  const rep = buildReportFixture(); // render.test.ts가 이미 쓰는 리포트 픽스처 생성 경로를 그대로 사용 (이름이 다르면 그 이름으로; 세그먼트 게이트 태스크에서 만든 픽스처에 lowRelevance: [] 기본값을 추가해 재사용)
  rep.lowRelevance = [
    {
      ...rep.opportunitySegments[0],
      segmentLabel: "혼인=유배우",
      positiveRatio: 0.2,
      personaCount: 12,
      caveats: ["질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: 보안 수요와 무관)"],
    },
  ];
  const md = renderFounderInsightReport(rep);
  expect(md).toContain("## 참고 — 순위에 올리지 않은 차이");
  expect(md).toContain(
    "- 혼인=유배우 (긍정 20.0% · 페르소나 12명) — 질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: 보안 수요와 무관)",
  );
});
```

(픽스처가 lowRelevance 필드를 요구하게 되므로 기존 리포트 픽스처들에 `lowRelevance: []` 기본값 추가. pct() 실제 출력 형식에 "긍정 20.0%"를 맞출 것.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/report/generate.test.ts src/report/render.test.ts`
Expected: FAIL (tsc/필드/섹션 부재)

- [ ] **Step 3: Write implementation**

`src/report/types.ts` — FounderInsightReport에 (withinNoise 아래):

```ts
  /** 통계는 유의했지만 질문과 관련성이 낮다고 AI가 판단해 순위에서 제외한 세그먼트 */
  lowRelevance: SegmentInsight[];
```

`src/report/generate.ts`:
- import: `import type { RelevanceVerdict } from "./relevance.js";`
- 시그니처에 5번째 선택 인자 `relevance?: RelevanceVerdict | null`
- rankSegments 구조분해 직후 strip 로직 (기존 지역 변수명에 맞춰 배선 — 이후 코드가 소비하는 이름이 유지되도록 재할당):

```ts
  const lowRelevance: SegmentInsight[] = [];
  let gatedOpportunity = opportunity;
  let gatedResistance = resistance;
  if (relevance) {
    const dimOf = (s: SegmentInsight) => s.segmentLabel.split("=")[0];
    const strip = (list: SegmentInsight[]) =>
      list.filter((s) => {
        if (relevance.relevant[dimOf(s)] !== "low") return true;
        const reason = relevance.reasons[dimOf(s)];
        s.caveats.push(
          reason
            ? `질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: ${reason})`
            : "질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단)",
        );
        lowRelevance.push(s);
        return false;
      });
    gatedOpportunity = strip(opportunity);
    gatedResistance = strip(resistance);
    const lowDims = [...new Set(lowRelevance.map(dimOf))];
    if (lowDims.length > 0)
      caveats.push(`관련성 판단(AI): low = ${lowDims.join(", ")}`);
  }
```

- 이후 opportunity/resistance를 쓰던 자리(캡·confidence 적용·리포트 리터럴)는 `gatedOpportunity`/`gatedResistance`를 쓰도록 치환
- 리포트 리터럴에 `lowRelevance,` 추가

`src/report/render.ts` — 참고 섹션 교체:

```ts
  if (
    report.lowRelevance.length > 0 ||
    report.weakSignals.length > 0 ||
    report.withinNoise.length > 0
  ) {
    md.push("## 참고 — 순위에 올리지 않은 차이", "");
    for (const s of report.lowRelevance) {
      const why =
        s.caveats.find((c) => c.includes("관련성이 낮아")) ??
        "질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단)";
      md.push(
        `- ${s.segmentLabel} (긍정 ${pct(s.positiveRatio)} · 페르소나 ${s.personaCount}명) — ${why}`,
      );
    }
    for (const s of report.weakSignals.slice(0, 5)) {
      // (기존 라인 형식 유지)
```

- [ ] **Step 4: 전체 확인**

Run: `npx tsc --noEmit` → 통과 (lowRelevance 필드 누락 픽스처는 `lowRelevance: []` 추가)
Run: `npx vitest run` → 전체 그린

- [ ] **Step 5: biome + Commit**

```bash
npx biome check --write src/report
git add src/report
git commit -m "feat(report): relevance gate consumption — lowRelevance tier + generalized reference section

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: pipeline 1콜 배선

**Files:**
- Modify: `web/pipeline.ts`
- Test: `web/pipeline.test.ts`

**Interfaces:**
- Consumes: `judgeDimensionRelevance` (Task 1), `generateFounderInsightReport` 5번째 인자 (Task 2)

- [ ] **Step 1: Write the failing test**

`web/pipeline.test.ts`에 추가:

```ts
  test("관련성 low 차원은 승격에서 제외되고 참고 섹션에 남는다", async () => {
    const provider = new MockProvider((p) =>
      (p.attrs.연령 ?? "").startsWith("2") ? "쓴다" : "안쓴다",
    ) as MockProvider & {
      generateJson?: (
        s: string,
        u: string,
        schema: { name: string },
      ) => Promise<unknown>;
    };
    provider.generateJson = async (_s, _u, schema) =>
      schema.name === "dimension_relevance"
        ? {
            verdicts: [
              { dimension: "연령", relevance: "low", reason: "테스트 사유" },
            ],
          }
        : {}; // 처방 스키마에는 무효 JSON → llm 처방은 heuristic 폴백
    const runner = makeReportRunner(provider, {
      n: 30,
      repeats: 1,
      concurrency: 1,
    });
    const md = await runner("질문?", ["쓴다", "안쓴다"], () => {});
    expect(md).toContain("## 참고 — 순위에 올리지 않은 차이");
    expect(md).toContain("질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: 테스트 사유)");
    // 연령 축이 기회 세그먼트 헤더로 승격되지 않았다
    expect(md).not.toMatch(/### 연령=.*긍정 100/);
  });
```

(마지막 단언이 mock 데이터 특성상 과하게 넓으면 완화 — 핵심은 앞 두 단언)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/pipeline.test.ts`
Expected: FAIL — 참고 섹션에 제외 라인 없음

- [ ] **Step 3: Write implementation**

`web/pipeline.ts`:
- import: `import { judgeDimensionRelevance } from "../src/report/relevance.js";`
- `buildLLMPrescriptions` 호출 부근에 (llmGen await 뒤):

```ts
    // 질문↔차원 관련성 판정 (실패 시 null → 게이트 미적용)
    const dimensions = [
      ...new Set(
        result.responses.flatMap((r) => Object.keys(r.persona.attrs)),
      ),
    ];
    const relevance = await judgeDimensionRelevance({
      provider,
      question,
      dimensions,
    });
```

- generate 호출에 5번째 인자 전달:

```ts
    const report = generateFounderInsightReport(
      result,
      options,
      undefined,
      llmGen ?? undefined,
      relevance,
    );
```

- [ ] **Step 4: 통과 + 전체 확인**

Run: `npx vitest run web/pipeline.test.ts` → PASS
Run: `npx vitest run` → 전체 그린, `npx tsc --noEmit` → 통과

- [ ] **Step 5: biome + Commit**

```bash
npx biome check --write web/pipeline.ts web/pipeline.test.ts
git add web/pipeline.ts web/pipeline.test.ts
git commit -m "feat(web): wire relevance gate — one judge call per report

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 게이트 + push(사용자 승인) + 라이브 스모크 + 문서

- [ ] **Step 1: Full gates**

```powershell
npx tsc --noEmit; npm run lint; npx vitest run; cd app; npx next build
```

- [ ] **Step 2: push (사용자 승인 게이트)**

커밋 요약 후 승인 → `git push` → ignoreCommand 덕에 자동 배포, `gh api …/status`로 확인.

- [ ] **Step 3: 라이브 스모크 1건 (≈$0.02)**

무관 축이 뚜렷한 질문(예: 보안솔루션류)으로 리포트 생성 → 리포트에서:
- "## 참고 — 순위에 올리지 않은 차이" 섹션에 "AI 판단:" 제외 라인이 있는지 (또는 low 판정이 안 나왔다면 그 사실을 보고 — LLM 판정은 비결정적이므로 없을 수도 있음, 실패 아님)
- appendix에 "관련성 판단(AI)" 기록 여부

- [ ] **Step 4: handoff 갱신 + 커밋**

`docs/handoff-2026-07-05-v1-live.md` 세그먼트 게이트 절의 "후속 후보: B…" 줄을 완료로 갱신:

```markdown
- B. LLM 관련성 게이트 완료 (2026-07-05): judgeDimensionRelevance 1콜 → 통계 유의해도 무관 축은 "순위에 올리지 않은 차이"로 제외+사유 명시. 실패 시 조용한 폴백. 스펙: docs/superpowers/specs/2026-07-05-relevance-gate-design.md
```

```bash
git add docs/handoff-2026-07-05-v1-live.md
git commit -m "docs: note relevance gate completion in handoff

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

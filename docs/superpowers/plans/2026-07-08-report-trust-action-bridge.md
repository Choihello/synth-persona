# 리포트 신뢰–행동 다리 놓기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정직성 신호를 하나도 삭제하지 않으면서, "못 하는 말" 옆에 "할 수 있는 말"을 짝지어 독자가 리포트를 행동으로 옮길 수 있게 한다.

**Architecture:** 전부 `src/report/render.ts`의 표현 계층 변경이다. 타입·집계·게이트 판정은 건드리지 않는다. 배너를 `basis`별로 분기하고(v2가 drivers에 쓴 패턴 확장), 부록의 `whatThisAllows`를 한 줄 요약으로 승격하며, 액션 섹션에 세그먼트 수치를 조인해 근거 앵커를 단다. 부수적으로 `web/og-stats.ts`의 전역 첫-매치 파싱을 `## 전체 신호` 블록으로 스코프 한정한다.

**Tech Stack:** TypeScript (ESM, `.js` 확장자 import), vitest, biome.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-08-report-trust-action-bridge-design.md`
- **정직성 신호를 0개 삭제한다** — `doNotTrustYet`·`우연일 수 있음`·`판단 보류`·`신뢰도 low`·synthetic 고지. 위치·짝·문구만 바꾼다.
- **타입 변경 금지** — `src/types.ts`·`src/report/types.ts` 기존 필드 무수정, 신규 필드 추가 없음.
- **로직 변경 금지** — `src/aggregate`·세그먼트 집계·게이트 판정(2표본 z-검정) 무수정.
- **헤더 문자열 보존** — `## 전체 신호\n`·`## 기회 세그먼트\n` (pipeline이 차트 주입에 사용).
- **`응답 분포:` 불릿 줄 형식 보존** — og-stats 파서 소스.
- **없는 근거를 지어내지 않는다** — 조인 실패 시 앵커 줄 생략.
- 테스트는 API 키 없이 그린이어야 한다.
- 게이트 4종: `npx vitest run --pool=threads` (⚠️ `--pool=threads` 필수) / `npx tsc --noEmit` / `npm run lint` (⚠️ `tail -1` 금지, 전체 출력 확인) / `cd app && npx next build`.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `web/og-stats.ts` | 렌더 md에서 OG 수치 추출 | Task 1: 섹션 스코프 한정 |
| `web/og-stats.test.ts` | 위 회귀 | Task 1: 미끼 픽스처 |
| `src/report/render.ts` | 리포트 마크다운 렌더 | Task 2~5 |
| `src/report/render.test.ts` | 위 회귀 | Task 2~5 |

Task 1을 먼저 두는 이유: Task 4가 `## 한 줄 요약`에 불릿을 추가하는데, og-stats가 전역 첫 매치를 쓰므로 **먼저 방어벽을 세운 뒤** 불릿을 추가한다.

---

### Task 1: og-stats를 `## 전체 신호` 블록으로 스코프 한정

**Files:**
- Modify: `web/og-stats.ts:13-33`
- Test: `web/og-stats.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `extractOgStats(md: string): OgStats | undefined` — 시그니처 불변. 내부에 `overallSignalScope(md: string): string` 추가(비공개).

- [ ] **Step 1: Write the failing test**

`web/og-stats.test.ts` 끝에 추가:

```ts
it("한 줄 요약의 선행 불릿에 오염되지 않는다 (전체 신호 블록에서만 파싱)", () => {
  const md = [
    "## 한 줄 요약",
    "",
    "- 아직 못 하는 것: 가격 · 응답 분포: 미끼=1",
    "",
    "## 전체 신호",
    "",
    "- ● consensus(합의) · 응답 분포: 쓴다=28, 안쓴다=2",
    "- 표본 30명 · 각 3회 응답(총 90) · 누락률 0.0%",
    "",
    "## 기회 세그먼트",
    "",
  ].join("\n");
  const s = extractOgStats(md);
  expect(s?.dist[0]).toEqual(["쓴다", 28]);
  expect(s?.n).toBe(90);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads web/og-stats.test.ts`
Expected: FAIL — `dist[0]`이 `["미끼", 1]`로 나온다 (첫 매치가 한 줄 요약 불릿).

- [ ] **Step 3: Write minimal implementation**

`web/og-stats.ts`를 다음으로 교체 (13행 `extractOgStats` 위에 헬퍼 추가, 본문에서 `md` → `scope`):

```ts
const OVERALL_HEADER = "## 전체 신호";

/** `## 전체 신호` 블록만 잘라낸다. 헤더가 없으면 전체를 반환(구 리포트 호환). */
function overallSignalScope(md: string): string {
  const start = md.indexOf(OVERALL_HEADER);
  if (start < 0) return md;
  const rest = md.slice(start + OVERALL_HEADER.length);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

export function extractOgStats(md: string): OgStats | undefined {
  // 섹션 스코프 한정 — 앞선 섹션의 불릿이 첫 매치를 가로채지 못하게 한다.
  const scope = overallSignalScope(md);
  // 불릿 줄만 매칭 — 차트 SVG의 aria-label("전체 응답 분포: 찬성 87%…")을 피한다
  const distLine = scope.match(/^- .*?· 응답 분포: ([^\n]+)/m);
  if (!distLine) return undefined;

  const dist: [string, number][] = [];
  for (const part of distLine[1].split(", ")) {
    const eq = part.lastIndexOf("=");
    if (eq <= 0) continue;
    const count = Number(part.slice(eq + 1).trim());
    if (!Number.isFinite(count)) continue;
    dist.push([part.slice(0, eq).trim(), count]);
  }
  if (dist.length === 0) return undefined;

  const nLine =
    scope.match(/^- n=(\d+)/m) ??
    scope.match(/^- 표본 \d+명 · 각 \d+회 응답\(총 (\d+)\)/m);
  const n = nLine ? Number(nLine[1]) : dist.reduce((sum, [, c]) => sum + c, 0);
  return { n, dist };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=threads web/og-stats.test.ts`
Expected: PASS (신규 1건 + 기존 전건).

- [ ] **Step 5: Commit**

```bash
git add web/og-stats.ts web/og-stats.test.ts
git commit -m "fix(og-stats): 전체 신호 블록으로 스코프 한정 — 선행 섹션 불릿 오염 방어"
```

---

### Task 2: `AI_DRAFT_BANNER`를 "정체 → 용도 → 경고" 쌍으로 재작성

**Files:**
- Modify: `src/report/render.ts:10-11`
- Modify: `src/report/render.test.ts:190-193`, `src/report/render.test.ts:266-268`
- Test: 위 두 곳

**Interfaces:**
- Consumes: 없음
- Produces: `AI_DRAFT_BANNER` (export 유지, 문자열 내용만 변경). Task 3이 이 상수를 fallback으로 쓴다.

**주의:** 기존 테스트 2건이 옛 문구에 결합돼 있다. 문구를 바꾸면 반드시 같이 고쳐야 한다.
- `render.test.ts:191` — `md.split("AI 생성 초안")` 개수 카운트
- `render.test.ts:267` — `toContain("heuristic으로 생성된 추정 초안")`

- [ ] **Step 1: Write the failing test**

`src/report/render.test.ts`의 `describe("renderFounderInsightReport — 처방 섹션")` 안,
기존 `it("AI 생성 초안 배너가 처방 섹션들에 나타난다", ...)` 를 **다음으로 교체**:

```ts
  it("초안 배너가 정체·용도·경고를 모두 담고 처방 섹션들에 나타난다", () => {
    const count = md.split("규칙 기반으로 파생된 초안").length - 1;
    expect(count).toBeGreaterThanOrEqual(3); // 관심/거부 + 인터뷰/설문/랜딩 등
    // 정체(LLM 아님) · 용도(출발점) · 경고(교체하세요)를 모두 유지한다
    expect(md).toContain("LLM 아님");
    expect(md).toContain("출발점");
    expect(md).toContain("실제 고객의 문장으로 교체하세요");
  });
```

같은 파일 `describe("renderFounderInsightReport — 배너 basis 구분 + 신뢰도 평이화")` 안,
`it("drivers가 llm 기반이면 …")`의 heuristic 단언(267행)을 **다음으로 교체**:

```ts
    expect(renderFounderInsightReport(base)).toContain(
      "규칙 기반으로 파생된 초안",
    );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/report/render.test.ts`
Expected: FAIL — `"규칙 기반으로 파생된 초안"`이 md에 없다 (count 0).

- [ ] **Step 3: Write minimal implementation**

`src/report/render.ts:10-11`을 교체:

```ts
export const AI_DRAFT_BANNER =
  "> 📝 **위 발견에서 규칙 기반으로 파생된 초안입니다(LLM 아님).** 인터뷰 설계의 출발점으로 쓰고, 실제 고객의 문장으로 교체하세요.";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=threads src/report/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/render.ts src/report/render.test.ts
git commit -m "feat(report): 초안 배너를 부인에서 '정체·용도·경고' 쌍으로 재작성"
```

---

### Task 3: 인터뷰 질문 배너 `basis` 분기 (사실오류 수정)

**Files:**
- Modify: `src/report/render.ts` — 배너 상수 추가, 인터뷰 질문 섹션(`## 인터뷰 질문 초안`)
- Test: `src/report/render.test.ts`

**Interfaces:**
- Consumes: `AI_DRAFT_BANNER` (Task 2)
- Produces: `LLM_QUESTION_BANNER` (export)

**배경:** `llm-prescriptions.ts:212-219`가 `interviewQuestions`를 `basis:"llm"`으로 만든다(패널 실제 응답 이유 도출). 그런데 `render.ts:178`은 조건 없이 heuristic 배너를 붙인다. `추천 인터뷰`·`설문`·`랜딩`은 `llm-prescriptions.ts:225-227`에서 heuristic fallback이므로 **분기하지 않는다.**

- [ ] **Step 1: Write the failing test**

`src/report/render.test.ts`의 `describe("renderFounderInsightReport — 배너 basis 구분 + 신뢰도 평이화")` 안에 추가:

```ts
  it("인터뷰 질문이 llm 기반이면 실측 도출 배너, heuristic이면 초안 배너", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    expect(base.interviewQuestions.length).toBeGreaterThan(0);

    // heuristic 기본
    const heuristicMd = renderFounderInsightReport(base);
    expect(heuristicMd).not.toContain("패널이 실제로 답한 이유에서 도출");

    // 전부 llm이면 실측 배너
    const llm = {
      ...base,
      interviewQuestions: base.interviewQuestions.map((q) => ({
        ...q,
        basis: "llm" as const,
      })),
    };
    expect(renderFounderInsightReport(llm)).toContain(
      "패널이 실제로 답한 이유에서 도출",
    );
  });

  it("인터뷰 질문이 하나라도 heuristic이면 초안 배너를 유지한다", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const mixed = {
      ...base,
      interviewQuestions: base.interviewQuestions.map((q, i) => ({
        ...q,
        basis: (i === 0 ? "heuristic" : "llm") as const,
      })),
    };
    expect(renderFounderInsightReport(mixed)).not.toContain(
      "패널이 실제로 답한 이유에서 도출",
    );
  });

  it("설문·랜딩·추천 인터뷰는 basis와 무관하게 초안 배너를 유지한다", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const allLlm = {
      ...base,
      recommendedInterviews: base.recommendedInterviews.map((t) => ({
        ...t,
        basis: "llm" as const,
      })),
      surveyDraft: base.surveyDraft.map((q) => ({ ...q, basis: "llm" as const })),
      landingPageMessageTests: base.landingPageMessageTests.map((t) => ({
        ...t,
        basis: "llm" as const,
      })),
    };
    const md = renderFounderInsightReport(allLlm);
    // 세 섹션 모두 초안 배너 유지 (실제로 heuristic 생성물이므로)
    const count = md.split("규칙 기반으로 파생된 초안").length - 1;
    expect(count).toBeGreaterThanOrEqual(3);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/report/render.test.ts`
Expected: FAIL — `"패널이 실제로 답한 이유에서 도출"`이 어디에도 없다.

- [ ] **Step 3: Write minimal implementation**

`src/report/render.ts`의 `LLM_SUMMARY_BANNER` 아래(14행 다음)에 추가:

```ts
export const LLM_QUESTION_BANNER =
  "> 💬 **패널이 실제로 답한 이유에서 도출된 질문입니다.** 그대로 물어보기 전에 실제 고객으로 검증하세요.";
```

`render.ts:178` (`md.push("## 인터뷰 질문 초안", "", AI_DRAFT_BANNER, "");`) 를 교체:

```ts
  // ⑩ 인터뷰 질문 — basis가 전부 llm이면 실측 도출 배너 (llm-prescriptions가 생성)
  const questionsAreLLM =
    report.interviewQuestions.length > 0 &&
    report.interviewQuestions.every((q) => q.basis === "llm");
  md.push(
    "## 인터뷰 질문 초안",
    "",
    questionsAreLLM ? LLM_QUESTION_BANNER : AI_DRAFT_BANNER,
    "",
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=threads src/report/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/render.ts src/report/render.test.ts
git commit -m "fix(report): 인터뷰 질문 배너를 basis별 분기 — llm 도출을 heuristic으로 잘못 표기하던 오류"
```

---

### Task 4: `whatThisAllows` / `whatThisDoesNotAllow`를 한 줄 요약으로 승격

**Files:**
- Modify: `src/report/render.ts:44-51`
- Test: `src/report/render.test.ts`

**Interfaces:**
- Consumes: `report.confidenceCard.marketJudgment` (`ConfidenceLayer`: `whatThisAllows`, `whatThisDoesNotAllow`)
- Produces: 없음

**주의:** 신뢰도 4층 표는 부록에 **그대로 둔다**(승격이지 이동이 아니다). `doNotTrustYet`도 삭제하지 않는다.

- [ ] **Step 1: Write the failing test**

`src/report/render.test.ts`의 `describe("renderFounderInsightReport — v2 재배치·리프레이밍")` 안에 추가:

```ts
  it("한 줄 요약에서 '할 수 있는 것'이 '못 하는 것'보다 먼저 온다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    const can = md.indexOf("이 리포트로 할 수 있는 것:");
    const cannot = md.indexOf("아직 못 하는 것:");
    expect(can).toBeGreaterThanOrEqual(0);
    expect(cannot).toBeGreaterThan(can);
    // marketJudgment 실제 값이 그대로 실린다
    expect(md).toContain(report.confidenceCard.marketJudgment.whatThisAllows);
    expect(md).toContain(
      report.confidenceCard.marketJudgment.whatThisDoesNotAllow,
    );
  });

  it("승격해도 정직성 신호(doNotTrustYet)와 부록 신뢰도 표는 남는다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain("아직 믿으면 안 되는 것:");
    expect(md).toContain(report.executiveSummary.doNotTrustYet);
    expect(md).toContain("## 기술 상세 — 신뢰도 4층");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/report/render.test.ts`
Expected: FAIL — `"이 리포트로 할 수 있는 것:"`이 없어 `can === -1`.

- [ ] **Step 3: Write minimal implementation**

`src/report/render.ts:44-51`을 교체:

```ts
  md.push("## 한 줄 요약", "", es.headline, "");
  if (es.topOpportunity) md.push(`- 최우선 기회: **${es.topOpportunity}**`);
  if (es.topResistance) md.push(`- 최대 저항: **${es.topResistance}**`);
  // 정직성 신호는 "못 하는 말"만 두지 않는다 — 부록 신뢰도 4층의 허용 범위를 짝지어 올린다.
  const mj = report.confidenceCard.marketJudgment;
  md.push(
    `- 이 리포트로 할 수 있는 것: ${mj.whatThisAllows}`,
    `- 아직 못 하는 것: ${mj.whatThisDoesNotAllow}`,
    `- 아직 믿으면 안 되는 것: ${es.doNotTrustYet}`,
    `- 이번 주 행동: ${es.thisWeekAction}`,
    "",
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=threads src/report/render.test.ts web/og-stats.test.ts`
Expected: PASS. (og-stats도 함께 돌려 Task 1의 방어벽이 작동함을 확인한다.)

- [ ] **Step 5: Commit**

```bash
git add src/report/render.ts src/report/render.test.ts
git commit -m "feat(report): '할 수 있는 것'을 부록에서 한 줄 요약으로 승격 (정직성 신호 보존)"
```

---

### Task 5: 근거 앵커 — 세그먼트 수치 조인

**Files:**
- Modify: `src/report/render.ts` — 헬퍼 추가, `## 추천 인터뷰 대상`·`## 랜딩 메시지 테스트`
- Test: `src/report/render.test.ts`

**Interfaces:**
- Consumes: `report.opportunitySegments`, `report.resistanceSegments` (`SegmentInsight[]`: `segmentLabel`, `positiveRatio`, `confidence`)
- Produces: 없음 (렌더 내부 헬퍼 `segmentAnchor`)

**설계:** 세그먼트 *이름*을 다시 적는 건 동어반복이다. 이름으로 조인해 **수치**를 끌어온다. 조인 실패 시 앵커 줄을 생략한다 — 없는 근거를 지어내지 않는다.

- [ ] **Step 1: Write the failing test**

`src/report/render.test.ts` 끝에 새 describe 추가:

```ts
describe("renderFounderInsightReport — 근거 앵커", () => {
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
    {
      responses,
      signal: "split" as const,
      dispersion: 0.5,
      bySegment: { 연령: {} },
    },
    { question: "q?", choices: ["쓴다", "안쓴다"] },
  );
  const md = renderFounderInsightReport(report);

  it("승격 세그먼트가 있으면 추천 인터뷰에 근거 앵커(긍정률·신뢰도)가 붙는다", () => {
    expect(report.opportunitySegments.length).toBeGreaterThan(0);
    const seg = report.opportunitySegments[0];
    // targetLabel이 세그먼트 라벨과 조인되면 수치가 앵커로 실린다
    const anchored = report.recommendedInterviews.some(
      (t) => t.targetLabel === seg.segmentLabel,
    );
    if (anchored) {
      expect(md).toContain("← 기회 세그먼트: 긍정 ");
      expect(md).toContain(`신뢰도 ${seg.confidence}`);
    }
  });

  it("조인되지 않는 대상엔 앵커를 붙이지 않는다 (없는 근거 금지)", () => {
    const fake = {
      ...report,
      recommendedInterviews: report.recommendedInterviews.map((t) => ({
        ...t,
        targetLabel: "존재하지 않는 세그먼트",
      })),
      landingPageMessageTests: report.landingPageMessageTests.map((t) => ({
        ...t,
        targetSegment: "존재하지 않는 세그먼트",
      })),
    };
    const fakeMd = renderFounderInsightReport(fake);
    expect(fakeMd).not.toContain("← 기회 세그먼트:");
    expect(fakeMd).not.toContain("← 저항 세그먼트:");
  });

  it("인터뷰 질문·설문 섹션엔 앵커가 없다", () => {
    const qIdx = md.indexOf("## 인터뷰 질문 초안");
    const sEnd = md.indexOf("## 랜딩 메시지 테스트");
    const between = md.slice(qIdx, sEnd);
    expect(between).not.toContain("← 기회 세그먼트:");
    expect(between).not.toContain("← 저항 세그먼트:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/report/render.test.ts -t "근거 앵커"`
Expected: FAIL — `"← 기회 세그먼트: 긍정 "`이 md에 없다.

- [ ] **Step 3: Write minimal implementation**

`src/report/render.ts`의 `segmentLines` 함수 아래(28행 다음)에 헬퍼 추가:

```ts
/**
 * 액션의 대상 라벨을 승격 세그먼트와 조인해 근거 수치를 끌어온다.
 * 조인 실패 시 undefined — 없는 근거를 지어내지 않는다.
 */
function segmentAnchor(
  report: FounderInsightReport,
  label: string,
): string | undefined {
  const hit = (list: SegmentInsight[], kind: string) => {
    const s = list.find((x) => x.segmentLabel === label);
    return s
      ? `- ← ${kind}: 긍정 ${pct(s.positiveRatio)} · 신뢰도 ${s.confidence}`
      : undefined;
  };
  return (
    hit(report.opportunitySegments, "기회 세그먼트") ??
    hit(report.resistanceSegments, "저항 세그먼트")
  );
}
```

`render.ts`의 `## 추천 인터뷰 대상` 루프를 교체:

```ts
  md.push("## 추천 인터뷰 대상", "", AI_DRAFT_BANNER, "");
  for (const t of report.recommendedInterviews) {
    md.push(`### ${t.targetLabel}`);
    const anchor = segmentAnchor(report, t.targetLabel);
    if (anchor) md.push(anchor);
    md.push(
      `- 왜: ${t.whyInterview}`,
      `- 검증할 것: ${t.whatToValidate}`,
      `- 모집 스크리너: ${t.suggestedRecruitingScreener}`,
      `- 권장 인원: ${t.sampleSizeRecommendation}`,
      "",
    );
  }
```

`render.ts`의 `## 랜딩 메시지 테스트` 루프를 교체:

```ts
  md.push("## 랜딩 메시지 테스트", "", AI_DRAFT_BANNER, "");
  for (const t of report.landingPageMessageTests) {
    md.push(`### ${t.headline}`);
    const anchor = segmentAnchor(report, t.targetSegment);
    if (anchor) md.push(anchor);
    md.push(
      `- 서브카피: ${t.subcopy}`,
      `- 타겟: ${t.targetSegment}`,
      `- 가설: ${t.hypothesis}`,
      `- 성공 지표: ${t.successMetric}`,
      `- ⚠️ ${t.caution}`,
      "",
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=threads src/report/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/render.ts src/report/render.test.ts
git commit -m "feat(report): 액션에 근거 앵커(세그먼트 긍정률·신뢰도) 조인 — 조인 실패 시 생략"
```

---

### Task 6: 전체 게이트 + 렌더 육안 확인

**Files:**
- 없음 (검증만). 실패 시 해당 Task로 되돌아간다.

**Interfaces:**
- Consumes: Task 1~5의 산출물
- Produces: 없음

- [ ] **Step 1: 게이트 4종 (⚠️ 함정 2개 주의)**

```bash
npx vitest run --pool=threads
npx tsc --noEmit
npm run lint 2>&1 | grep -A6 '━━━' || npm run lint
cd app && npx next build
```

Expected: 테스트 전건 PASS (기존 350건 + 신규 ~9건) · tsc 무출력 · biome 0 errors · next build 성공.

**⚠️ `npx vitest run` 기본 forks 풀은 이 환경에서 죽는다 — `--pool=threads` 필수.**
**⚠️ `npm run lint 2>&1 | tail -1`은 위쪽 에러를 가린다 — 전체 출력을 봐라.**

- [ ] **Step 2: 렌더 결과 육안 확인**

`eval/report-demo.ts`는 md를 **stdout으로 출력**한다. `npm run report:demo`는
`node dist/eval/report-demo.js`라 **빌드가 선행돼야 한다**(`tsx`는 의존성에 없다).

```bash
npm run build
npm run report:demo > /tmp/demo.md
sed -n '/## 한 줄 요약/,/## 전체 신호/p' /tmp/demo.md
```

한 줄 요약에서 다음 **순서**를 확인한다:
```
- 이 리포트로 할 수 있는 것: 방향 가설 탐색 · 인터뷰 대상 좁히기
- 아직 못 하는 것: …
- 아직 믿으면 안 되는 것: …
- 이번 주 행동: …
```

**⚠️ 데모는 `MockProvider`를 쓴다 — LLM 처방이 없다.** 따라서 데모 md에는
`LLM_QUESTION_BANNER`("패널이 실제로 답한 이유에서 도출")가 **절대 나오지 않는다.**
정상이다. 그 분기는 Task 3의 유닛 테스트가 덮는다. 데모에서는 모든 처방 섹션에
`AI_DRAFT_BANNER`("규칙 기반으로 파생된 초안")가 보이는 게 맞다.

- [ ] **Step 3: 정직성 신호 보존 확인 (불변식 회귀)**

**항상 존재해야 하는 것** (렌더 무조건 경로):

```bash
grep -c "아직 믿으면 안 되는 것" /tmp/demo.md    # ≥1
grep -c "## 기술 상세 — 신뢰도 4층" /tmp/demo.md  # =1
grep -c "synthetic panel" /tmp/demo.md           # ≥2 (상단 disclaimer · 하단 출처)
grep -c "규칙 기반으로 파생된 초안" /tmp/demo.md  # ≥3
```

**데모 데이터에 따라 0일 수 있는 것** (없다고 실패로 보지 말 것 — 조건부 렌더):

```bash
grep -c "우연일 수 있음" /tmp/demo.md   # weakSignals 있을 때만
grep -c "판단 보류" /tmp/demo.md        # observedButHeld·withinNoise 있을 때만
```

데모는 연령 20~34세만 "쓴다"로 답하도록 고정돼 있어 승격 세그먼트가 나온다.
`← 기회 세그먼트: 긍정 ` 앵커가 보이는지도 함께 확인한다(Task 5).

- [ ] **Step 4: og-stats 실측 회귀 (Task 1·4 상호작용)**

Task 4가 `## 한 줄 요약`에 불릿을 추가했다. 실제 렌더된 md에서 OG 수치가
`## 전체 신호` 값으로 나오는지 확인한다 — 유닛 테스트의 미끼 픽스처가 아니라
진짜 출력으로.

```bash
npx vitest run --pool=threads web/og-stats.test.ts
```

Expected: PASS. 추가로 `/tmp/demo.md`의 `## 한 줄 요약` 블록에
`· 응답 분포: ` 문자열이 **없는지** 확인한다(있으면 스코프 한정이 유일한 방어벽이 된다):

```bash
sed -n '/## 한 줄 요약/,/## 전체 신호/p' /tmp/demo.md | grep -c "· 응답 분포: "  # 0 기대
```

- [ ] **Step 5: Commit (변경 없으면 생략)**

게이트만 돌린 경우 커밋할 것이 없다. 수정이 필요했다면 해당 Task 커밋에 포함시킨다.

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | Task |
|---|---|
| 변경 1 — 인터뷰 질문 배너 basis 분기 | Task 3 |
| 변경 2 — `AI_DRAFT_BANNER` 쌍 재작성 | Task 2 |
| 변경 3 — `whatThisAllows` 본문 승격 | Task 4 |
| 변경 4 — 근거 앵커(세그먼트 조인) | Task 5 |
| 선행 불릿 위험 — og-stats 스코프 한정 | Task 1 |
| 검증 1~7 | Task 1(6) · 2 · 3(1,2) · 4(3,4) · 5(7) · 6(5) |
| 불변식 회귀(정직성 신호 보존) | Task 4 Step 1 두 번째 it · Task 6 Step 3 |
| 범위 밖(YAGNI) 3건 | 어떤 Task에도 없음 ✅ |

**2. 플레이스홀더 스캔** — TBD·TODO 없음. 모든 코드 스텝에 실제 코드 있음.
Task 6의 검증 명령은 실제로 실행 가능한 것으로 검증했다: `eval/report-demo.ts`는
md를 stdout으로 출력하고, `npm run report:demo`는 `node dist/eval/report-demo.js`라
`npm run build`가 선행돼야 한다(`tsx`는 의존성에 없다).

**3. 타입 일관성**
- `segmentAnchor(report: FounderInsightReport, label: string): string | undefined` — Task 5에서 정의, Task 5에서만 사용.
- `overallSignalScope(md: string): string` — Task 1에서 정의·사용(비공개).
- `LLM_QUESTION_BANNER` — Task 3에서 정의·사용.
- `AI_DRAFT_BANNER` — Task 2에서 문구 변경, Task 3·5에서 참조. export 유지.
- Task 5의 `segmentAnchor`는 `SegmentInsight`·`FounderInsightReport` 타입을 쓴다. `render.ts:2-6`의 기존 import에 **`FounderInsightReport`는 이미 있고 `SegmentInsight`도 이미 있다** — import 추가 불필요.
- `pct`는 `render.ts:16`의 지역 함수(소수 1자리). `segmentAnchor`가 같은 파일 안이라 접근 가능.

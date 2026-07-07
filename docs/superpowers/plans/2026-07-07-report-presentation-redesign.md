# 리포트 표현 개편 v2 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라이브 리포트의 표현 계층을 개편해 "가치"를 앞세우고 표본 단위를 60명으로 통일하며 출처·신뢰도를 전문적이면서 읽기 쉽게 만든다.

**Architecture:** 게이트·집계 통계 로직은 무수정. `rankSegments`가 이미 계산한 페르소나 총계를 리포트로 노출(파트1)하고, 소비처(카드·차트·렌더·OG)가 60명 단위로 표시(파트2). 이어 render.ts의 섹션 순서·문구·배너·신뢰도카드·출처를 개편(파트2~5).

**Tech Stack:** TypeScript, vitest, biome, Next.js 15.

**Spec:** `docs/superpowers/specs/2026-07-07-report-presentation-redesign.md`

## Global Constraints

- 게이트 판정(2표본 z-검정·효과크기)·세그먼트 집계 로직 **무수정** (segments.ts의 `rankSegments` 판정부·confidence.ts)
- 정직성 신호(우연일 수 있음·low·판단 보류·synthetic 고지)는 **삭제 금지** — 재배치·압축·리프레이밍만
- `src/types.ts`·`src/report/types.ts`는 **옵셔널 필드 추가만** (기존 필드 무수정)
- 코어 런타임 의존성 @anthropic-ai/sdk 단일 · web은 @libsql/client 단일 (새 의존성 금지)
- 테스트는 API 키 없이 그린 · seed 재현성 유지
- 출처는 TS가 실제 쓰는 **통계청 인구총조사 + Nemotron 둘만** — 없는 데이터 레이어 추가 금지
- 파이썬 프로젝트 관련 정보·수치 유입 금지
- **환경 주의**: vitest는 `npx vitest run --pool=threads` (샌드박스에서 기본 forks 풀 spawn 실패 — 코드 문제 아님)
- push는 **사용자 승인 후에만** (AskUserQuestion)
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: 파트1 데이터 계층 — 페르소나 총계 노출

`rankSegments`가 내부에서 이미 계산하는 `perPersona.size`(페르소나 수)·`globalPersonaPos`(과반투표 긍정 페르소나 수)를 반환에 추가하고, `OverallSignalSection`에 옵셔널 필드로 실어 나른다. **판정 로직은 건드리지 않는다.**

**Files:**
- Modify: `src/report/types.ts` (OverallSignalSection에 옵셔널 2필드)
- Modify: `src/report/segments.ts` (rankSegments 반환에 2필드)
- Modify: `src/report/generate.ts` (overallSection이 값 받아 채움)
- Test: `src/report/segments.test.ts`, `src/report/generate.test.ts`

**Interfaces:**
- Produces: `OverallSignalSection.panelSize?: number` (고유 페르소나 수), `OverallSignalSection.panelPositive?: number` (과반투표 긍정 페르소나 수). `rankSegments(...)` 반환 객체에 `panelSize: number`·`panelPositive: number` 추가.

- [ ] **Step 1: 실패 테스트 — rankSegments 반환에 페르소나 총계**

`src/report/segments.test.ts`의 첫 테스트("기준선보다 높은 큰 세그먼트…")에 단언 추가 (기존 `make(9,1,"연령","30대") + make(1,9,"연령","60대")` = 20 페르소나, 30대 9명 긍정 + 60대 1명 긍정 = 10 긍정):

```ts
// rankSegments(...) 반환 구조분해에 panelSize, panelPositive 추가하고:
expect(panelSize).toBe(20);
expect(panelPositive).toBe(10);
```

(구조분해: `const { opportunity, resistance, globalPositiveRatio, panelSize, panelPositive } = rankSegments(study(responses), "쓴다", 8);`)

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/report/segments.test.ts --pool=threads`
Expected: FAIL — panelSize/panelPositive undefined

- [ ] **Step 3: 구현 — rankSegments 반환 확장**

`src/report/segments.ts`의 반환 타입에 2필드 추가하고(반환 객체 리터럴 근처, `globalPositiveRatio` 옆), 반환에 값 채움:

반환 타입 블록(`): { ... }`)에 추가:
```ts
  /** 고유 페르소나 수 (표본 크기) */
  panelSize: number;
  /** 과반투표 긍정 페르소나 수 */
  panelPositive: number;
```
최종 `return {` 블록에 추가 (perPersona·globalPersonaPos는 함수 내 기존 변수):
```ts
    panelSize: perPersona.size,
    panelPositive: globalPersonaPos,
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/report/segments.test.ts --pool=threads`
Expected: PASS

- [ ] **Step 5: 실패 테스트 — overallSignal에 panelSize/panelPositive 반영**

`src/report/generate.test.ts`에 추가 (기존 `bigResult()` 픽스처는 연령 15구간×2명=30 페르소나, 전원 "쓴다"):

```ts
it("overallSignal에 페르소나 총계가 실린다", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "q?",
    choices: ["쓴다", "안쓴다"],
  });
  expect(report.overallSignal.panelSize).toBe(30);
  expect(report.overallSignal.panelPositive).toBe(30);
});
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run src/report/generate.test.ts --pool=threads`
Expected: FAIL — undefined

- [ ] **Step 7: 구현 — 타입 + overallSection 배선**

`src/report/types.ts`의 `OverallSignalSection`에 (기존 필드 뒤, 무수정):
```ts
  /** 고유 페르소나 수 (표본 크기). 구 데이터·CLI는 미설정. */
  panelSize?: number;
  /** 과반투표 긍정 페르소나 수. */
  panelPositive?: number;
```

`src/report/generate.ts`: `overallSection` 시그니처에 페르소나 총계 파라미터 추가하고 반환에 포함:
```ts
function overallSection(
  result: StudyResult,
  options: FounderReportOptions,
  panel: { panelSize: number; panelPositive: number },
): OverallSignalSection {
  // ... 기존 본문 ...
  return {
    // ... 기존 필드 ...
    panelSize: panel.panelSize,
    panelPositive: panel.panelPositive,
  };
}
```

`generateFounderInsightReport` 내 `rankSegments(...)` 호출 결과에서 `panelSize`·`panelPositive`를 구조분해에 추가하고, `overallSignal: overallSection(result, options)` → `overallSignal: overallSection(result, options, { panelSize, panelPositive })`로.

- [ ] **Step 8: 통과 + 전체 회귀**

Run: `npx vitest run --pool=threads`
Expected: 전부 PASS (기존 테스트 무영향 — 옵셔널 필드·추가 반환)

- [ ] **Step 9: 게이트 + Commit**

```bash
npx tsc --noEmit && npm run lint
git add src/report/types.ts src/report/segments.ts src/report/segments.test.ts src/report/generate.ts src/report/generate.test.ts
git commit -m "feat(report): overallSignal에 페르소나 총계(panelSize·panelPositive) 노출 (판정 무수정)"
```

---

### Task 2: 파트1 표시 — 60명 단위로 통일

카드·막대·전체신호·OG가 페르소나 총계를 60명 단위로 표시한다. 180은 "각 3회 응답" 맥락으로 남긴다.

**Files:**
- Modify: `web/easy-summary.ts`, `web/easy-summary.test.ts`
- Modify: `web/charts.ts`, `web/charts.test.ts`
- Modify: `src/report/render.ts` (③ 전체 신호), `src/report/render.test.ts`
- Modify: `web/og-stats.ts`, `web/og-stats.test.ts`
- Modify: `web/pipeline.ts` (shareBarSVG 호출 인자)

**Interfaces:**
- Consumes: `report.overallSignal.panelSize`, `report.overallSignal.panelPositive` (Task 1)

- [ ] **Step 1: easy-summary 실패 테스트 — 실제 panelPositive 사용**

`web/easy-summary.test.ts`의 `reportWith` 헬퍼에 `panelSize?`·`panelPositive?`를 받아 overallSignal에 싣도록 확장하고, 테스트 추가:

```ts
// reportWith over에 panelSize?, panelPositive? 추가하고 overallSignal에 실음
test("overallSignal에 페르소나 총계가 있으면 그 실제값을 쓴다", () => {
  const html = easySummaryHTML(
    reportWith({ dist: { 찬성: 90, 반대: 90 }, panelSize: 60, panelPositive: 6 }),
    "찬성",
    60,
  );
  expect(html).toContain("60명 중 6명"); // 근사(round(0.5*60)=30)가 아니라 실제 6
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run web/easy-summary.test.ts --pool=threads`
Expected: FAIL — "60명 중 30명"(비율 근사)이 나옴

- [ ] **Step 3: easy-summary 구현**

`web/easy-summary.ts`에서 실제 페르소나 값 우선:
```ts
  const ps = report.overallSignal.panelSize;
  const pp = report.overallSignal.panelPositive;
  const denom = ps ?? panelSize;
  const positiveCount = pp ?? Math.round(r * panelSize);
```
표시 문자열의 `${panelSize}명 중 ${positiveCount}명` → `${denom}명 중 ${positiveCount}명`.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run web/easy-summary.test.ts --pool=threads`
Expected: PASS

- [ ] **Step 5: charts 실패 테스트 — 막대가 페르소나 수 라벨**

`web/charts.test.ts`에 추가 (shareBarSVG 시그니처를 panel 옵션 받도록 확장):

```ts
test("shareBarSVG는 panel이 주어지면 페르소나 수로 라벨한다", () => {
  const svg = shareBarSVG({ 쓴다: 19, 안쓴다: 161 }, "쓴다", {
    panelSize: 60,
    panelPositive: 6,
  });
  expect(svg).toContain("쓴다 11% (6명)");
  expect(svg).toContain("안쓴다 89% (54명)");
  expect(svg).toContain("표본 60명");
  expect(svg).not.toContain("(19명)");
});
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run web/charts.test.ts --pool=threads`
Expected: FAIL

- [ ] **Step 7: charts 구현**

`web/charts.ts` `shareBarSVG`에 3번째 옵셔널 인자 추가:
```ts
export function shareBarSVG(
  distribution: Record<string, number>,
  positiveChoice: string,
  panel?: { panelSize: number; panelPositive: number },
): string {
```
`pos`/`neg` 라벨 계산을 panel 우선으로:
```ts
  const labelPos = panel ? panel.panelPositive : pos;
  const labelNeg = panel ? panel.panelSize - panel.panelPositive : neg;
```
제목 텍스트 `전체 응답 분포 (n=${total})` → panel 있으면 `전체 반응 · 표본 ${panel.panelSize}명 (각 3회 응답, 총 ${total})`, 없으면 기존.
하단 라벨 `(${pos}명)`/`(${neg}명)` → `(${labelPos}명)`/`(${labelNeg}명)`.

- [ ] **Step 8: pipeline 배선**

`web/pipeline.ts`의 `shareBarSVG(...)` 호출에 3번째 인자 추가:
```ts
    const shareSvg = shareBarSVG(distForChart, positiveChoice, {
      panelSize: report.overallSignal.panelSize ?? params.n,
      panelPositive: report.overallSignal.panelPositive ?? 0,
    });
```
(기존 첫 2인자 이름은 현행 유지 — 호출부 확인 후 맞춤.)

- [ ] **Step 9: render 전체신호 실패 테스트 — 60명 표기**

`src/report/render.test.ts`에 (bigResult 픽스처는 30 페르소나 전원 긍정 → panelSize 30, panelPositive 30):

```ts
it("전체 신호가 페르소나 수(표본)로 표기된다", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "q?",
    choices: ["쓴다", "안쓴다"],
  });
  const md = renderFounderInsightReport(report);
  expect(md).toContain("표본 30명");
  expect(md).toContain("각 3회 응답");
});
```

- [ ] **Step 10: 실패 확인 → render 구현**

Run: `npx vitest run src/report/render.test.ts --pool=threads` → FAIL

`src/report/render.ts`의 ③ 전체 신호 블록(50~59행)에서 페르소나 총계가 있으면 표본 줄 추가. 기존 `- n=${o.n}...` 줄을 다음으로 교체:
```ts
    `- ${o.panelSize != null ? `표본 ${o.panelSize}명 · 각 3회 응답(총 ${o.n})` : `n=${o.n}`}${o.seed != null ? ` · seed=${o.seed}` : ""}${o.provider ? ` · provider=${o.provider}` : ""} · 누락률 ${pct(o.missingRate)}`,
```
**중요**: og-stats.ts가 `^- n=(\d+)`를 파싱하므로(Step 12에서 갱신), 그리고 `응답 분포:` 줄(55행)은 유지한다 — 이건 응답 단위 분포로 계속 노출하되 og-stats 소스로도 쓰임.

- [ ] **Step 11: og-stats 실패 테스트 — 새 표본 줄 파싱**

`web/og-stats.test.ts`에 추가:
```ts
it("표본 N명 줄에서도 n(응답 수)을 파싱한다", () => {
  const md = [
    "- 🟢 consensus(합의) · 응답 분포: 쓴다=19, 안쓴다=161",
    "- 표본 60명 · 각 3회 응답(총 180) · seed=7 · 누락률 0.0%",
  ].join("\n");
  const stats = extractOgStats(md);
  expect(stats?.n).toBe(180);
  expect(stats?.dist[0]).toEqual(["쓴다", 19]);
});
```

- [ ] **Step 12: og-stats 구현**

`web/og-stats.ts`의 `nLine` 매칭을 표본 줄의 `총 N` 또는 기존 `n=N` 둘 다 잡도록:
```ts
  const nLine = md.match(/^- n=(\d+)/m) ?? md.match(/각 3회 응답\(총 (\d+)\)/m);
```
(`응답 분포:` 파싱은 무변경 — 응답 단위 분포 유지.)

- [ ] **Step 13: 통과 + 전체 회귀 + 게이트**

```bash
npx vitest run --pool=threads   # 전부 PASS
npx tsc --noEmit && npm run lint
cd app && npx next build && cd ..
```

- [ ] **Step 14: Commit**

```bash
git add web/easy-summary.ts web/easy-summary.test.ts web/charts.ts web/charts.test.ts src/report/render.ts src/report/render.test.ts web/og-stats.ts web/og-stats.test.ts web/pipeline.ts
git commit -m "feat(report): 표본 단위를 60명 페르소나로 통일 (카드·막대·전체신호·OG), 180은 각 3회 응답 맥락으로"
```

---

### Task 3: 파트5 출처 계층화 — 통계청 근거 표기

출처에 통계청 인구총조사(KOSIS 실표)를 데이터 근거로 추가한다. census 실표 ID는 `data/census/kr-2024.json`의 `meta.sources` 실제값(DT_1IN1509·DT_1MR2060·DT_1JC1511, year 2024)과 일치.

**Files:**
- Modify: `src/report/generate.ts` (appendix.caveats에 census attribution 주입)
- Modify: `src/report/render.ts` (⑭ 출처 섹션 계층화), `src/report/render.test.ts`
- Test: `src/report/render.test.ts`

**Interfaces:**
- Produces: `appendix.caveats`에 `"데이터 근거:"`로 시작하는 census attribution 1줄 추가

- [ ] **Step 1: 실패 테스트 — 출처에 census + Nemotron 병존**

`src/report/render.test.ts`에 추가. bigResult 리포트의 appendix.caveats에 census·Nemotron 표기가 있다고 가정하려면, 픽스처에 caveats를 주입해야 한다 — generate가 census를 주입하므로 실제 생성물로 검증:
```ts
it("출처에 통계청 census 근거와 Nemotron 서사가 계층화되어 나온다", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "q?",
    choices: ["쓴다", "안쓴다"],
  });
  const md = renderFounderInsightReport(report);
  expect(md).toContain("## 출처");
  expect(md).toContain("통계청 인구총조사 2024");
  expect(md).toContain("DT_1IN1509");
  expect(md).toContain("데이터 근거");
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/report/render.test.ts --pool=threads`
Expected: FAIL — census 표기 없음

- [ ] **Step 3: 구현 — census attribution 주입**

`src/report/generate.ts`에서 appendix 조립 전, census 근거 문자열을 caveats에 추가. `const appendix: ReportAppendix = {` 직전에:
```ts
  const CENSUS_ATTRIBUTION =
    "데이터 근거: 통계청 인구총조사 2024 (KOSIS) — 성·연령·지역(DT_1IN1509), 혼인(DT_1MR2060), 가구원수(DT_1JC1511). IPF 반복비례적합으로 결합분포 합성.";
  const caveatsWithSource = caveats.includes(CENSUS_ATTRIBUTION)
    ? caveats
    : [CENSUS_ATTRIBUTION, ...caveats];
```
그리고 `appendix`의 `caveats: caveats` → `caveats: caveatsWithSource`. (기존 `caveats` 변수명은 현행 확인 후 맞춤.)

- [ ] **Step 4: render 출처 섹션 계층화**

`src/report/render.ts`의 ⑭ 출처 블록(201~209행)을 교체 — census 근거와 서사를 분리:
```ts
  const dataSource = report.appendix.caveats.filter((c) =>
    c.startsWith("데이터 근거:"),
  );
  const narrativeSource = report.appendix.caveats.filter((c) =>
    c.startsWith("페르소나 서사:"),
  );
  if (dataSource.length > 0 || narrativeSource.length > 0) {
    md.push("## 출처", "");
    for (const a of dataSource) md.push(`- ${a}`);
    for (const a of narrativeSource) md.push(`- ${a}`);
    md.push("");
  }
```

- [ ] **Step 5: 통과 + 게이트 + Commit**

```bash
npx vitest run --pool=threads && npx tsc --noEmit && npm run lint
git add src/report/generate.ts src/report/render.ts src/report/render.test.ts
git commit -m "feat(report): 출처에 통계청 인구총조사(KOSIS 실표) 데이터 근거 계층화"
```

---

### Task 4: 파트2 — 섹션 재배치 + 리프레이밍

"관심/거부 이유"를 세그먼트보다 위로 올리고, "없음"·"참고"를 방어→필터링 톤으로. 신뢰도 카드는 부록 위치(출처 직전)로 이동. **신호 삭제 없음.**

**Files:**
- Modify: `src/report/render.ts`, `src/report/render.test.ts`

**Interfaces:** 없음 (렌더 순서·문구)

- [ ] **Step 1: 실패 테스트 — 순서·문구**

`src/report/render.test.ts`에 추가:
```ts
it("관심/거부 이유가 기회 세그먼트보다 위에 온다", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "구독?", choices: ["쓴다", "안쓴다"],
  });
  const md = renderFounderInsightReport(report);
  expect(md.indexOf("## 관심을 끄는 이유")).toBeLessThan(
    md.indexOf("## 기회 세그먼트"),
  );
});
it("세그먼트 없음은 표본 키우기 안내로 리프레이밍된다", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "q?", choices: ["쓴다", "안쓴다"],
  });
  const md = renderFounderInsightReport(report);
  expect(md).toContain("세그먼트로 쪼개 보려면 표본을 키우세요");
  expect(md).not.toContain("유의한 기회 세그먼트 없음");
});
it("신뢰도 카드는 출처 직전(부록)에 온다", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "q?", choices: ["쓴다", "안쓴다"],
  });
  const md = renderFounderInsightReport(report);
  expect(md.indexOf("신뢰도 4층")).toBeGreaterThan(md.indexOf("## 다음 7일"));
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/report/render.test.ts --pool=threads`
Expected: FAIL

- [ ] **Step 3: 구현 — render 재구성**

`renderFounderInsightReport` 본문 순서를 재배치한다. 구체:
1. ③ 전체 신호 다음에 **⑥ 관심/거부 이유 블록(124~129행)을 이동**해 배치.
2. 그 다음 ④ 기회 / ⑤ 저항 세그먼트 + 판단보류 + 참고.
3. "없음" 문구 교체 — 기회(71~75행)·저항(79~83행) 둘 다:
```ts
      "이 규모(표본 소수)에선 세그먼트별 차이가 통계적으로 뚜렷하지 않았어요 — 전체 방향(위)이 핵심 신호입니다. 세그먼트로 쪼개 보려면 표본을 키우세요.",
      "",
```
4. "참고" 섹션 제목(102행) "## 참고 — 순위에 올리지 않은 차이" → `"## 확실한 것만 추렸습니다"`, 리드 한 줄 추가 `"_아래는 표본 대비 작아 순위·가설에서 보류한 차이입니다._"`.
5. "우연 범위 내" 나열(116~120행)을 개수 압축:
```ts
    if (report.withinNoise.length > 0) {
      md.push(
        `- 그 외 ${report.withinNoise.length}개 차이는 우연 범위(±10%p 미만) — 표본 대비 작아 판단 보류`,
      );
    }
```
6. ⑧ 신뢰도 카드 블록(141~154행)을 **⑬ 다음 7일 다음, ⑭ 출처 직전으로 이동**하고 제목 "## 신뢰도 카드" → `"## 기술 상세 — 신뢰도 4층"` (평이화 문구는 Task 5).

주의: weakSignals 캐비앳·다중비교 고지 등 신호 문구는 **유지**.

- [ ] **Step 4: 통과 + 전체 회귀**

Run: `npx vitest run --pool=threads`
Expected: PASS (기존 render.test의 헤더 존재·다중비교 고지 테스트가 여전히 통과하는지 확인 — 제목 바뀐 "참고" 관련 단언이 있으면 갱신)

- [ ] **Step 5: 게이트 + Commit**

```bash
npx tsc --noEmit && npm run lint
git add src/report/render.ts src/report/render.test.ts
git commit -m "feat(report): 관심/거부 이유 상향·없음/참고 필터링 리프레이밍·신뢰도카드 부록 이동 (신호 유지)"
```

---

### Task 5: 파트3+4 — 배너 basis 구분 + 신뢰도 카드 평이화

관심/거부 이유 배너를 실측(llm) 기반이면 다른 문구로, 순수 heuristic만 기존 배너. 신뢰도 4층 표의 층 이름에 생활 언어 병기.

**Files:**
- Modify: `src/report/render.ts`, `src/report/render.test.ts`

**Interfaces:**
- Consumes: `DriverInsight.basis`(`"llm" | "heuristic"`) — 이미 존재

- [ ] **Step 1: 실패 테스트 — basis별 배너**

`src/report/render.test.ts`에 추가. 픽스처 리포트의 keyDrivers basis를 조작하려면 생성물을 직접 만들기보다, 최소 리포트 헬퍼가 필요 — 기존 render.test에 `generateFounderInsightReport` 결과를 쓰되 basis는 heuristic(로컬 기본)이므로 heuristic 배너를 검증하고, llm 케이스는 report 객체를 수동 조립:
```ts
it("drivers가 llm 기반이면 실측 요약 배너, heuristic이면 초안 배너", () => {
  const base = generateFounderInsightReport(bigResult(), {
    question: "q?", choices: ["쓴다", "안쓴다"],
  });
  // heuristic 기본
  expect(renderFounderInsightReport(base)).toContain(
    "heuristic으로 생성된 추정 초안",
  );
  // llm으로 바꾼 사본
  const llm = {
    ...base,
    keyDrivers: base.keyDrivers.map((d) => ({ ...d, basis: "llm" as const })),
  };
  const md = renderFounderInsightReport(llm);
  expect(md).toContain("실제 응답 이유를 종합한 AI 요약");
});
it("신뢰도 4층 표에 생활 언어가 병기된다", () => {
  const md = renderFounderInsightReport(
    generateFounderInsightReport(bigResult(), {
      question: "q?", choices: ["쓴다", "안쓴다"],
    }),
  );
  expect(md).toContain("실측 일치"); // matched 병기 예시 — 실제 표에 등장하는 층 근거에 맞춤
});
```
(2번째 단언의 "실측 일치"는 실제 층 label/reason에 병기 문구가 들어가는지로 — 구현 Step에서 병기 위치 확정 후 이 단언을 맞춘다.)

- [ ] **Step 2: 실패 확인 → 구현: 배너 분기**

Run: `npx vitest run src/report/render.test.ts --pool=threads` → FAIL

`src/report/render.ts` 상단에 실측 배너 상수 추가:
```ts
export const LLM_SUMMARY_BANNER =
  "> 💡 **실제 응답 이유를 종합한 AI 요약** — 패널의 실제 응답 이유를 묶은 것입니다. 참고로 쓰고 실제 고객으로 검증하세요.";
```
관심/거부 이유 섹션에서 basis 판정 후 배너 선택 (drivers·objections 중 하나라도 llm이면 실측 배너):
```ts
  const reasonsAreLLM = [...report.keyDrivers, ...report.keyObjections].some(
    (d) => d.basis === "llm",
  );
  md.push(
    "## 관심을 끄는 이유 / 거부 이유 (추정)",
    "",
    reasonsAreLLM ? LLM_SUMMARY_BANNER : AI_DRAFT_BANNER,
    "",
  );
```

- [ ] **Step 3: 구현 — 신뢰도 층 생활 언어 병기**

`layerLines` 또는 신뢰도 표 조립에서 층 이름·용어에 병기. 최소 침습: 표 상단에 안내 1줄 추가하거나, 층 이름을 병기형으로. 구현은 표 바로 위에 범례 추가:
```ts
    "> 용어: matched(실측 일치) · conditioned/inferred(추정) · unknown(측정 안 됨) · fidelity(원본 분포 재현도)",
    "",
```
을 "## 기술 상세 — 신뢰도 4층" 제목과 표 헤더 사이에 삽입. (Step 1의 "실측 일치" 단언이 이 줄로 충족.)

- [ ] **Step 4: 통과 + 게이트 + Commit**

```bash
npx vitest run --pool=threads && npx tsc --noEmit && npm run lint
git add src/report/render.ts src/report/render.test.ts
git commit -m "feat(report): 관심/거부 배너를 basis별 구분(llm 실측 요약)·신뢰도 4층 용어 생활언어 병기"
```

---

### Task 6: 전체 게이트 · 최종 리뷰 · push 승인 · 라이브 스모크

**Files:** 없음 (검증·배포)

- [ ] **Step 1: 게이트 4종**

```bash
npx vitest run --pool=threads   # 전부 그린 (신규 테스트 포함)
npx tsc --noEmit
npm run lint
cd app && npx next build && cd ..
```

- [ ] **Step 2: 렌더 실물 확인 (report-demo)**

```bash
npm run build >/dev/null 2>&1 && node dist/eval/report-demo.js 2>/dev/null | grep -E "표본 .*명|관심을 끄는|기술 상세|## 출처|통계청" | head
```
Expected: 표본 N명 표기, 관심이유가 위, 기술 상세(신뢰도) 아래, 출처에 통계청. 순서 육안 확인.

- [ ] **Step 3: 최종 코드 리뷰**

superpowers:requesting-code-review로 spec(2026-07-07-report-presentation-redesign.md) 대비 전체 변경 리뷰 (서브에이전트). 특히 "정직성 신호 삭제 없음"·"게이트 로직 무수정"·"출처 census+Nemotron만"을 확인 요청. 지적은 receiving-code-review로 검증 후 반영.

- [ ] **Step 4: push 승인 게이트**

AskUserQuestion으로 push 승인 요청 (커밋 목록 요약). 승인 없이 push 금지.

- [ ] **Step 5: push + 배포 + 라이브 스모크**

```bash
git push origin main
```
Vercel 자동 배포(~2분) 후, 관리자 쿠키로 신규 리포트 1건 생성(한도 우회) → 리포트 열어 육안 확인:
- 카드 "N명 중 M명"과 전체신호 "표본 N명"이 일치
- 관심/거부 이유가 세그먼트보다 위
- 신뢰도 4층이 부록(아래), 출처에 통계청 인구총조사
- 기존 리포트(BAJnsFMKrF)는 옛 md라 변화 없음(정상 — 신규부터 적용)

---

## Self-Review 기록

- **스펙 커버리지**: 파트1(Task1·2)·파트2(Task4)·파트3(Task5)·파트4(Task4 이동+Task5 평이화)·파트5(Task3) — 전부 매핑. §7 테스트 전략은 각 Task Step에 분산.
- **플레이스홀더**: Task5 Step1의 "실측 일치" 단언은 Step3 구현(범례 줄)으로 충족되게 명시 — 허용.
- **타입 일관성**: `panelSize`·`panelPositive`(Task1 정의) → Task2 소비. `DriverInsight.basis`(기존) → Task5. `shareBarSVG(dist, positive, panel?)` 시그니처 Task2 내 일관.
- **불변식**: 게이트 판정·집계 무수정, 옵셔널 필드만 추가, 신호 삭제 없음, census+Nemotron만 — 각 Task에서 유지.

# 세그먼트 유의성 게이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 우연/무관 세그먼트가 기회·저항으로 승격되지 않도록 페르소나 단위 Wilson 90% + 효과크기 10%p 2티어 게이트를 넣고, 하류 표기(렌더·쉬운 요약·차트)를 정직화한다.

**Architecture:** `rankSegments`(src/report/segments.ts)에 게이트를 내장 — 표시용 응답 단위 수치는 불변, 승격 판정만 페르소나 단위. 새 티어(`weakSignals`/`withinNoise`)를 FounderInsightReport로 전달해 render.ts가 "참고 — 우연일 수 있는 차이" 섹션을 그리고, web(easy-summary·pipeline)은 뚜렷한 신호가 없을 때의 폴백을 갖는다.

**Tech Stack:** TypeScript 순수 함수 + vitest. LLM·의존성 추가 없음.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-05-segment-gate-design.md` (윌슨 공식·티어 규칙·검증 예시 포함)
- `src/types.ts`·`src/aggregate/*` 무수정 (Persona.id 읽기만). `src/report/*`·`web/*`은 수정 가능
- 표시용 수치 불변: SegmentInsight의 responseDistribution·positiveRatio·sampleCount는 응답 단위 그대로
- 상수는 `GATE_Z = 1.645`, `GATE_MIN_EFFECT = 0.1` (segments.ts에서 export)
- 쉬운 요약 카드 통계 용어 금지 유지 (신규 문장은 "세그먼트 간 뚜렷한 차이는 없었어요." 뿐)
- render의 "전체 신호" 불릿(`· 응답 분포:` 줄) 무수정 — og-stats 파서 보호
- 커밋 메시지 끝 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- push는 사용자 승인 후에만 (Task 4). web/·src/ 변경이 포함되므로 **app/ 파일이 커밋에 없으면 Vercel이 배포를 스킵**함 — Task 4에서 handoff(docs)와 함께 app/ 무관하므로 마지막 push 후 라이브 반영은 pipeline(web/)이 서버 코드라 배포 필요 → Task 3 커밋에 web/ 변경이 있으니 Task 4에서 배포 확인 필수 (스킵되면 대시보드 Redeploy 요청)

---

### Task 1: rankSegments 게이트 (페르소나 단위 Wilson + 2티어)

**Files:**
- Modify: `src/report/types.ts` (SegmentInsight에 `personaCount`, FounderInsightReport에 `weakSignals`/`withinNoise`)
- Modify: `src/report/segments.ts`
- Test: `src/report/segments.test.ts`

**Interfaces:**
- Produces:
  - `export const GATE_Z = 1.645; export const GATE_MIN_EFFECT = 0.1;`
  - `export function wilsonInterval(p: number, n: number, z: number): [number, number]`
  - `rankSegments(result, positiveChoice, minN)` 반환: `{ opportunity, resistance, weakSignals, withinNoise, observedButHeld, globalPositiveRatio }` — **atBaseline 필드 삭제** (Task 2의 generate.ts가 이 형태를 소비)
  - `SegmentInsight.personaCount: number` (모든 insight에 채움)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/report/segments.test.ts`에서 기존 `atBaseline` 테스트(62행 부근)를 아래 신규 테스트들로 교체. 기존 "기준선보다 아주 조금 높은 큰 세그먼트가 과대평가되지 않는다" 테스트(81행 부근)는 **삭제** — 신규 "효과 10%p 미만…withinNoise" 테스트가 같은 의도를 새 의미론으로 대체한다. 나머지 기존 테스트(31·46·90행 부근)는 유지하되, 픽스처의 세그먼트가 새 분류에서 다른 티어로 가면 조회 대상 배열을 그에 맞게 조정(예: sampleWeightShare 테스트가 opportunity에서 꺼내던 것을 withinNoise에서 꺼내도록):

```ts
// make()에 반복 응답 헬퍼 추가 (파일 상단 헬퍼 옆에)
function makeRepeats(
  personas: Array<{ id: string; attrs: Record<string, string>; picks: string[] }>,
): Response[] {
  return personas.flatMap((p) =>
    p.picks.map((choice) => ({
      persona: { id: p.id, attrs: p.attrs, weight: 1 },
      answer: choice,
      choice,
    })),
  );
}
```

```ts
  test("동률 세그먼트는 withinNoise로 (atBaseline 대체)", () => {
    const responses = [
      ...make(5, 5, "연령", "30대"),
      ...make(5, 5, "연령", "60대"),
    ];
    const r = rankSegments(study(responses), "쓴다", 8);
    expect(r.opportunity).toHaveLength(0);
    expect(r.resistance).toHaveLength(0);
    expect(r.withinNoise.map((s) => s.segmentLabel).sort()).toEqual([
      "연령=30대",
      "연령=60대",
    ]);
  });

  test("효과 10%p 미만 차이는 유의해 보여도 withinNoise", () => {
    // 30대 55% vs 전체 50% — diff 5%p < 10%p
    const responses = [
      ...make(11, 9, "연령", "30대"),
      ...make(9, 11, "연령", "60대"),
    ];
    const r = rankSegments(study(responses), "쓴다", 8);
    expect(r.opportunity).toHaveLength(0);
    expect(
      r.withinNoise.some((s) => s.segmentLabel === "연령=30대"),
    ).toBe(true);
  });

  test("효과는 크지만 표본이 작으면 weakSignals (우연일 수 있음 caveat)", () => {
    // 세그먼트 nP=3 전원 긍정 vs 전체 다수 긍정 — CI가 평균 포함
    const responses = [
      ...make(3, 0, "혼인", "사별·이혼"), // nP=3, ratio 1.0
      ...make(23, 4, "혼인", "기혼"), // 전체 global ≈ 26/30 = 0.867
    ];
    const r = rankSegments(study(responses), "쓴다", 3);
    expect(
      r.opportunity.some((s) => s.segmentLabel === "혼인=사별·이혼"),
    ).toBe(false);
    const weak = r.weakSignals.find(
      (s) => s.segmentLabel === "혼인=사별·이혼",
    );
    expect(weak).toBeDefined();
    expect(weak?.personaCount).toBe(3);
    expect(weak?.caveats.some((c) => c.includes("우연일 수 있음"))).toBe(true);
  });

  test("표본이 충분하고 효과가 크면 뚜렷한 신호로 승격", () => {
    // 30대 15/15 긍정 vs 60대 3/15 — global 0.6, 세그 1.0: lo≈0.85 > 0.6
    const responses = [
      ...make(15, 0, "연령", "30대"),
      ...make(3, 12, "연령", "60대"),
    ];
    const r = rankSegments(study(responses), "쓴다", 8);
    expect(r.opportunity[0].segmentLabel).toBe("연령=30대");
    expect(r.resistance[0].segmentLabel).toBe("연령=60대");
    expect(r.opportunity[0].personaCount).toBe(15);
  });

  test("반복 응답은 페르소나 단위로 보정된다 (과반 투표, 동률은 비긍정)", () => {
    // 페르소나 6명 × 3회. 세그A 3명은 3/3 긍정, 세그B 3명 중 1명만 2/3 긍정
    const responses = makeRepeats([
      { id: "a1", attrs: { 연령: "30대" }, picks: ["쓴다", "쓴다", "쓴다"] },
      { id: "a2", attrs: { 연령: "30대" }, picks: ["쓴다", "쓴다", "쓴다"] },
      { id: "a3", attrs: { 연령: "30대" }, picks: ["쓴다", "쓴다", "쓴다"] },
      { id: "b1", attrs: { 연령: "60대" }, picks: ["안쓴다", "안쓴다", "안쓴다"] },
      { id: "b2", attrs: { 연령: "60대" }, picks: ["안쓴다", "안쓴다", "안쓴다"] },
      { id: "b3", attrs: { 연령: "60대" }, picks: ["쓴다", "쓴다", "안쓴다"] },
    ]);
    const r = rankSegments(study(responses), "쓴다", 3);
    // 페르소나 단위: global 4/6=0.667. 30대 nP=3 ratio 1.0 diff 0.33 — CI [0.53,1] 포함 → weak
    const seg30 = r.weakSignals.find((s) => s.segmentLabel === "연령=30대");
    expect(seg30).toBeDefined();
    expect(seg30?.personaCount).toBe(3);
    // 표시용 수치는 응답 단위 그대로: 9응답 전부 긍정
    expect(seg30?.sampleCount).toBe(9);
    expect(seg30?.positiveRatio).toBeCloseTo(1.0, 4);
  });

  test("반복 동률 페르소나는 비긍정 (보수적) — 분류가 달라진다", () => {
    const responses = makeRepeats([
      { id: "a1", attrs: { 지역: "A" }, picks: ["쓴다", "안쓴다"] }, // 동률 → 비긍정
      { id: "a2", attrs: { 지역: "A" }, picks: ["쓴다", "쓴다"] },
      { id: "b1", attrs: { 지역: "B" }, picks: ["쓴다", "쓴다"] },
      { id: "b2", attrs: { 지역: "B" }, picks: ["쓴다", "쓴다"] },
    ]);
    const r = rankSegments(study(responses), "쓴다", 1);
    // 동률이 비긍정이므로 global 3/4 = 0.75, 지역=A ratio 0.5 → diff 0.25 → weak
    // (동률을 긍정으로 세면 diff 0이 되어 withinNoise가 됨 — 판별 픽스처)
    expect(r.weakSignals.some((s) => s.segmentLabel === "지역=A")).toBe(true);
  });

  test("wilsonInterval 경계: n=0은 [0,1], p=1 n=15 z=1.645 lo≈0.847", () => {
    expect(wilsonInterval(0.5, 0, GATE_Z)).toEqual([0, 1]);
    const [lo, hi] = wilsonInterval(1.0, 15, GATE_Z);
    expect(lo).toBeCloseTo(0.847, 2);
    expect(hi).toBeCloseTo(1.0, 4);
  });
```

import 줄에 `GATE_Z, wilsonInterval` 추가:
`import { GATE_Z, rankSegments, wilsonInterval } from "./segments.js";`

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/report/segments.test.ts`
Expected: FAIL (`wilsonInterval` 미정의, `weakSignals`/`withinNoise` undefined)

- [ ] **Step 3: 구현**

`src/report/types.ts`:
- `SegmentInsight`에 `personaCount: number;` 추가 (`sampleWeightShare` 아래)
- `FounderInsightReport`에 `weakSignals: SegmentInsight[];`와
  `withinNoise: SegmentInsight[];` 추가 (`observedButHeld` 아래)

`src/report/segments.ts` — 전체 구조 (기존 Bucket/toInsight 골격 유지, 변경분):

```ts
export const GATE_Z = 1.645; // Wilson 90% 신뢰구간
export const GATE_MIN_EFFECT = 0.1; // 최소 효과 크기 10%p

/** 이항 비율 윌슨 신뢰구간. n<=0이면 [0,1]. */
export function wilsonInterval(
  p: number,
  n: number,
  z: number,
): [number, number] {
  if (n <= 0) return [0, 1];
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
```

Bucket에 `personaIds: Set<string>` 추가, 집계 루프에서 `b.personaIds.add(r.persona.id)`.

집계 루프 뒤 페르소나 단위 이진화:

```ts
  // 페르소나 단위 보정: 반복 K회 중 positiveChoice 과반이면 긍정 1 (동률은 보수적으로 0)
  const perPersona = new Map<string, { pos: number; total: number }>();
  for (const r of result.responses) {
    if (r.choice == null) continue;
    let p = perPersona.get(r.persona.id);
    if (!p) {
      p = { pos: 0, total: 0 };
      perPersona.set(r.persona.id, p);
    }
    p.total++;
    if (r.choice === positiveChoice) p.pos++;
  }
  const personaPositive = new Map<string, boolean>();
  let globalPersonaPos = 0;
  for (const [id, p] of perPersona) {
    const pos = p.pos > p.total / 2;
    personaPositive.set(id, pos);
    if (pos) globalPersonaPos++;
  }
  const globalPersonaRatio =
    perPersona.size > 0 ? globalPersonaPos / perPersona.size : 0;
```

toInsight에 `personaCount: b.personaIds.size` 채움 (필드 추가만).

분류 루프 교체 (기존 opportunity/resistance push 로직 대체):

```ts
  const weakSignals: Array<{ s: SegmentInsight; score: number }> = [];
  const withinNoise: SegmentInsight[] = [];

  for (const b of buckets.values()) {
    const insight = toInsight(b);
    if (b.total < minN) {
      held.push(insight);
      continue;
    }
    const nP = b.personaIds.size;
    let posP = 0;
    for (const id of b.personaIds) if (personaPositive.get(id)) posP++;
    const segRatio = nP > 0 ? posP / nP : 0;
    const diff = Math.abs(segRatio - globalPersonaRatio);
    const [lo, hi] = wilsonInterval(segRatio, nP, GATE_Z);
    const significant =
      nP > 0 &&
      diff >= GATE_MIN_EFFECT &&
      (globalPersonaRatio < lo || globalPersonaRatio > hi);

    if (significant) {
      const up = segRatio > globalPersonaRatio;
      insight.whyItMatters = up
        ? "전체 평균보다 긍정 반응이 강한 세그먼트"
        : "전체 평균보다 저항이 강한 세그먼트";
      const entry = { s: insight, score: diff * Math.log(nP) };
      if (up) opportunity.push(entry);
      else resistance.push(entry);
    } else if (nP > 0 && diff >= GATE_MIN_EFFECT) {
      insight.caveats.push(
        `표본이 작아 우연일 수 있음 (페르소나 ${nP}명 기준)`,
      );
      weakSignals.push({ s: insight, score: diff });
    } else {
      withinNoise.push(insight);
    }
  }
```

정렬·반환:

```ts
  opportunity.sort((a, b) => b.score - a.score);
  resistance.sort((a, b) => b.score - a.score);
  weakSignals.sort((a, b) => b.score - a.score);
  held.sort((a, b) => b.sampleCount - a.sampleCount);
  withinNoise.sort((a, b) => b.sampleCount - a.sampleCount);

  return {
    opportunity: opportunity.map((x) => x.s),
    resistance: resistance.map((x) => x.s),
    weakSignals: weakSignals.map((x) => x.s),
    withinNoise,
    observedButHeld: held,
    globalPositiveRatio,
  };
```

jsdoc(파일 상단 주석)도 새 랭킹 규칙(페르소나 단위 Wilson 90% + 효과 10%p, 2티어)으로 갱신.

주의: 이 시점에서 `generate.ts`가 `atBaseline`을 구조분해하므로 **tsc가 깨진다** — Task 1에서는 segments.test.ts만 그린으로 만들고, tsc 전체 통과는 Task 2 완료 시점 기준. Task 1 커밋 전 확인 명령은 vitest(segments)만.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/report/segments.test.ts`
Expected: PASS (기존 유지 테스트 + 신규 6개)

- [ ] **Step 5: biome + Commit**

```bash
npx biome check --write src/report/segments.ts src/report/segments.test.ts src/report/types.ts
git add src/report/segments.ts src/report/segments.test.ts src/report/types.ts
git commit -m "feat(report): persona-level Wilson gate — 2-tier segment significance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: generate.ts·render.ts 반영 (정직 표기)

**Files:**
- Modify: `src/report/generate.ts` (rankSegments 새 반환 소비, 리포트 필드 전달)
- Modify: `src/report/render.ts` (참고 섹션 + 빈 기회/저항 문구 + personaCount 각주)
- Test: `src/report/generate.test.ts`, `src/report/render.test.ts` (기대값 갱신 + 신규)

**Interfaces:**
- Consumes: Task 1의 반환 형태 `{ opportunity, resistance, weakSignals, withinNoise, observedButHeld, globalPositiveRatio }`, `SegmentInsight.personaCount`
- Produces: FounderInsightReport.weakSignals/withinNoise 채워짐; 렌더 md에 "## 참고 — 우연일 수 있는 차이" 섹션

- [ ] **Step 1: 실패하는 테스트 작성**

`src/report/render.test.ts`에 추가 (기존 픽스처 빌더를 사용하되 weakSignals/withinNoise 필드 포함 — 기존 헬퍼가 리포트 객체를 만들면 두 필드에 `[]` 기본값을 추가해 컴파일부터 맞춘다):

```ts
  it("weakSignals가 있으면 참고 섹션을 그리고 withinNoise는 한 줄로 나열한다", () => {
    const rep = baseReport(); // 기존 헬퍼 (weakSignals/withinNoise 기본 [])
    rep.weakSignals = [
      {
        ...rep.opportunitySegments[0],
        segmentLabel: "혼인=사별·이혼",
        positiveRatio: 1,
        personaCount: 3,
        caveats: ["표본이 작아 우연일 수 있음 (페르소나 3명 기준)"],
      },
    ];
    rep.withinNoise = [
      { ...rep.opportunitySegments[0], segmentLabel: "성=여자" },
      { ...rep.opportunitySegments[0], segmentLabel: "지역=수도권" },
    ];
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("## 참고 — 우연일 수 있는 차이");
    expect(md).toContain(
      "- 혼인=사별·이혼 (긍정 100% · 페르소나 3명) — 표본이 작아 우연일 수 있음",
    );
    expect(md).toContain("- 우연 범위 내(±10%p 미만): 성=여자, 지역=수도권");
  });

  it("weakSignals·withinNoise 모두 비면 참고 섹션이 없다", () => {
    const md = renderFounderInsightReport(baseReport());
    expect(md).not.toContain("## 참고 — 우연일 수 있는 차이");
  });

  it("기회 세그먼트 0개면 유의성 문구로 안내한다", () => {
    const rep = baseReport();
    rep.opportunitySegments = [];
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("유의한 기회 세그먼트 없음");
  });

  it("세그먼트 헤더에 페르소나 수 각주가 붙는다", () => {
    const md = renderFounderInsightReport(baseReport());
    expect(md).toMatch(/### .+\(n=\d+ · 페르소나 \d+명 · 긍정/);
  });
```

(`baseReport` 헬퍼 이름이 다르면 기존 파일의 리포트 픽스처 헬퍼를 그대로 사용 — 없으면 기존 테스트가 쓰는 생성 경로를 재사용. **픽스처의 SegmentInsight들에 `personaCount` 값 필요** — 기존 픽스처 갱신.)

`src/report/generate.test.ts`: atBaseline caveat 문구("전체 평균과 동률") 단언이 있으면 삭제, 대신:

```ts
  // weakSignals/withinNoise가 리포트로 전달된다 (rankSegments 통합 경로)
  expect(Array.isArray(rep.weakSignals)).toBe(true);
  expect(Array.isArray(rep.withinNoise)).toBe(true);
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/report/render.test.ts src/report/generate.test.ts`
Expected: FAIL (tsc 에러 또는 필드/섹션 부재)

- [ ] **Step 3: 구현**

`src/report/generate.ts`:
- 구조분해를 `const { opportunity, resistance, weakSignals, withinNoise, observedButHeld } = rankSegments(...)`로 교체
- 기존 `for (const s of atBaseline) caveats.push(...)` 루프 **삭제**
- 리포트 리터럴에 `weakSignals,`와 `withinNoise,` 추가 (`observedButHeld` 아래)

`src/report/render.ts`:
- segmentLines 헤더(`### ... (n=${s.sampleCount} · 긍정 ...)`)를
  `(n=${s.sampleCount} · 페르소나 ${s.personaCount}명 · 긍정 ...)`으로
- "(minN을 넘는 기회 세그먼트 없음)" →
  `"(유의한 기회 세그먼트 없음 — 이 규모의 가상 패널에서 흔한 일입니다)"`,
  저항 쪽 대응 문구도 동일 패턴으로 교체
- 저항 세그먼트 섹션 뒤(신뢰도 카드 앞)에 참고 섹션 렌더 추가:

```ts
  // 참고 — 우연일 수 있는 차이 (약한 신호 + 우연 범위)
  if (report.weakSignals.length > 0 || report.withinNoise.length > 0) {
    md.push("## 참고 — 우연일 수 있는 차이", "");
    for (const s of report.weakSignals.slice(0, 5)) {
      md.push(
        `- ${s.segmentLabel} (긍정 ${pct(s.positiveRatio)} · 페르소나 ${s.personaCount}명) — 표본이 작아 우연일 수 있음`,
      );
    }
    if (report.withinNoise.length > 0) {
      md.push(
        `- 우연 범위 내(±10%p 미만): ${report.withinNoise.map((s) => s.segmentLabel).join(", ")}`,
      );
    }
    md.push("");
  }
```

(`pct`는 파일에 이미 import되어 있는 기존 헬퍼 — 긍정 100% 형태. 소수 표기가 다르면 테스트 기대값을 실제 pct 출력에 맞춘다: `pct(1)` → "100.0%"라면 테스트 문자열도 "긍정 100.0%"로.)

- [ ] **Step 4: 전체 소비처 컴파일·테스트 확인**

Run: `npx tsc --noEmit` → 통과 (verify/report.ts 등 다른 소비처가 있으면 함께 수정 — `atBaseline` 참조는 repo 전체 grep으로 소탕: `grep -rn "atBaseline" src/ web/ eval/`)
Run: `npx vitest run` → 전체 그린 (다른 테스트가 personaCount 없는 픽스처로 깨지면 픽스처에 `personaCount: 0` 추가)

- [ ] **Step 5: biome + Commit**

```bash
npx biome check --write src/report
git add src/report
# atBaseline 소탕으로 eval/이나 web/의 소비처를 고쳤다면 그 파일도 함께 add
git commit -m "feat(report): honest rendering — reference section for chance-level segments

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 웹 폴백 (쉬운 요약·차트)

**Files:**
- Modify: `web/easy-summary.ts` (뚜렷한 신호 없음 문장)
- Modify: `web/pipeline.ts` (세그먼트 차트 0개 가드)
- Test: `web/easy-summary.test.ts` (신규 1건), `web/pipeline.test.ts` (기존 그린 유지 확인)

**Interfaces:**
- Consumes: FounderInsightReport (opportunitySegments/resistanceSegments가 게이트 통과분만 담게 됨)
- Produces: 쉬운 요약 카드의 easy-who 블록이 세그먼트 부재 시 `"세그먼트 간 뚜렷한 차이는 없었어요."` 출력

- [ ] **Step 1: 실패하는 테스트 작성**

`web/easy-summary.test.ts`의 "세그먼트 없으면 누가 블록 생략" 테스트를 새 동작으로 교체:

```ts
  test("세그먼트 없으면 '뚜렷한 차이 없음' 문장 + 일반형 다음 할 일", () => {
    const html = easySummaryHTML(reportWith({}), "찬성");
    expect(html).toContain("세그먼트 간 뚜렷한 차이는 없었어요.");
    expect(html).not.toContain("특히");
    expect(html).toContain(
      "다음 할 일: 잠재 고객 5~8명에게 직접 물어보며 확인해 보세요",
    );
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run web/easy-summary.test.ts`
Expected: FAIL (해당 문장 부재)

- [ ] **Step 3: 구현**

`web/easy-summary.ts` — who 블록 로직 교체:

```ts
  const who: string[] = [];
  if (oppLabel) who.push(`특히 ${esc(oppLabel)}의 반응이 가장 좋았어요.`);
  if (resLabel) who.push(`반대로 ${esc(resLabel)}는 망설였어요.`);
  const whoLine =
    who.length > 0 ? who.join(" ") : "세그먼트 간 뚜렷한 차이는 없었어요.";
```

출력 템플릿에서 조건부였던 `easy-who` p를 항상 렌더로 변경:

```ts
<p class="easy-who">${whoLine}</p>
```

`web/pipeline.ts` — segSvg 주입에 빈 데이터 가드 (segmentBarsSVG가 빈 배열에 ""를 반환하는지 web/charts.ts에서 확인; 반환하지 않으면):

```ts
    const segSvg = segData.length > 0 ? segmentBarsSVG(segData, globalRatio) : "";
```

(이미 "" 반환이 보장되면 이 가드는 불필요 — charts.ts를 읽고 판단해 주석으로 근거 남길 것)

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run web/easy-summary.test.ts web/pipeline.test.ts` → PASS
Run: `npx vitest run` → 전체 그린, `npx tsc --noEmit` → 통과

- [ ] **Step 5: biome + Commit**

```bash
npx biome check --write web/easy-summary.ts web/easy-summary.test.ts web/pipeline.ts
git add web/easy-summary.ts web/easy-summary.test.ts web/pipeline.ts
git commit -m "feat(web): honest fallbacks — no-segment sentence in easy summary, chart guard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 데모 검증 + push(사용자 승인) + 라이브 스모크 + 문서

- [ ] **Step 1: 데모 리포트로 게이트 실동작 확인**

```powershell
npm run build          # tsup
npm run report:demo    # 데모 md 출력
```

출력에서 확인: 기회/저항 세그먼트가 뚜렷한 신호만인지, "참고 — 우연일 수 있는 차이" 섹션이 나오는지, 페르소나 각주가 붙는지. (demo는 mock 결정적 데이터 — 세그먼트 구성이 게이트를 어떻게 통과하는지 눈으로 확인하고 결과를 보고)

- [ ] **Step 2: Full gates**

```powershell
npx tsc --noEmit; npm run lint; npx vitest run; cd app; npx next build
```

전부 클린 확인.

- [ ] **Step 3: push (사용자 승인 게이트) + 배포 확인**

커밋 요약 후 승인 → `git push`. **주의: 이번 변경은 src/·web/만이라 Vercel이 "Not affected"로 스킵할 수 있음** — push 후 `gh api repos/Choihello/synth-persona/commits/<sha>/status`로 확인, 스킵이면 app/ 파일 포함 커밋(예: handoff docs는 안 됨 — app/ 필요) 또는 사용자에게 대시보드 Redeploy 요청. 대안: Step 4의 handoff 커밋에 app/ 사소 변경을 묶지 말고, 정직하게 Redeploy를 요청할 것.

- [ ] **Step 4: 라이브 스모크 1건 (≈$0.02)**

새 리포트 생성 → 완료 후: 세그먼트 섹션이 게이트 적용됐는지("페르소나 N명" 각주, 참고 섹션), 쉬운 요약이 뚜렷한 신호 없을 때 새 문장을 쓰는지 확인.

- [ ] **Step 5: handoff 문서 갱신 + 커밋**

`docs/handoff-2026-07-05-v1-live.md` "이번 세션 구현"에 추가:

```markdown
### 세그먼트 유의성 게이트 (신뢰 개선)
- rankSegments가 페르소나 단위(반복 과반 투표) Wilson 90% + 효과 ≥10%p 2티어 게이트로 승격 판정 — 우연/무관 세그먼트가 한줄요약·쉬운요약·차트·처방에 오르지 않음
- 약한 신호는 "참고 — 우연일 수 있는 차이" 섹션, 나머지는 "우연 범위 내" 한 줄. 세그먼트 전멸 시 정직 문구
- 후속 후보: B. LLM 관련성 게이트 (질문↔차원 관련성 1콜)
- 스펙: docs/superpowers/specs/2026-07-05-segment-gate-design.md
```

```bash
git add docs/handoff-2026-07-05-v1-live.md
git commit -m "docs: note segment significance gate in handoff

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

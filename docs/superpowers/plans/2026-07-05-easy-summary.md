# 쉬운 요약 카드 ("한눈에 보기") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 리포트 최상단에 통계 문외한용 생활 언어 요약 카드를 결정적 템플릿으로 주입한다 (기존 13섹션·CLI 불변).

**Architecture:** `web/easy-summary.ts` 순수 함수가 구조화 리포트(FounderInsightReport)에서 HTML 카드를 생성하고, `web/pipeline.ts`가 렌더된 md의 "## 한 줄 요약" 앞에 주입한다 (charts.ts 주입과 동일 패턴). 스타일은 `app/src/app/globals.css`의 기존 토큰만 사용.

**Tech Stack:** TypeScript(ESM, .js 확장자 import), vitest, marked(HTML 블록 통과), Next.js 15 (app/).

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-05-easy-summary-design.md`
- 코어(src/) 무수정. `src/report/types.js`에서 **type-only** import만 허용
- 카드 본문에 통계 용어 금지: `n=`, `seed`, `%`, `신뢰도`, `consensus`, `split`
- 카드에 문자열 **"응답 분포:" 사용 금지** (web/og-stats.ts 파서 보호)
- 동적 텍스트(선택지·세그먼트 라벨)는 전부 HTML 이스케이프
- 블록 4의 AI 면책 문장은 항상 포함 (synthetic panel 과장 금지 불변식)
- CSS는 기존 CSS 변수 토큰만 사용 (신규 색상 금지 — dataviz 검증 회피)
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- push는 사용자 승인 후에만. web/만 커밋되면 Vercel이 배포를 스킵하므로 이 작업(web/+app/ 동시 변경)은 해당 없음 — 단 커밋을 쪼개 web/만 나중에 push하지 말 것

---

### Task 1: humanizeSegmentLabel — 세그먼트 라벨 생활 언어 변환

**Files:**
- Create: `web/easy-summary.ts`
- Test: `web/easy-summary.test.ts`

**Interfaces:**
- Produces: `humanizeSegmentLabel(label: string): string` — Task 2가 같은 파일에서 사용

- [ ] **Step 1: Write the failing test**

`web/easy-summary.test.ts` 생성:

```ts
import { describe, expect, test } from "vitest";
import { humanizeSegmentLabel } from "./easy-summary.js";

describe("humanizeSegmentLabel", () => {
  test("연령은 값 그대로", () => {
    expect(humanizeSegmentLabel("연령=45~49세")).toBe("45~49세");
  });
  test("지역은 거주자를 붙인다", () => {
    expect(humanizeSegmentLabel("지역=수도권")).toBe("수도권 거주자");
  });
  test("성은 여자→여성, 남자→남성", () => {
    expect(humanizeSegmentLabel("성=여자")).toBe("여성");
    expect(humanizeSegmentLabel("성=남자")).toBe("남성");
  });
  test("가구원수 N명은 N인 가구로", () => {
    expect(humanizeSegmentLabel("가구원수=가구원수 1명")).toBe("1인 가구");
    expect(humanizeSegmentLabel("가구원수=가구원수 4명")).toBe("4인 가구");
  });
  test("혼인은 값 그대로", () => {
    expect(humanizeSegmentLabel("혼인=사별·이혼")).toBe("사별·이혼");
  });
  test("미지의 차원은 라벨 원문 그대로", () => {
    expect(humanizeSegmentLabel("직업=자영업")).toBe("직업=자영업");
  });
  test("=가 없는 라벨은 원문 그대로", () => {
    expect(humanizeSegmentLabel("전체")).toBe("전체");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/easy-summary.test.ts`
Expected: FAIL — `Failed to load ./easy-summary.js` (모듈 없음)

- [ ] **Step 3: Write minimal implementation**

`web/easy-summary.ts` 생성:

```ts
/**
 * 쉬운 요약 카드 ("한눈에 보기") — 통계 문외한용 생활 언어 요약을
 * 구조화 리포트에서 결정적으로 생성한다 (LLM 없음, md 재파싱 없음).
 * 스펙: docs/superpowers/specs/2026-07-05-easy-summary-design.md
 */

const SEX_MAP: Record<string, string> = { 여자: "여성", 남자: "남성" };

/** "차원=값" 세그먼트 라벨 → 생활 언어. 모르는 차원은 원문 그대로. */
export function humanizeSegmentLabel(label: string): string {
  const eq = label.indexOf("=");
  if (eq < 0) return label;
  const dim = label.slice(0, eq);
  const val = label.slice(eq + 1);
  switch (dim) {
    case "연령":
    case "혼인":
      return val;
    case "지역":
      return `${val} 거주자`;
    case "성":
      return SEX_MAP[val] ?? val;
    case "가구원수": {
      const m = val.match(/(\d+)명/);
      return m ? `${m[1]}인 가구` : val;
    }
    default:
      return label;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/easy-summary.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add web/easy-summary.ts web/easy-summary.test.ts
git commit -m "feat(web): humanizeSegmentLabel — 세그먼트 라벨 생활 언어 변환

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: easySummaryHTML — 판정·4블록 카드 생성

**Files:**
- Modify: `web/easy-summary.ts` (Task 1 파일에 추가)
- Test: `web/easy-summary.test.ts` (추가)

**Interfaces:**
- Consumes: `humanizeSegmentLabel` (Task 1), `FounderInsightReport`/`SegmentInsight` 타입 (`../src/report/types.js`)
- Produces: `easySummaryHTML(report: FounderInsightReport, positiveChoice: string): string` — Task 3의 pipeline이 사용. total=0이면 `""`.

- [ ] **Step 1: Write the failing tests**

`web/easy-summary.test.ts`에 추가 (파일 상단 import를 아래처럼 교체):

```ts
import { describe, expect, test } from "vitest";
import type { FounderInsightReport } from "../src/report/types.js";
import { easySummaryHTML, humanizeSegmentLabel } from "./easy-summary.js";
```

그리고 테스트 블록 추가:

```ts
/** 최소 리포트 픽스처 — 필요한 필드만 채우고 나머지는 캐스팅으로 생략 */
function reportWith(over: {
  signal?: "consensus" | "split";
  dist?: Record<string, number>;
  n?: number;
  opp?: string;
  res?: string;
  consistency?: "high" | "medium" | "low" | "unknown";
}): FounderInsightReport {
  return {
    overallSignal: {
      signal: over.signal ?? "consensus",
      distribution: over.dist ?? { 찬성: 78, 반대: 4, 유보: 8 },
      n: over.n ?? 90,
      missingRate: 0,
      label: "",
    },
    opportunitySegments: over.opp
      ? [{ segmentLabel: over.opp } as never]
      : [],
    resistanceSegments: over.res ? [{ segmentLabel: over.res } as never] : [],
    confidenceCard: {
      responseConsistency: { label: over.consistency ?? "medium" },
    } as never,
  } as FounderInsightReport;
}

describe("easySummaryHTML", () => {
  test("consensus r=0.87 → 뚜렷 긍정 + 10명 중 9명 + n 기준", () => {
    const html = easySummaryHTML(reportWith({}), "찬성");
    expect(html).toContain("반응이 뚜렷하게 긍정적이에요");
    expect(html).toContain("10명 중 9명");
    expect(html).toContain("가상 응답 90개 기준");
  });
  test("판정 경계: 0.8 뚜렷 긍정 / 0.6 긍정 가까움 / 0.5 갈림 / 0.35 부정 가까움 / 0.1 뚜렷 부정", () => {
    const at = (pos: number, total: number) =>
      easySummaryHTML(
        reportWith({ dist: { 찬성: pos, 반대: total - pos } }),
        "찬성",
      );
    expect(at(80, 100)).toContain("반응이 뚜렷하게 긍정적이에요");
    expect(at(60, 100)).toContain("긍정에 가까운 반응이에요");
    expect(at(50, 100)).toContain("반응이 갈렸어요");
    expect(at(35, 100)).toContain("부정에 가까운 반응이에요");
    expect(at(10, 100)).toContain("반응이 뚜렷하게 부정적이에요");
  });
  test("split이면 비율과 무관하게 갈림", () => {
    const html = easySummaryHTML(
      reportWith({ signal: "split", dist: { 찬성: 85, 반대: 15 } }),
      "찬성",
    );
    expect(html).toContain("반응이 갈렸어요");
  });
  test("세그먼트가 있으면 생활 언어로 누가 좋아했나/망설였나", () => {
    const html = easySummaryHTML(
      reportWith({ opp: "연령=45~49세", res: "연령=65~69세" }),
      "찬성",
    );
    expect(html).toContain("특히 45~49세의 반응이 가장 좋았어요");
    expect(html).toContain("반대로 65~69세는 망설였어요");
    expect(html).toContain(
      "다음 할 일: 45~49세 실제 고객 5~8명에게 직접 물어보고",
    );
  });
  test("세그먼트 없으면 누가 블록 생략 + 일반형 다음 할 일", () => {
    const html = easySummaryHTML(reportWith({}), "찬성");
    expect(html).not.toContain("특히");
    expect(html).not.toContain("반대로");
    expect(html).toContain(
      "다음 할 일: 잠재 고객 5~8명에게 직접 물어보며 확인해 보세요",
    );
  });
  test("AI 면책은 항상 + consistency 분기", () => {
    expect(easySummaryHTML(reportWith({}), "찬성")).toContain(
      "AI가 인구 구성을 흉내 내 답한 결과예요",
    );
    expect(
      easySummaryHTML(reportWith({ consistency: "high" }), "찬성"),
    ).toContain("응답끼리는 꽤 일관적이었어요");
    expect(
      easySummaryHTML(reportWith({ consistency: "low" }), "찬성"),
    ).toContain("응답이 흔들려서 더 조심해서 봐야 해요");
    expect(easySummaryHTML(reportWith({}), "찬성")).not.toContain(
      "일관적이었어요",
    );
  });
  test("선택지 XSS 이스케이프", () => {
    const html = easySummaryHTML(
      reportWith({ dist: { '<script>x</script>': 9, 아니오: 1 } }),
      "<script>x</script>",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  test("og-stats 보호: '응답 분포:' 미포함 + 통계 용어 미포함", () => {
    const html = easySummaryHTML(
      reportWith({ opp: "연령=45~49세" }),
      "찬성",
    );
    expect(html).not.toContain("응답 분포:");
    expect(html).not.toContain("n=");
    expect(html).not.toContain("%");
  });
  test("total=0이면 빈 문자열", () => {
    expect(easySummaryHTML(reportWith({ dist: {} }), "찬성")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/easy-summary.test.ts`
Expected: FAIL — `easySummaryHTML is not a function` (Task 1의 7개는 PASS 유지)

- [ ] **Step 3: Write implementation**

`web/easy-summary.ts`에 추가:

```ts
import type { FounderInsightReport } from "../src/report/types.js";

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** 판정 문장 — split이 비율보다 우선. */
function verdictSentence(signal: "consensus" | "split", r: number): string {
  if (signal === "split" || (r >= 0.4 && r < 0.6)) return "반응이 갈렸어요";
  if (r >= 0.8) return "반응이 뚜렷하게 긍정적이에요";
  if (r >= 0.6) return "긍정에 가까운 반응이에요";
  if (r >= 0.2) return "부정에 가까운 반응이에요";
  return "반응이 뚜렷하게 부정적이에요";
}

/**
 * 쉬운 요약 카드 HTML. marked가 블록 HTML로 통과시킨다.
 * total=0이면 "" (주입 생략). "응답 분포:" 문자열 금지 — og-stats 파서 보호.
 */
export function easySummaryHTML(
  report: FounderInsightReport,
  positiveChoice: string,
): string {
  const dist = report.overallSignal.distribution;
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  if (total === 0) return "";
  const r = (dist[positiveChoice] ?? 0) / total;
  const outOfTen = Math.round(r * 10);
  const verdict = verdictSentence(report.overallSignal.signal, r);

  const opp = report.opportunitySegments[0];
  const res = report.resistanceSegments[0];
  const oppLabel = opp ? humanizeSegmentLabel(opp.segmentLabel) : undefined;
  const resLabel = res ? humanizeSegmentLabel(res.segmentLabel) : undefined;

  const who: string[] = [];
  if (oppLabel) who.push(`특히 ${esc(oppLabel)}의 반응이 가장 좋았어요.`);
  if (resLabel) who.push(`반대로 ${esc(resLabel)}는 망설였어요.`);

  const next = oppLabel
    ? `다음 할 일: ${esc(oppLabel)} 실제 고객 5~8명에게 직접 물어보고, 이 반응이 진짜인지 확인해 보세요.`
    : "다음 할 일: 잠재 고객 5~8명에게 직접 물어보며 확인해 보세요.";

  const consistency = report.confidenceCard.responseConsistency.label;
  const trustExtra =
    consistency === "high"
      ? " 그래도 응답끼리는 꽤 일관적이었어요."
      : consistency === "low"
        ? " 응답이 흔들려서 더 조심해서 봐야 해요."
        : "";

  return `<section class="easy-summary" aria-label="한눈에 보기">
<p class="easy-kicker">한눈에 보기</p>
<p class="easy-verdict">${verdict}</p>
<p class="easy-count"><span class="easy-count-num">10명 중 ${outOfTen}명</span>이 “${esc(positiveChoice)}” <span class="easy-basis">가상 응답 ${report.overallSignal.n}개 기준</span></p>
${who.length > 0 ? `<p class="easy-who">${who.join(" ")}</p>\n` : ""}<p class="easy-next">${next}</p>
<p class="easy-trust">진짜 사람이 아니라 AI가 인구 구성을 흉내 내 답한 결과예요 — 방향을 잡는 참고로만 쓰세요.${trustExtra}</p>
</section>`;
}
```

주의: 파일 내 import 순서는 biome이 정렬한다 — `import type`은 파일 최상단으로 이동시킬 것.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/easy-summary.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Lint/format then commit**

```bash
npx biome check --write web/easy-summary.ts web/easy-summary.test.ts
git add web/easy-summary.ts web/easy-summary.test.ts
git commit -m "feat(web): easySummaryHTML — 결정적 생활 언어 요약 카드 (판정 5단계 + 4블록)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: pipeline 주입

**Files:**
- Modify: `web/pipeline.ts` (렌더 직후, 차트 주입 앞)
- Test: `web/pipeline.test.ts` (기존 테스트에 단언 추가)

**Interfaces:**
- Consumes: `easySummaryHTML(report, positiveChoice)` (Task 2)
- Produces: 저장되는 리포트 md 최상단(제목·disclaimer 아래, "## 한 줄 요약" 위)에 `<section class="easy-summary">` 포함

- [ ] **Step 1: Write the failing test**

`web/pipeline.test.ts`의 기존 테스트에 단언 3개 추가 (`expect(md).toContain("## 한 줄 요약");` 바로 뒤):

```ts
    // 쉬운 요약 카드가 "## 한 줄 요약" 앞(제목 아래)에 주입된다
    expect(md).toContain('<section class="easy-summary"');
    expect(md.indexOf('<section class="easy-summary"')).toBeLessThan(
      md.indexOf("## 한 줄 요약"),
    );
    expect(md.indexOf('<section class="easy-summary"')).toBeGreaterThan(
      md.indexOf("# "),
    );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/pipeline.test.ts`
Expected: FAIL — `expected md to contain '<section class="easy-summary"'`

- [ ] **Step 3: Write implementation**

`web/pipeline.ts` 수정 — import 추가:

```ts
import { easySummaryHTML } from "./easy-summary.js";
```

`let md = renderFounderInsightReport(report);` 와 차트 주입 사이,
`const positiveChoice = options.choices[0];` 를 easy 주입보다 위로 올려 재사용:

```ts
    let md = renderFounderInsightReport(report);
    const positiveChoice = options.choices[0];

    // 쉬운 요약 카드 — 제목·disclaimer 아래, 전문 리포트 첫 섹션 위
    const easy = easySummaryHTML(report, positiveChoice);
    if (easy) {
      md = md.replace("## 한 줄 요약\n", `${easy}\n\n## 한 줄 요약\n`);
    }
```

(기존 차트 주입 코드의 `const positiveChoice = options.choices[0];` 중복 선언은 제거)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Full test suite + commit**

Run: `npx vitest run` → 전부 PASS (기존 263 + 신규 16 = 279 근처), `npx tsc --noEmit` → 통과

```bash
git add web/pipeline.ts web/pipeline.test.ts
git commit -m "feat(web): inject easy-summary card above the expert report

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 카드 스타일 + 시각 검증 (라이트/다크)

**Files:**
- Modify: `app/src/app/globals.css` (홈 갤러리 섹션과 다크 모드 섹션 사이에 삽입)

**Interfaces:**
- Consumes: Task 2가 출력하는 클래스 `.easy-summary`, `.easy-kicker`, `.easy-verdict`, `.easy-count`, `.easy-count-num`, `.easy-basis`, `.easy-who`, `.easy-next`, `.easy-trust`

- [ ] **Step 1: Add CSS**

`/* ── 다크 모드 ─────────────────────────────── */` 주석 바로 위에 삽입:

```css
/* ── 쉬운 요약 카드 (한눈에 보기) ───────────── */
.easy-summary {
  background: var(--surface-raised);
  border: 1px solid var(--hairline);
  border-radius: 10px;
  padding: 24px 28px;
  margin: 28px 0 8px;
  box-shadow: 0 1px 2px rgba(31, 29, 26, 0.04);
}

.easy-summary p {
  margin: 0;
}

.easy-kicker {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--ink-muted);
  margin-bottom: 6px !important;
}

.easy-verdict {
  font-family: var(--font-serif), serif;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.015em;
  line-height: 1.35;
}

.easy-count {
  margin: 10px 0 0 !important;
  color: var(--ink-secondary);
}

.easy-count-num {
  font-family: var(--font-serif), serif;
  font-size: 40px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.02em;
  margin-right: 4px;
  font-variant-numeric: tabular-nums;
}

.easy-basis {
  display: block;
  font-size: 12.5px;
  color: var(--ink-muted);
  margin-top: 2px;
}

.easy-who,
.easy-next {
  margin-top: 14px !important;
  padding-top: 14px;
  border-top: 1px solid var(--hairline);
  font-size: 15.5px;
}

.easy-trust {
  margin-top: 14px !important;
  padding-top: 12px;
  border-top: 1px solid var(--hairline);
  font-size: 13px;
  color: var(--ink-muted);
}
```

- [ ] **Step 2: Build + seeded local server**

```powershell
cd app; npx next build   # 통과 확인
# 시드 스크립트로 done 리포트 준비 (스크래치패드 seed-og.mjs의 md에는
# easy-summary가 없으므로, 이번엔 mock 리포트를 실제 파이프라인으로 생성:
cd ..
node --experimental-strip-types -e "
import { MockProvider } from './src/llm/mock.ts';
import { makeReportRunner } from './web/pipeline.ts';
import { SqliteStore } from './web/store.ts';
const runner = makeReportRunner(new MockProvider(p => (p.attrs['연령'] ?? '').startsWith('4') ? '찬성' : '반대'), { n: 10, repeats: 1, concurrency: 1 });
const md = await runner('주 4일 근무제 도입에 찬성하십니까?', ['찬성','반대','유보'], () => {});
const store = new SqliteStore('web-reports.db');
await store.create({ id: 'easytest123', question: '주 4일 근무제 도입에 찬성하십니까?', choices: ['찬성','반대','유보'], ipHash: 'seed', createdAt: new Date().toISOString() });
await store.markDone('easytest123', md);
console.log('seeded easytest123');
"
$env:DB_PATH = (Resolve-Path web-reports.db).Path
cd app; npx next start -p 3211   # 백그라운드
```

(node --experimental-strip-types 가 json import 등에서 실패하면 대안:
`npx vitest run web/pipeline.test.ts` 통과를 근거로 md 구조를 신뢰하고,
스크래치패드에 md를 파일로 뽑아 seed-og.mjs 방식으로 INSERT)

- [ ] **Step 3: Visual verification (light + dark)**

- `http://localhost:3211/r/easytest123` 스크린샷 (라이트): 카드가 제목 아래 첫 요소, 세리프 판정 헤드라인, 큰 숫자, 구분선 3개 확인
- preview 도구 다크 에뮬레이션(`colorScheme: dark`)에서 `.easy-summary` computed background = `rgb(34, 30, 25)`(--surface-raised 다크), `.easy-verdict` color = `rgb(236, 231, 220)` 확인
- 확인 후 서버 종료 + `web-reports.db` 삭제 (테스트 잔재)

- [ ] **Step 4: Commit**

```bash
git add app/src/app/globals.css
git commit -m "feat(app): editorial styles for the easy-summary card

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 전체 검증 + push(사용자 승인) + 라이브 확인

**Files:** (변경 없음 — 검증·배포만)

- [ ] **Step 1: Full verification**

```powershell
npx tsc --noEmit          # 통과
npm run lint              # 0 errors
npx vitest run            # 전부 그린 (279개 근처)
cd app; npx next build    # 통과
```

- [ ] **Step 2: push (사용자 승인 게이트)**

사용자에게 커밋 목록을 요약해 push 승인 요청. 승인 후 `git push`.
web/+app/ 모두 포함이므로 Vercel 스킵 함정 해당 없음.

- [ ] **Step 3: Live verification**

- 새 리포트 1건 생성 (POST https://synth-persona-app.vercel.app/api/reports, 회당 ≈$0.02) 또는 사용자가 브라우저에서 생성
- 완료 후 공유 페이지에서 `<section class="easy-summary">`가 제목 아래 렌더되는지, 판정·큰 숫자·면책 문구 확인
- 기존 리포트(1zt5RRsfUs)는 md가 저장본이라 카드가 **없는 게 정상** (재생성 없음) — 사용자에게 명시

- [ ] **Step 4: 핸드오프 문서에 결과 1줄 추가 후 커밋**

`docs/handoff-2026-07-05-v1-live.md`의 "이번 세션 구현" 아래에 쉬운 요약 카드 항목 추가:

```markdown
### 쉬운 요약 카드 ("한눈에 보기")
- `web/easy-summary.ts` 결정적 템플릿 → pipeline이 "## 한 줄 요약" 앞 주입
- 신규 리포트에만 적용 (저장된 기존 md는 불변). 스펙: docs/superpowers/specs/2026-07-05-easy-summary-design.md
```

```bash
git add docs/handoff-2026-07-05-v1-live.md
git commit -m "docs: note easy-summary card in handoff

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

# 패널 스크리너 웹 노출 (플랜 2/2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플랜 1이 넣은 스크리너 코어(연령 범위 + 지역 한정)를 웹에서 실제로 쓸 수 있게 폼·검증·저장·API·OG까지 배선한다.

**Architecture:** 코어(`src/population/screen.ts`·`study.ts`·`report/*`)는 **무수정**. 이 플랜은 순수 배선이다 — 폼이 구조화 스크리너를 보내고, `validate.ts`가 census 라벨로 검증·확장해 `PanelScreener`를 만들고, DB `screener TEXT` 컬럼(가산적 마이그레이션)에 저장하고, 러너가 그것을 `runCensusStudy`로 태우며, 스크리너가 있을 때만 `panelLabel`을 붙이고, OG가 부제로 라벨을 표시한다.

**Tech Stack:** TypeScript(NodeNext), Next.js 15 App Router, node:sqlite / @libsql/client(Turso), vitest(`--pool=threads`), biome.

## Global Constraints

이 섹션의 모든 항목은 매 태스크의 요구사항에 암묵적으로 포함된다.

- **코어 무수정:** `src/population/screen.ts`(상수 1개 추가 예외 — 아래) · `src/study.ts` · `src/report/*` · `src/aggregate` · 게이트 수학(2표본 z·효과크기)은 **건드리지 않는다.**
- **없는 축 금지:** 스크리너 필드는 **연령·지역 둘뿐**. `ageMin`·`ageMax`·`region` 외 필드는 400으로 거부. 직업·소득·자녀·학력·산업은 존재하지 않는다.
- **스크리너 미지정이 기본이며, 그때 동작은 현재와 완전히 동일(바이트 동일)해야 한다.** 🔴 지뢰 1(아래).
- **정직성 신호 삭제 금지** · `## 전체 신호\n` · `## 기회 세그먼트\n` 헤더 문자열 보존 · `- 표본 …` / `· 응답 분포:` 불릿 형식 보존(og-stats 파서 소스, `· 대상:`은 **뒤에** 접미).
- **출처는 통계청 인구총조사 + Nemotron 둘뿐.** 비공개(파이썬 사업화) 자료 유입 금지 — 이 플랜 문서도 public에 push된다.
- **타입 변경은 옵셔널 추가만.**
- **게이트 4종(매 커밋 전은 아니되 각 태스크 종료 시):**
  `npx vitest run --pool=threads` (⚠️ `--pool=threads` 필수, 기본 forks는 샌드박스에서 죽는다) /
  `npx tsc --noEmit` / `npm run lint`(⚠️ 전체 출력, `tail -1` 금지) / `cd app && npx next build`.
- **테스트 카운트는 JSON 리포터로만 신뢰:**
  `npx vitest run --pool=threads --reporter=json --outputFile=scratch-v.json` 후
  `node -e "const r=require('./scratch-v.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"`.
  기준선(이 플랜 시작 시): **426 426 0 true**.

### 🔴 반드시 반영할 지뢰 둘 (플랜 1 최종 리뷰 발견)

1. **`screenerLabel()`은 스크리너 없을 때 `"전체 인구"`를 반환한다.** 파이프라인이
   `panelLabel: screenerLabel(screener)`를 **무조건** 넘기면 render.ts:142 `if(panelLabel)`가
   참이 되어 `> 이 리포트는 **전체 인구** 인구만 대상으로 합니다.`가 찍혀 **바이트 동일이 깨진다.**
   → **스크리너가 있을 때만** `options.panelLabel`을 세팅한다 (Task 4).
2. **`src/study.ts:101`이 빈 모집단에 bare `Error`를 던진다.** 그러나 study는 `after()`
   백그라운드에서 돌아 `executeReport`의 try/catch가 잡는다 → **500이 아니라 failed 리포트**가 된다.
   진짜 API-계층 위험은 **`store.create`가 route.ts에서 try/catch 밖(:51)**이라 마이그레이션·삽입이
   던지면 500이 나는 것. → 검증 계층이 잘못된 스크리너를 **400으로 먼저 거르고**(Task 2),
   빈 모집단은 valid census 입력으로는 도달 불가하되 도달 시 failed 리포트로 안전 처리(현행 유지).

---

## File Structure

- `src/population/screen.ts` — **수정(상수 1개 추가만).** `CENSUS_AGE_LABELS` 정본 순서 배열 export. 나머지 함수 무수정.
- `web/validate.ts` — **수정.** `parseScreener`로 구조화 스크리너 검증·범위 확장 → `PanelScreener`.
- `web/store.ts` — **수정.** `ReportRow.screener?` · SCHEMA에 `screener TEXT` · `MIGRATIONS` 상수 · `isDuplicateColumnError` · `create()` 저장 · `rowToReport` 파싱 · SqliteStore 마이그레이션 실행.
- `web/store-turso.ts` — **수정.** SCHEMA에 `screener TEXT` · 생성자에서 MIGRATIONS 실행(중복 컬럼 삼킴) · `create()` 저장.
- `web/jobs.ts` — **수정.** `ReportRunner` 시그니처에 옵셔널 `screener` 4번째 인자.
- `web/run-report.ts` — **수정.** `row.screener`를 러너에 전달.
- `web/pipeline.ts` — **수정.** 러너가 `screener` 받아 `runCensusStudy`로 태우고 **스크리너 있을 때만** `options.panelLabel`.
- `app/src/app/api/reports/route.ts` — **수정.** `input.screener`를 `store.create`에 저장.
- `app/src/app/r/[id]/opengraph-image.tsx` — **수정.** `row.screener` → `screenerLabel` 부제.
- `app/src/app/report-form.tsx` — **수정.** 연령 범위(select 2개) + 지역(select) 컨트롤, 스크리너 있을 때만 body에 포함.
- 테스트: `src/population/screen.test.ts` · `web/validate.test.ts` · `web/store.test.ts` · `web/store-turso.test.ts` · `web/run-report.test.ts` · `web/pipeline.test.ts`.

---

### Task 1: `CENSUS_AGE_LABELS` 정본 배열 + 드리프트 가드

검증 계층이 연령 범위를 실제 라벨 목록으로 펼치려면 census 라벨의 **정본 순서**가 필요하다. census 스냅샷(`data/census/kr-2024.json` `core.categories.연령`)이 진실 원천이지만 985KB라 검증 경로에 정적 import하기엔 무겁다. 작은 상수로 복제하되 **드리프트 테스트로 못박는다.**

**Files:**
- Modify: `src/population/screen.ts` (상수 1개 추가)
- Test: `src/population/screen.test.ts` (기존 파일에 테스트 추가)

**Interfaces:**
- Produces: `export const CENSUS_AGE_LABELS: readonly string[]` — 15개 라벨, `"15~19세"` … `"85세이상"` 순서. Task 2가 소비한다.

- [ ] **Step 1: 드리프트 테스트를 먼저 쓴다**

`src/population/screen.test.ts` 상단 import에 `CENSUS_AGE_LABELS`를 추가하고(기존 `screenerLabel` 등과 같은 줄), 파일 끝에 census 스냅샷 import와 테스트를 추가한다:

```ts
import census from "../../data/census/kr-2024.json" with { type: "json" };

describe("CENSUS_AGE_LABELS", () => {
  test("census 스냅샷의 연령 순서와 정확히 일치한다 (드리프트 가드)", () => {
    const fromSnapshot = (census as { core: { categories: { 연령: string[] } } })
      .core.categories.연령;
    expect(CENSUS_AGE_LABELS).toEqual(fromSnapshot);
  });

  test("15개 라벨, 15~19세로 시작해 85세이상으로 끝난다", () => {
    expect(CENSUS_AGE_LABELS).toHaveLength(15);
    expect(CENSUS_AGE_LABELS[0]).toBe("15~19세");
    expect(CENSUS_AGE_LABELS.at(-1)).toBe("85세이상");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --pool=threads src/population/screen.test.ts`
Expected: FAIL — `CENSUS_AGE_LABELS`가 export되지 않음.

- [ ] **Step 3: 상수를 추가한다**

`src/population/screen.ts`의 `PanelScreener` 인터페이스 바로 아래(정규식 `BAND` 위)에 추가:

```ts
/**
 * census 연령 라벨 정본 순서 (kr-2024 core.categories.연령).
 * 검증 계층이 범위를 라벨 목록으로 펼칠 때 쓴다. 스냅샷과의 드리프트는
 * screen.test.ts의 가드가 잡는다 (985KB 스냅샷을 검증 경로에 들이지 않기 위한 복제).
 */
export const CENSUS_AGE_LABELS: readonly string[] = [
  "15~19세",
  "20~24세",
  "25~29세",
  "30~34세",
  "35~39세",
  "40~44세",
  "45~49세",
  "50~54세",
  "55~59세",
  "60~64세",
  "65~69세",
  "70~74세",
  "75~79세",
  "80~84세",
  "85세이상",
];
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run --pool=threads src/population/screen.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/population/screen.ts src/population/screen.test.ts
git commit -m "feat(screen): census 연령 라벨 정본 배열 + 드리프트 가드"
```

---

### Task 2: `validate.ts` — 스크리너 검증 + 범위 확장

폼이 보내는 `{ageMin, ageMax, region}`을 검증해 코어가 소비하는 `PanelScreener`(`{연령?: string[], 지역?}`)로 바꾼다. 없는 축·잘못된 라벨·역순 범위는 400. 셋 다 없으면 `undefined`(= 스크리너 없음 = 현행).

**Files:**
- Modify: `web/validate.ts`
- Test: `web/validate.test.ts` (신규)

**Interfaces:**
- Consumes: `CENSUS_AGE_LABELS`, `type PanelScreener` from `../src/population/screen.js` (Task 1).
- Produces: `validateReportInput(body)` 반환 타입이 `{ question: string; choices: string[]; screener?: PanelScreener }`로 확장. Task 5가 `input.screener`를 소비한다.

- [ ] **Step 1: 실패 테스트를 먼저 쓴다**

`web/validate.test.ts` (신규):

```ts
import { describe, expect, test } from "vitest";
import { validateReportInput } from "./validate.js";

const base = { question: "월 9900원에 쓸 의향?", choices: ["쓴다", "안쓴다"] };

describe("validateReportInput — 스크리너", () => {
  test("스크리너 없으면 screener는 undefined (현행)", () => {
    expect(validateReportInput(base).screener).toBeUndefined();
  });

  test("빈 스크리너 객체도 undefined로 접힌다", () => {
    expect(validateReportInput({ ...base, screener: {} }).screener).toBeUndefined();
  });

  test("연령 범위를 census 라벨 목록으로 펼친다", () => {
    const { screener } = validateReportInput({
      ...base,
      screener: { ageMin: "20~24세", ageMax: "35~39세" },
    });
    expect(screener?.연령).toEqual([
      "20~24세",
      "25~29세",
      "30~34세",
      "35~39세",
    ]);
    expect(screener?.지역).toBeUndefined();
  });

  test("지역만 지정해도 된다", () => {
    const { screener } = validateReportInput({
      ...base,
      screener: { region: "수도권" },
    });
    expect(screener).toEqual({ 지역: "수도권" });
  });

  test("연령 + 지역 동시", () => {
    const { screener } = validateReportInput({
      ...base,
      screener: { ageMin: "30~34세", ageMax: "30~34세", region: "비수도권" },
    });
    expect(screener).toEqual({ 연령: ["30~34세"], 지역: "비수도권" });
  });

  test("잘못된 연령 라벨은 거부", () => {
    expect(() =>
      validateReportInput({ ...base, screener: { ageMin: "20대", ageMax: "30~34세" } }),
    ).toThrow(/연령 라벨/);
  });

  test("ageMin > ageMax는 거부", () => {
    expect(() =>
      validateReportInput({ ...base, screener: { ageMin: "40~44세", ageMax: "20~24세" } }),
    ).toThrow(/시작이 끝보다/);
  });

  test("연령 시작·끝 한쪽만 있으면 거부", () => {
    expect(() =>
      validateReportInput({ ...base, screener: { ageMin: "20~24세" } }),
    ).toThrow(/시작과 끝/);
  });

  test("없는 축(직업)은 거부", () => {
    expect(() =>
      validateReportInput({ ...base, screener: { 직업: "직장인" } }),
    ).toThrow(/없는 축/);
  });

  test("잘못된 지역 값은 거부", () => {
    expect(() =>
      validateReportInput({ ...base, screener: { region: "서울" } }),
    ).toThrow(/수도권/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --pool=threads web/validate.test.ts`
Expected: FAIL — `screener` 처리 없음(첫 테스트 통과, 나머지 대부분 실패/throw 미발생).

- [ ] **Step 3: `validate.ts`를 확장한다**

`web/validate.ts` 상단에 import 추가하고, `parseScreener`를 추가한 뒤 `validateReportInput` 반환에 `screener`를 포함한다:

```ts
import {
  CENSUS_AGE_LABELS,
  type PanelScreener,
} from "../src/population/screen.js";

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * 구조화 스크리너 검증 + census 라벨 범위 확장. 없는 축(직업·소득 등)·잘못된
 * 라벨·역순 범위는 던진다(API가 400으로 잡는다). 셋 다 없으면 undefined = 스크리너 없음.
 */
function parseScreener(raw: unknown): PanelScreener | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "object")
    throw new Error("스크리너 형식이 올바르지 않습니다.");
  const s = raw as Record<string, unknown>;
  const allowed = new Set(["ageMin", "ageMax", "region"]);
  for (const k of Object.keys(s)) {
    if (!allowed.has(k))
      throw new Error(`스크리너에 없는 축입니다: ${k} (연령·지역만 지원)`);
  }

  const out: PanelScreener = {};

  if (s.region != null && s.region !== "") {
    if (s.region !== "수도권" && s.region !== "비수도권")
      throw new Error("지역은 수도권 또는 비수도권이어야 합니다.");
    out.지역 = s.region;
  }

  const hasMin = s.ageMin != null && s.ageMin !== "";
  const hasMax = s.ageMax != null && s.ageMax !== "";
  if (hasMin !== hasMax)
    throw new Error("연령 범위는 시작과 끝을 모두 지정해야 합니다.");
  if (hasMin && hasMax) {
    const lo = CENSUS_AGE_LABELS.indexOf(String(s.ageMin));
    const hi = CENSUS_AGE_LABELS.indexOf(String(s.ageMax));
    if (lo < 0) throw new Error(`연령 라벨이 올바르지 않습니다: ${String(s.ageMin)}`);
    if (hi < 0) throw new Error(`연령 라벨이 올바르지 않습니다: ${String(s.ageMax)}`);
    if (lo > hi) throw new Error("연령 시작이 끝보다 큽니다.");
    out.연령 = CENSUS_AGE_LABELS.slice(lo, hi + 1);
  }

  return out.연령 == null && out.지역 == null ? undefined : out;
}

/** 웹 입력 검증 + XSS 이스케이프. Next API 라우트가 사용한다. */
export function validateReportInput(body: unknown): {
  question: string;
  choices: string[];
  screener?: PanelScreener;
} {
  const b = (body ?? {}) as {
    question?: unknown;
    choices?: unknown;
    screener?: unknown;
  };
  const question = typeof b.question === "string" ? b.question.trim() : "";
  if (!question) throw new Error("question이 필요합니다.");
  if (question.length > 200) throw new Error("질문은 200자 이내여야 합니다.");
  const choices = Array.isArray(b.choices)
    ? b.choices.map((c) => String(c).trim()).filter(Boolean)
    : [];
  if (choices.length < 2 || choices.length > 4)
    throw new Error("선택지는 2~4개여야 합니다.");
  if (choices.some((c) => c.length > 20))
    throw new Error("선택지는 각 20자 이내여야 합니다.");
  const screener = parseScreener(b.screener);
  return {
    question: escapeHtml(question),
    choices: choices.map(escapeHtml),
    ...(screener ? { screener } : {}),
  };
}
```

`out.지역 = s.region;`에서 TS가 `unknown`을 좁히지 못하면 `out.지역 = s.region as "수도권" | "비수도권";`로 캐스팅한다(위 두 리터럴 가드 직후라 안전).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run --pool=threads web/validate.test.ts`
Expected: PASS (전부).

- [ ] **Step 5: 타입·린트 확인 후 커밋**

```bash
npx tsc --noEmit
npm run lint
git add web/validate.ts web/validate.test.ts
git commit -m "feat(web): 구조화 스크리너 검증 + census 범위 확장 (없는 축 400)"
```

---

### Task 3: DB — `screener` 컬럼 + 가산적 마이그레이션

기존 리포트를 깨지 않고 `screener`를 저장한다. 새 테이블은 SCHEMA로, 기존 테이블은 `ALTER TABLE`로. SQLite에 `ADD COLUMN IF NOT EXISTS`가 없으므로 **중복 컬럼 에러를 삼켜** 재실행 안전성을 확보한다. 기존 리포트는 `screener = null` → 라벨 없이 지금과 동일 렌더.

**Files:**
- Modify: `web/store.ts`
- Modify: `web/store-turso.ts`
- Test: `web/store.test.ts` (테스트 추가) · `web/store-turso.test.ts` (테스트 추가)

**Interfaces:**
- Consumes: `type PanelScreener` from `../src/population/screen.js`.
- Produces:
  - `ReportRow.screener?: PanelScreener`
  - `create()` 인자에 `screener?: PanelScreener` 추가
  - `MIGRATIONS: readonly string[]` · `isDuplicateColumnError(e: unknown): boolean` — store.ts에서 export, store-turso.ts가 소비.

- [ ] **Step 1: 실패 테스트를 먼저 쓴다 (store.test.ts에 추가)**

`web/store.test.ts`의 `describe("SqliteStore …")` 안에 추가:

```ts
  test("screener를 저장·복원한다", async () => {
    const s = new SqliteStore(":memory:");
    await s.create({
      id: "scr",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-10T10:00:00Z",
      screener: { 연령: ["20~24세", "25~29세"], 지역: "수도권" },
    });
    const r = await s.get("scr");
    expect(r?.screener).toEqual({ 연령: ["20~24세", "25~29세"], 지역: "수도권" });
  });

  test("screener 없으면 undefined (기존 리포트 호환)", async () => {
    const s = new SqliteStore(":memory:");
    await s.create({
      id: "plain",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-10T10:00:00Z",
    });
    expect((await s.get("plain"))?.screener).toBeUndefined();
  });

  test("같은 파일 DB에 스토어를 두 번 열어도 마이그레이션이 재실행 안전하다", async () => {
    const path = `${process.env.TMPDIR ?? "/tmp"}/screener-migrate-${Date.now()}.db`;
    const a = new SqliteStore(path);
    await a.create({
      id: "m1",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-10T10:00:00Z",
      screener: { 지역: "비수도권" },
    });
    // 두 번째 오픈 — ALTER가 중복 컬럼으로 던져도 삼켜져야 한다(생성자 무예외).
    const b = new SqliteStore(path);
    expect((await b.get("m1"))?.screener).toEqual({ 지역: "비수도권" });
  });
```

> 참고: Windows 로컬에서 `/tmp` 대신 스크래치패드 경로가 필요하면 `path`를 os.tmpdir() 기반으로 바꿔도 되지만, vitest 샌드박스에서 `/tmp`가 동작하므로 위 형태 유지. `:memory:`는 재오픈 시 새 DB라 이 테스트에 부적합 — 파일 DB를 쓴다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --pool=threads web/store.test.ts`
Expected: FAIL — `create`가 `screener`를 모르고 `ReportRow.screener` 없음.

- [ ] **Step 3: `store.ts`를 수정한다**

(a) import + `ReportRow.screener`:

```ts
import type { DatabaseSync as DatabaseSyncT } from "node:sqlite";
import type { PanelScreener } from "../src/population/screen.js";
```

`ReportRow`에 추가(`phase?` 아래):

```ts
  phase?: string;
  /** 스크리너로 한정된 모집단 (연령 라벨 목록 + 지역). 없으면 전 인구. */
  screener?: PanelScreener;
```

(b) `ReportStore.create` 계약에 옵셔널 추가:

```ts
  create(r: {
    id: string;
    question: string;
    choices: string[];
    ipHash: string;
    createdAt: string;
    screener?: PanelScreener;
  }): Promise<void>;
```

(c) SCHEMA에 컬럼 추가(`phase TEXT` 다음, 새 테이블용):

```ts
const SCHEMA = `CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  choices TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  md TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  progress_done INTEGER,
  progress_total INTEGER,
  phase TEXT,
  screener TEXT
)`;

/** 기존 테이블용 가산적 마이그레이션. 첫 요청 시 실행, 재실행 안전(중복 컬럼 삼킴). */
export const MIGRATIONS: readonly string[] = [
  "ALTER TABLE reports ADD COLUMN screener TEXT",
];

/** SQLite/libSQL의 "이미 존재하는 컬럼" 에러 판별 — 마이그레이션 재실행 안전용. */
export function isDuplicateColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /duplicate column name/i.test(msg);
}
```

(d) `rowToReport`에 파싱 추가(`phase` 다음):

```ts
    phase: row.phase == null ? undefined : String(row.phase),
    screener:
      row.screener == null
        ? undefined
        : (JSON.parse(String(row.screener)) as PanelScreener),
```

(e) SqliteStore 생성자에서 마이그레이션 실행(INDEX 다음):

```ts
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_reports_ip_day ON reports(ip_hash, created_at)",
    );
    for (const sql of MIGRATIONS) {
      try {
        this.db.exec(sql);
      } catch (e) {
        if (!isDuplicateColumnError(e)) throw e;
      }
    }
```

(f) `create`가 저장:

```ts
  async create(r: {
    id: string;
    question: string;
    choices: string[];
    ipHash: string;
    createdAt: string;
    screener?: PanelScreener;
  }): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO reports (id, question, choices, status, created_at, ip_hash, screener) VALUES (?, ?, ?, 'queued', ?, ?, ?)",
      )
      .run(
        r.id,
        r.question,
        JSON.stringify(r.choices),
        r.createdAt,
        r.ipHash,
        r.screener ? JSON.stringify(r.screener) : null,
      );
  }
```

- [ ] **Step 4: store.test.ts 통과 확인**

Run: `npx vitest run --pool=threads web/store.test.ts`
Expected: PASS.

- [ ] **Step 5: store-turso.test.ts에 실패 테스트 추가**

`web/store-turso.test.ts`에 추가(기존 `describe` 안 또는 새 test):

```ts
  test("screener를 저장·복원한다 (Turso 인메모리)", async () => {
    const s = new TursoStore({ url: ":memory:" });
    await s.create({
      id: "t1",
      question: "q?",
      choices: ["A", "B"],
      ipHash: "h1",
      createdAt: "2026-07-10T10:00:00Z",
      screener: { 연령: ["20~24세"], 지역: "수도권" },
    });
    expect((await s.get("t1"))?.screener).toEqual({
      연령: ["20~24세"],
      지역: "수도권",
    });
  });
```

> `TursoStore`의 import가 파일에 없으면 `import { TursoStore } from "./store-turso.js";` 추가.

- [ ] **Step 6: 테스트가 실패하는지 확인**

Run: `npx vitest run --pool=threads web/store-turso.test.ts`
Expected: FAIL — `screener` 미저장.

- [ ] **Step 7: `store-turso.ts`를 수정한다**

(a) import(SCHEMA는 자체 정의라 store.ts에서 MIGRATIONS·isDuplicateColumnError·타입을 가져온다):

```ts
import { type Client, createClient } from "@libsql/client";
import type { PanelScreener } from "../src/population/screen.js";
import {
  MIGRATIONS,
  type ReportRow,
  type ReportStatus,
  type ReportStore,
  isDuplicateColumnError,
  rowToReport,
} from "./store.js";
```

(b) SCHEMA에 `screener TEXT` 추가(store.ts와 동일하게 `phase TEXT,` 다음 `screener TEXT`).

(c) 생성자 `ready` 체인에 마이그레이션 추가:

```ts
    this.ready = this.client
      .execute(SCHEMA)
      .then(() =>
        this.client.execute(
          "CREATE INDEX IF NOT EXISTS idx_reports_ip_day ON reports(ip_hash, created_at)",
        ),
      )
      .then(async () => {
        for (const sql of MIGRATIONS) {
          try {
            await this.client.execute(sql);
          } catch (e) {
            if (!isDuplicateColumnError(e)) throw e;
          }
        }
      });
```

(d) `create`가 저장(store.ts와 동형):

```ts
  async create(r: {
    id: string;
    question: string;
    choices: string[];
    ipHash: string;
    createdAt: string;
    screener?: PanelScreener;
  }): Promise<void> {
    await this.exec(
      "INSERT INTO reports (id, question, choices, status, created_at, ip_hash, screener) VALUES (?, ?, ?, 'queued', ?, ?, ?)",
      [
        r.id,
        r.question,
        JSON.stringify(r.choices),
        r.createdAt,
        r.ipHash,
        r.screener ? JSON.stringify(r.screener) : null,
      ],
    );
  }
```

> ⚠️ `exec`의 args 타입이 `(string | number)[]`인데 `null`을 넣는다. libSQL은 null 바인딩을 허용하므로 `exec` 시그니처를 `(string | number | null)[]`로 넓힌다(옵셔널 확장, 다른 호출부 무영향).

- [ ] **Step 8: store-turso.test.ts 통과 확인**

Run: `npx vitest run --pool=threads web/store-turso.test.ts`
Expected: PASS.

- [ ] **Step 9: 타입·린트 확인 후 커밋**

```bash
npx tsc --noEmit
npm run lint
git add web/store.ts web/store-turso.ts web/store.test.ts web/store-turso.test.ts
git commit -m "feat(web): reports.screener 컬럼 + 가산적 마이그레이션(재실행 안전)"
```

---

### Task 4: 러너 배선 — screener를 study로 태우고 라벨은 있을 때만

`screener`를 `row`에서 러너까지 흘려 `runCensusStudy`로 태운다. **🔴 지뢰 1:** 스크리너가 있을 때만 `options.panelLabel`을 세팅한다(없으면 render가 바이트 동일).

**Files:**
- Modify: `web/jobs.ts` (`ReportRunner` 시그니처)
- Modify: `web/run-report.ts` (`row.screener` 전달)
- Modify: `web/pipeline.ts` (screener → study + 조건부 panelLabel)
- Test: `web/pipeline.test.ts` (테스트 추가) · `web/run-report.test.ts` (fake 러너 시그니처 확인)

**Interfaces:**
- Consumes: `type PanelScreener` from `../src/population/screen.js`; `screenerLabel` from same.
- Produces: `ReportRunner = (question, choices, onProgress, screener?: PanelScreener) => Promise<string>`.

- [ ] **Step 1: 실패 테스트를 먼저 쓴다 (pipeline.test.ts에 추가)**

`web/pipeline.test.ts`에 추가:

```ts
  test("스크리너 없으면 모집단 고지가 없다 (바이트 동일 방향)", async () => {
    const provider = new MockProvider(() => "쓴다");
    const runner = makeReportRunner(provider, { n: 10, repeats: 1, concurrency: 1 });
    const md = await runner("질문?", ["쓴다", "안쓴다"], () => {});
    expect(md).not.toContain("인구만 대상으로 합니다");
    expect(md).not.toContain("· 대상:");
  });

  test("스크리너가 있으면 모집단 고지 + 대상 접미 + 순환논증 경고", async () => {
    const provider = new MockProvider(() => "쓴다");
    const runner = makeReportRunner(provider, { n: 20, repeats: 1, concurrency: 1 });
    const md = await runner(
      "질문?",
      ["쓴다", "안쓴다"],
      () => {},
      { 연령: ["20~24세", "25~29세", "30~34세", "35~39세"], 지역: "수도권" },
    );
    expect(md).toContain("이 리포트는 **20~39세 · 수도권** 인구만 대상으로 합니다");
    expect(md).toContain("· 대상: 20~39세 · 수도권");
    expect(md).toContain("한정됐습니다"); // SCREENER_CIRCULAR_WARNING 일부
  });
```

> 두 번째 테스트는 스크리너가 수도권으로 지역을 고정하므로 `constantDims`에 지역이 걸려 세그먼트에서 빠질 수 있다 — md에 `_비교에서 제외된 축: 지역` 문구가 날 수 있으나 단언 대상 아님(코어는 플랜 1에서 검증됨). n=20으로 두어 빈 표본 위험을 피한다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run --pool=threads web/pipeline.test.ts`
Expected: FAIL — 러너가 4번째 인자를 무시, 두 번째 테스트 실패.

- [ ] **Step 3: `jobs.ts` `ReportRunner` 시그니처 확장**

```ts
import type { PanelScreener } from "../src/population/screen.js";
import { executeReport } from "./run-report.js";
import type { ReportStore } from "./store.js";

/** 리포트 1건 생성 러너 — 실제 구현은 pipeline.ts, 테스트는 fake 주입. */
export type ReportRunner = (
  question: string,
  choices: string[],
  onProgress: (done: number, total: number, phase: string) => void,
  screener?: PanelScreener,
) => Promise<string>;
```

- [ ] **Step 4: `run-report.ts`가 `row.screener`를 전달**

`runner(row.question, row.choices, cb)` 호출을 다음으로 바꾼다:

```ts
    const md = await runner(
      row.question,
      row.choices,
      (d, t, phase) => {
        onEvent?.({ type: "progress", done: d, total: t, phase });
        if (d % 5 === 0 || d === t) {
          void store.setProgress(id, d, t, phase);
        }
      },
      row.screener,
    );
```

- [ ] **Step 5: `pipeline.ts`가 screener를 study로 태우고 조건부 라벨**

(a) import 추가:

```ts
import { type PanelScreener, screenerLabel } from "../src/population/screen.js";
```

(b) 러너 클로저 시그니처에 `screener` 추가:

```ts
  return async (question, choices, onProgress, screener?: PanelScreener) => {
```

(c) `runCensusStudy({...})` 호출에 `screener` 추가(`narrativePool` 다음):

```ts
      narrativePool,
      screener,
      simulate: {
```

(d) `options` 객체에 **조건부** panelLabel. 현행:

```ts
    const options = {
      question,
      choices,
      run: {
        n: result.responses.length,
        seed,
        provider: "web",
        narrative: narrativeOn,
      },
    };
```

를 다음으로:

```ts
    const options = {
      question,
      choices,
      run: {
        n: result.responses.length,
        seed,
        provider: "web",
        narrative: narrativeOn,
      },
      // 🔴 스크리너가 있을 때만 panelLabel — screenerLabel(undefined)="전체 인구"를
      // 무조건 넘기면 render가 모집단 고지를 찍어 바이트 동일이 깨진다.
      ...(screener ? { panelLabel: screenerLabel(screener) } : {}),
    };
```

- [ ] **Step 6: pipeline.test.ts 통과 확인**

Run: `npx vitest run --pool=threads web/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 7: run-report.test.ts가 여전히 통과하는지 확인**

기존 fake 러너는 3인자를 받으므로 4번째 옵셔널 추가에 영향 없음. 확인만:

Run: `npx vitest run --pool=threads web/run-report.test.ts`
Expected: PASS.

- [ ] **Step 8: 게이트 확인 후 커밋**

```bash
npx tsc --noEmit
npm run lint
git add web/jobs.ts web/run-report.ts web/pipeline.ts web/pipeline.test.ts
git commit -m "feat(web): 러너가 스크리너를 study로 태우고 라벨은 있을 때만 (바이트 동일 보존)"
```

---

### Task 5: API 라우트 — 스크리너 저장

검증된 `input.screener`를 `store.create`에 넘긴다. 검증 실패는 이미 400(기존 try/catch). `store.create`가 던지면 500이 나던 자리라, 스크리너 저장이 예외를 늘리지 않는지 확인한다(가산적 컬럼·nullable이라 안전).

**Files:**
- Modify: `app/src/app/api/reports/route.ts`

**Interfaces:**
- Consumes: `validateReportInput` 반환의 `screener?: PanelScreener`; `store.create({..., screener})` (Task 3).

- [ ] **Step 1: `input` 타입과 `store.create` 호출 수정**

`route.ts`에서 `input` 선언 타입에 screener 추가:

```ts
  let input: {
    question: string;
    choices: string[];
    screener?: import("../../../../../src/population/screen.js").PanelScreener;
  };
```

> 인라인 `import(...)` 타입 대신 상단에 `import type { PanelScreener } from "../../../../../src/population/screen.js";`를 두고 `screener?: PanelScreener`로 써도 된다(권장). 경로 깊이 5단계는 기존 `../../../../../web/*` 와 동일.

`store.create` 호출에 screener 전달:

```ts
  await store.create({
    id,
    question: input.question,
    choices: input.choices,
    ipHash,
    createdAt: new Date().toISOString(),
    ...(input.screener ? { screener: input.screener } : {}),
  });
```

- [ ] **Step 2: 타입·빌드 확인**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `cd app && npx next build`
Expected: PASS (라우트 컴파일).

- [ ] **Step 3: 커밋**

```bash
git add app/src/app/api/reports/route.ts
git commit -m "feat(api): 검증된 스크리너를 리포트에 저장"
```

---

### Task 6: OG 이미지 부제 — 스크리너 라벨

`row.screener`가 있으면 OG 이미지 마스트헤드에 `20~39세 · 수도권` 부제를 실어 공유 카드가 한정된 모집단을 밝힌다. 없으면 현행과 동일.

**Files:**
- Modify: `app/src/app/r/[id]/opengraph-image.tsx`

**Interfaces:**
- Consumes: `screenerLabel` from `../../../../../src/population/screen.js`; `row.screener`.

- [ ] **Step 1: import + 라벨 계산**

상단 import 추가:

```ts
import { screenerLabel } from "../../../../../src/population/screen.js";
```

`const stats = …` 다음에:

```ts
  const panelLabel = row?.screener ? screenerLabel(row.screener) : undefined;
```

- [ ] **Step 2: 폰트 글리프에 라벨 포함**

`const glyphs = [...]` 계산에서 소스 문자열에 `panelLabel`을 더한다:

```ts
  const glyphs = [
    ...new Set(
      (
        question +
        fixed +
        (panelLabel ?? "") +
        (bar ? bar.posLabel + bar.negLabel : "")
      ).split(""),
    ),
  ].join("");
```

- [ ] **Step 3: 마스트헤드에 부제 렌더**

마스트헤드 블록의 우측 `0차 시장검증 리포트` div를 라벨이 있으면 두 줄로 바꾼다. 현행:

```tsx
        <div style={{ fontSize: 20, fontWeight: 400, color: INK_MUTED }}>
          0차 시장검증 리포트
        </div>
```

를:

```tsx
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            fontSize: 20,
            fontWeight: 400,
            color: INK_MUTED,
          }}
        >
          <div style={{ display: "flex" }}>0차 시장검증 리포트</div>
          {panelLabel ? (
            <div style={{ display: "flex", fontSize: 16 }}>
              대상: {panelLabel}
            </div>
          ) : null}
        </div>
```

> satori(next/og)는 다중 자식 flex 컨테이너에 `display:flex`를 요구한다 — 위 형태 준수.

- [ ] **Step 4: 빌드 확인**

Run: `cd app && npx next build`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add app/src/app/r/[id]/opengraph-image.tsx
git commit -m "feat(og): 스크리너 라벨을 OG 부제로 표시"
```

---

### Task 7: 폼 컨트롤 — 연령 범위 + 지역

폼에 선택적 스크리너 컨트롤을 넣는다. 기본은 "전체" → body에 screener 미포함 → 현행 UX. 사용자가 고르면 `{ageMin, ageMax, region}`을 보낸다.

**Files:**
- Modify: `app/src/app/report-form.tsx`

**Interfaces:**
- Consumes: `CENSUS_AGE_LABELS` from `../../../src/population/screen.js` (클라이언트 번들 — screen.ts는 타입만 import해 가볍다).

- [ ] **Step 1: 상수 import + 상태 추가**

상단:

```ts
import { CENSUS_AGE_LABELS } from "../../../src/population/screen.js";
```

컴포넌트 상태에 추가(`const [error, …]` 다음):

```ts
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [region, setRegion] = useState("");
```

- [ ] **Step 2: body에 스크리너 조립(있을 때만)**

`submit`의 `body: JSON.stringify({...})`를 다음으로:

```ts
    const screener: Record<string, string> = {};
    if (ageMin && ageMax) {
      screener.ageMin = ageMin;
      screener.ageMax = ageMax;
    }
    if (region) screener.region = region;
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: question.trim(),
        choices: choices
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        ...(Object.keys(screener).length > 0 ? { screener } : {}),
      }),
    });
```

- [ ] **Step 3: 컨트롤 UI 추가**

선택지 `<label>` 다음, `<button>` 앞에 접이식/선택 컨트롤 추가:

```tsx
        <fieldset className="field screener">
          <legend>패널 한정 (선택 — 비우면 전 인구)</legend>
          <div className="screener-row">
            <label>
              <span>연령 시작</span>
              <select value={ageMin} onChange={(e) => setAgeMin(e.target.value)}>
                <option value="">전체</option>
                {CENSUS_AGE_LABELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>연령 끝</span>
              <select value={ageMax} onChange={(e) => setAgeMax(e.target.value)}>
                <option value="">전체</option>
                {CENSUS_AGE_LABELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>지역</span>
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">전체</option>
                <option value="수도권">수도권</option>
                <option value="비수도권">비수도권</option>
              </select>
            </label>
          </div>
          <p className="hint">
            ⚠️ 있는 축은 연령·지역뿐입니다. 직업·소득·자녀로는 거를 수 없습니다.
          </p>
        </fieldset>
```

> 스타일은 기존 `globals.css`의 `.field`·`.hint` 관례를 따른다. 필요하면 `.screener-row { display: flex; gap: … }`를 globals.css에 추가(스코프 밖이면 생략 가능 — 기능 우선).

- [ ] **Step 4: 빌드 확인**

Run: `cd app && npx next build`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add app/src/app/report-form.tsx
git commit -m "feat(web): 폼에 연령 범위·지역 스크리너 컨트롤"
```

---

### Task 8: 통합 게이트 + 실물 렌더 확인

전체 게이트 4종을 돌리고, **실물 렌더를 눈으로 본다**(이 프로젝트 결함 다수가 테스트 그린 상태에서 실물에만 보였다). 배포는 별도 승인이다(아래 배포 주의).

**Files:** 없음(검증 전용).

- [ ] **Step 1: 전체 게이트**

```bash
npx tsc --noEmit
npm run lint
npx vitest run --pool=threads --reporter=json --outputFile=scratch-v.json >/dev/null 2>&1
node -e "const r=require('./scratch-v.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"
rm -f scratch-v.json
cd app && npx next build
```
Expected: tsc 0 · lint 0 errors · vitest `success=true`(신규 테스트만큼 증가한 총계) · build PASS.

- [ ] **Step 2: 실물 렌더 — 스크리너 없는 경로가 바이트 동일인지 확인**

```bash
npm run build && npm run report:demo
```
데모 리포트가 모집단 고지·`· 대상:` 없이 종전과 동일한지 확인(데모는 스크리너 미지정). 플랜 1 기준선 20084 bytes 근처면 회귀 없음.

- [ ] **Step 3: 로컬 폼 스모크(선택)**

로컬 dev로 폼에서 연령 20~39세·수도권을 골라 리포트를 만들고, `/r/[id]`에 모집단 고지·순환논증 경고·`대상:` 접미가 뜨는지, OG(`/r/[id]/opengraph-image`)에 부제가 뜨는지 눈으로 확인. 스크리너 없이 만든 리포트가 종전과 동일한지도 확인.

- [ ] **Step 4: 사용자 승인 게이트 → 배포**

push·배포는 **사용자 승인 후에만**. 배포 후 라이브 스모크(아래).

---

## 배포 주의 (별도 승인 · 별도 확인)

- **마이그레이션은 프로덕션 Turso 테이블에 `ALTER TABLE`을 친다** — 첫 요청 시 실행. 가산적·nullable이라 롤백 없이 안전하고, 중복 컬럼 에러를 삼켜 재실행 안전.
- **배포 후 반드시 확인:**
  1. 기존 리포트(`/r/2khi1bDwJ4`·`/r/Dr1edtksE6`·`/r/RZrj0gVdVU`)가 정상 렌더 — `screener=null`이라 라벨 없이 종전과 동일해야 한다.
  2. 스크리너 없는 신규 리포트가 기존과 동일하게 나온다.
  3. 스크리너(20~39세·수도권) 신규 리포트가 모집단 고지·순환논증 경고·OG 부제를 표시한다.
- 개편은 **저장된 md에 소급 안 됨**(`web/store.ts` md TEXT). 신규 생성으로만 확인.

## Self-Review (작성자 체크리스트 — 완료)

- **스펙 커버리지:** §1 screen.ts(플랜 1 완료, 상수만 추가=Task 1) · §2 필터(플랜 1) · §3 상수 축(플랜 1) · §4 모집단 표기(render 플랜 1, OG=Task 6, 카드 플랜 1) · §5 순환논증(플랜 1, 파이프라인 배선=Task 4) · §6 DB=Task 3 · §7 validate=Task 2 · 폼=Task 7 · API=Task 5. 전부 태스크 있음.
- **지뢰 둘:** 지뢰 1=Task 4 Step 5(조건부 panelLabel) · 지뢰 2=Task 2(400 선거름)+Task 5(store.create 안전) 반영.
- **플레이스홀더 스캔:** 각 코드 스텝에 실제 코드. "적절히"·"TODO" 없음.
- **타입 일관성:** `PanelScreener`(코어 정의) · `ReportRow.screener?` · `create({screener?})` · `ReportRunner(…, screener?)` · `CENSUS_AGE_LABELS: readonly string[]` — 전 태스크에서 동일 이름·시그니처.

# 패널 스크리너 — 코어 + 리포트 표기 Implementation Plan (플랜 1/2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 합성 패널을 연령 범위·지역으로 한정할 수 있게 하고, 한정된 사실을 리포트가 정직하게 말하게 한다.

**Architecture:** 표집 **직전**에 페르소나 배열을 거른다 — `sampleForSimulation`이 총 가중치를 인자에서 재계산하므로 인구 가중치 재정규화가 공짜다(새 수학 없음). 값이 하나만 남은 축은 여집합이 비어 비교가 불가능하므로 세그먼트 버킷을 만들지 않는다. 모집단이 바뀐 사실은 `FounderReportOptions.panelLabel`을 통해 본문과 카드에 실린다.

**Tech Stack:** TypeScript (ESM, `.js` 확장자 import), vitest, biome.

**범위:** 이 플랜은 **DB·API·폼·OG를 건드리지 않는다.** 웹 노출과 `ALTER TABLE` 마이그레이션은 플랜 2다.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-08-panel-screener-design.md`
- **없는 축을 제공하지 않는다.** 축은 `성 · 연령 · 지역 · 혼인 · 가구원수` 다섯뿐. 직업·소득·자녀·도심 여부는 없다. 이번 범위는 **연령 범위 + 지역**.
- **게이트 수학 무수정** — `twoProportionZ` · `GATE_MIN_EFFECT` · `GATE_Z` · `src/aggregate`.
- **정직성 신호 0개 삭제.**
- **`## 전체 신호\n` · `## 기회 세그먼트\n` 헤더 문자열 보존** (`web/pipeline.ts:125`가 `md.replace`로 차트를 주입한다).
- **`- ${signalLabel} · 응답 분포: ${dist}` 불릿 형식 보존** (`web/og-stats.ts` 파서 소스).
- **스크리너 미지정이 기본이며, 그때 렌더 결과는 변경 전과 바이트 동일해야 한다.** Task 6이 실측 대조한다.
- 타입 변경은 **옵셔널 필드 두 개 추가뿐**: `FounderReportOptions.panelLabel?: string` (Task 4) · `ReportAppendix.skippedDims?: string[]` (Task 3). `FounderInsightReport`의 기존 필드는 무수정 (`narrative?`·`panelSize?`·`panelPositive?`·`reliabilityCardRaw?`와 같은 승인된 가산적 패턴).
- **조용한 소실 금지** — `generate.test.ts:103`에 이름 붙은 기존 원칙이다. 관측된 축이 리포트에서 흔적 없이 사라지면 안 된다. 값이 하나뿐인 축은 버킷을 만들지 않되(하지 않은 비교를 주장하지 않기 위해) 제외했다는 사실은 렌더가 밝힌다.
- 비용 회당 ≈ $0.04 유지 (`n = 60`, `repeats = 3`).

## 환경 함정 (전 태스크 공통)

- **vitest는 `--pool=threads` 필수.** 기본 forks 풀이 이 샌드박스에서 죽는다.
- **터미널 요약 줄을 믿지 마라.** teardown segfault가 통과 후 요약을 자른다. 카운트는 JSON 리포터로 센다:
  ```bash
  npx vitest run --pool=threads --reporter=json --outputFile=/tmp/vitest.json >/dev/null 2>&1
  node -e "const r=require('/tmp/vitest.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"
  ```
- **`npm run lint 2>&1 | tail -1` 금지** — 에러가 위쪽에 뜨는데 푸터만 보인다.
- Bash 도구는 Git Bash. 경로에 한글·공백이 있으니 인용할 것.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/population/screen.ts` | 스크리너 순수 함수 (필터·라벨·상수 축) | Task 1 신규 |
| `src/population/screen.test.ts` | 위 회귀 | Task 1 신규 |
| `src/study.ts` | 표집 직전 필터 | Task 2 |
| `src/report/segments.ts` | 상수 축 버킷 제외 | Task 3 |
| `src/report/types.ts` | `panelLabel?` 옵셔널 추가 | Task 4 |
| `src/report/render.ts` | 상단 고지 · 순환논증 경고 · 전체 신호 접미 | Task 4 |
| `web/easy-summary.ts` | 카드에 모집단 명시 | Task 5 |

**⚠️ 픽스처 주의.** Task 3 이후 **값이 하나뿐인 축은 세그먼트에 나타나지 않는다.** 기존 테스트 픽스처 중 단일값 축을 쓰는 것이 있으면 깨진다. 확인된 바로 `src/report/segments.test.ts:172-175`는 `지역: "A"`·`"B"` 두 값이라 안전하다. 다른 곳이 깨지면 **먼저 읽고 원인을 보고할 것** — 단언을 조용히 느슨하게 만들지 말 것.

---

### Task 1: `screen.ts` — 스크리너 순수 함수 + 기준선 확보

**Files:**
- Create: `src/population/screen.ts`
- Create: `src/population/screen.test.ts`

**Interfaces:**
- Consumes: `Persona` (`src/types.ts:24` — `{ id, attrs: Record<string,string>, weight, … }`)
- Produces:
  - `export interface PanelScreener { 연령?: string[]; 지역?: "수도권" | "비수도권" }`
  - `export function screenPersonas(all: Persona[], s?: PanelScreener): Persona[]`
  - `export function screenerLabel(s?: PanelScreener): string`
  - `export function ageRangeLabel(labels: string[]): string`
  - `export function constantDims(personas: Persona[]): string[]`

Task 2가 `screenPersonas`·`PanelScreener`, Task 3이 `constantDims`, Task 4가 `screenerLabel`을 쓴다.

- [ ] **Step 1: 변경 전 기준선을 뜬다 (되돌릴 수 없으니 지금)**

이 플랜의 핵심 회귀는 "스크리너 없으면 렌더 결과가 바이트 동일"이다. 비교 대상을 **코드를 바꾸기 전에** 확보한다.

```bash
npm run build
npm run report:demo > /tmp/baseline-demo.md
wc -c /tmp/baseline-demo.md
```

Expected: 바이트 수가 출력된다. 이 파일을 Task 6까지 지우지 말 것.

- [ ] **Step 2: Write the failing test**

`src/population/screen.test.ts` 신규:

```ts
import { describe, expect, it } from "vitest";
import type { Persona } from "../types.js";
import {
  ageRangeLabel,
  constantDims,
  screenPersonas,
  screenerLabel,
} from "./screen.js";

const p = (attrs: Record<string, string>, id = "x"): Persona => ({
  id,
  attrs,
  weight: 1,
});

describe("ageRangeLabel", () => {
  it("연속 구간은 시작~끝으로 압축한다", () => {
    expect(ageRangeLabel(["20~24세", "25~29세", "30~34세", "35~39세"])).toBe(
      "20~39세",
    );
  });
  it("한 구간이면 그대로 둔다", () => {
    expect(ageRangeLabel(["30~34세"])).toBe("30~34세");
  });
  it("마지막이 개방 구간이면 '이상'으로 쓴다", () => {
    expect(ageRangeLabel(["20~24세", "85세이상"])).toBe("20세 이상");
  });
  it("빈 목록은 빈 문자열", () => {
    expect(ageRangeLabel([])).toBe("");
  });
  it("형식을 모르면 지어내지 않고 원문을 잇는다", () => {
    expect(ageRangeLabel(["청년", "장년"])).toBe("청년~장년");
  });
});

describe("screenerLabel", () => {
  it("미지정이면 전체 인구", () => {
    expect(screenerLabel()).toBe("전체 인구");
    expect(screenerLabel({})).toBe("전체 인구");
    expect(screenerLabel({ 연령: [] })).toBe("전체 인구");
  });
  it("연령만", () => {
    expect(screenerLabel({ 연령: ["20~24세", "35~39세"] })).toBe("20~39세");
  });
  it("지역만", () => {
    expect(screenerLabel({ 지역: "수도권" })).toBe("수도권");
  });
  it("둘 다면 가운뎃점으로 잇는다", () => {
    expect(screenerLabel({ 연령: ["20~24세", "35~39세"], 지역: "수도권" })).toBe(
      "20~39세 · 수도권",
    );
  });
});

describe("screenPersonas", () => {
  const all = [
    p({ 연령: "20~24세", 지역: "수도권" }, "a"),
    p({ 연령: "30~34세", 지역: "비수도권" }, "b"),
    p({ 연령: "70~74세", 지역: "수도권" }, "c"),
  ];

  it("미지정이면 입력을 그대로 돌려준다 (동일 참조)", () => {
    expect(screenPersonas(all)).toBe(all);
    expect(screenPersonas(all, {})).toBe(all);
  });
  it("연령 목록으로 거른다", () => {
    expect(screenPersonas(all, { 연령: ["20~24세", "30~34세"] }).map((x) => x.id))
      .toEqual(["a", "b"]);
  });
  it("지역으로 거른다", () => {
    expect(screenPersonas(all, { 지역: "수도권" }).map((x) => x.id)).toEqual([
      "a",
      "c",
    ]);
  });
  it("둘 다면 교집합", () => {
    expect(
      screenPersonas(all, { 연령: ["20~24세", "70~74세"], 지역: "비수도권" }),
    ).toEqual([]);
  });
});

describe("constantDims", () => {
  it("값이 하나뿐인 축만 돌려준다", () => {
    const sample = [
      p({ 연령: "20~24세", 지역: "수도권" }),
      p({ 연령: "30~34세", 지역: "수도권" }),
    ];
    expect(constantDims(sample).sort()).toEqual(["지역"]);
  });
  it("모든 축이 갈리면 빈 배열", () => {
    const sample = [
      p({ 연령: "20~24세", 지역: "수도권" }),
      p({ 연령: "30~34세", 지역: "비수도권" }),
    ];
    expect(constantDims(sample)).toEqual([]);
  });
  it("페르소나가 없으면 빈 배열", () => {
    expect(constantDims([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/population/screen.test.ts`
Expected: FAIL — `Cannot find module './screen.js'`.

- [ ] **Step 4: Write minimal implementation**

`src/population/screen.ts` 신규:

```ts
import type { Persona } from "../types.js";

/**
 * 합성 패널을 타깃 집단으로 한정한다.
 *
 * ⚠️ 있는 축만 담는다. 이 도구의 축은 성·연령·지역·혼인·가구원수 다섯뿐이며,
 * 직업·소득·자녀·도심 여부는 존재하지 않는다. 없는 축으로 거른 척하면
 * "부풀리기"가 된다.
 */
export interface PanelScreener {
  /** 허용 연령 라벨 목록 (census 라벨: "20~24세" … "85세이상") */
  연령?: string[];
  지역?: "수도권" | "비수도권";
}

const BAND = /^(\d+)~(\d+)세$/;
const OPEN_ENDED = /^(\d+)세이상$/;

/** 연령 라벨 목록 → 사람이 읽는 범위. 형식을 모르면 지어내지 않고 원문을 잇는다. */
export function ageRangeLabel(labels: string[]): string {
  if (labels.length === 0) return "";
  const first = labels[0];
  if (labels.length === 1) return first;
  const last = labels[labels.length - 1];
  const lo = BAND.exec(first)?.[1] ?? OPEN_ENDED.exec(first)?.[1];
  if (!lo) return `${first}~${last}`;
  if (OPEN_ENDED.test(last)) return `${lo}세 이상`;
  const hi = BAND.exec(last)?.[2];
  return hi ? `${lo}~${hi}세` : `${first}~${last}`;
}

/** 리포트가 말하는 모집단의 이름. 스크리너가 없으면 "전체 인구". */
export function screenerLabel(s?: PanelScreener): string {
  const parts: string[] = [];
  if (s?.연령 && s.연령.length > 0) parts.push(ageRangeLabel(s.연령));
  if (s?.지역) parts.push(s.지역);
  return parts.length > 0 ? parts.join(" · ") : "전체 인구";
}

/**
 * 표집 직전에 모집단을 거른다. 가중치는 건드리지 않는다 —
 * sampleForSimulation이 총 가중치를 인자에서 재계산하므로 재정규화는 공짜다.
 */
export function screenPersonas(
  all: Persona[],
  s?: PanelScreener,
): Persona[] {
  const hasAge = !!s?.연령 && s.연령.length > 0;
  if (!s || (!hasAge && !s.지역)) return all;
  const ages = hasAge ? new Set(s.연령) : undefined;
  return all.filter(
    (p) =>
      (!ages || ages.has(p.attrs.연령)) && (!s.지역 || p.attrs.지역 === s.지역),
  );
}

/**
 * 값이 하나뿐인 축. 그런 축은 여집합이 비어(restN=0) 비교 자체가 불가능하다 —
 * "차이가 작다"고 말할 근거가 없으므로 세그먼트에서 제외해야 한다.
 */
export function constantDims(personas: Persona[]): string[] {
  const seen = new Map<string, Set<string>>();
  for (const p of personas) {
    for (const [dim, value] of Object.entries(p.attrs)) {
      let vals = seen.get(dim);
      if (!vals) {
        vals = new Set();
        seen.set(dim, vals);
      }
      vals.add(value);
    }
  }
  return [...seen]
    .filter(([, vals]) => vals.size <= 1)
    .map(([dim]) => dim);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --pool=threads src/population/screen.test.ts`
Expected: PASS (15건).

- [ ] **Step 6: Full suite + gates**

```bash
npx vitest run --pool=threads --reporter=json --outputFile=/tmp/vitest.json >/dev/null 2>&1
node -e "const r=require('/tmp/vitest.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"
npx tsc --noEmit
npm run lint
```
Expected: `numFailedTests 0`, `success true`, tsc 무출력, biome 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/population/screen.ts src/population/screen.test.ts
git commit -m "feat(population): 패널 스크리너 순수 함수 (필터·라벨·상수 축)"
```

---

### Task 2: 표집 직전 필터 — `study.ts`

**Files:**
- Modify: `src/study.ts` (`CensusStudyConfig` 인터페이스, `runCensusStudy` 본문 93~94행)
- Test: `src/study.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: `PanelScreener`, `screenPersonas` (Task 1) — `import { type PanelScreener, screenPersonas } from "./population/screen.js";`
- Produces: `CensusStudyConfig.screener?: PanelScreener`

**현행 코드 (`src/study.ts:92-94`):**

```ts
): Promise<StudyResult> {
  const all = await config.population.population();
  let sample = sampleForSimulation(all, config.n, config.seed ?? 1);
```

- [ ] **Step 1: Write the failing test**

`src/study.test.ts` 끝에 추가:

```ts
describe("runCensusStudy — 패널 스크리너", () => {
  const source = {
    async population() {
      return [
        { id: "a", attrs: { 연령: "20~24세", 지역: "수도권" }, weight: 1 },
        { id: "b", attrs: { 연령: "30~34세", 지역: "비수도권" }, weight: 1 },
        { id: "c", attrs: { 연령: "70~74세", 지역: "수도권" }, weight: 1 },
      ];
    },
  };
  const question = { prompt: "q?", choices: ["쓴다", "안쓴다"] };

  it("스크리너를 주면 조건 밖 페르소나가 표본에 없다", async () => {
    const r = await runCensusStudy({
      population: source,
      provider: new MockProvider(() => "쓴다"),
      question,
      n: 12,
      seed: 1,
      screener: { 지역: "수도권" },
    });
    expect(r.responses.length).toBeGreaterThan(0);
    expect(r.responses.every((x) => x.persona.attrs.지역 === "수도권")).toBe(true);
  });

  it("스크리너가 없으면 전 인구에서 뽑는다", async () => {
    const r = await runCensusStudy({
      population: source,
      provider: new MockProvider(() => "쓴다"),
      question,
      n: 30,
      seed: 1,
    });
    const regions = new Set(r.responses.map((x) => x.persona.attrs.지역));
    expect(regions.size).toBe(2);
  });

  it("조건에 맞는 인구가 없으면 명확한 에러를 던진다", async () => {
    await expect(
      runCensusStudy({
        population: source,
        provider: new MockProvider(() => "쓴다"),
        question,
        n: 5,
        seed: 1,
        screener: { 연령: ["85세이상"] },
      }),
    ).rejects.toThrow("스크리너 조건에 맞는 인구가 없습니다");
  });
});
```

**임포트 확인됨:** `src/study.test.ts:4`가 `MockProvider`를, `:9`가 `runCensusStudy`를 이미 임포트한다. 추가할 것이 없다.

**⚠️ 이 파일은 `it`이 아니라 `test`를 쓴다** (`import { describe, expect, test } from "vitest"`). 위 테스트 코드의 `it(`을 전부 `test(`로 바꿔 파일 관례에 맞출 것.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/study.test.ts -t "패널 스크리너"`
Expected: FAIL — `screener`가 `CensusStudyConfig`에 없어 tsc/vitest가 거부하거나, 지역 필터가 걸리지 않아 `every(...)`가 false.

- [ ] **Step 3: Write minimal implementation**

`src/study.ts` 상단 import에 추가:

```ts
import { type PanelScreener, screenPersonas } from "./population/screen.js";
```

`CensusStudyConfig`에 필드 추가 (`repeats?` 아래):

```ts
  /** 합성 패널을 타깃 집단으로 한정한다. 미지정이면 전 인구. */
  screener?: PanelScreener;
```

`runCensusStudy` 본문 93~94행을 교체:

```ts
  const all = await config.population.population();
  // 표집 직전에 거른다 — sampleForSimulation이 총 가중치를 인자에서 재계산하므로
  // 인구 가중치 재정규화가 공짜다(src/population/source.ts:12). 새 수학이 없다.
  const screened = screenPersonas(all, config.screener);
  if (screened.length === 0)
    throw new Error("스크리너 조건에 맞는 인구가 없습니다 — 조건을 넓히세요.");
  let sample = sampleForSimulation(screened, config.n, config.seed ?? 1);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=threads src/study.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + gates**

```bash
npx vitest run --pool=threads --reporter=json --outputFile=/tmp/vitest.json >/dev/null 2>&1
node -e "const r=require('/tmp/vitest.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"
npx tsc --noEmit
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/study.ts src/study.test.ts
git commit -m "feat(study): runCensusStudy가 표집 직전 스크리너를 적용한다"
```

---

### Task 3: 상수 축은 세그먼트를 만들지 않되, 사라지지 않는다

**Files:**
- Modify: `src/report/segments.ts` (버킷 구성 루프, 현재 92~111행 + 반환 객체)
- Modify: `src/report/types.ts` (`ReportAppendix`에 옵셔널 필드 하나)
- Modify: `src/report/generate.ts` (`skippedDims`를 appendix로 전달)
- Modify: `src/report/render.ts` (제외된 축을 명시)
- Test: `src/report/segments.test.ts` · `src/report/generate.test.ts` · `src/report/render.test.ts`

**Interfaces:**
- Consumes: `constantDims` (Task 1) — `import { constantDims } from "../population/screen.js";`
- Produces:
  - `rankSegments(...)` 반환에 `skippedDims: string[]` 추가
  - `ReportAppendix.skippedDims?: string[]` (옵셔널 · 가산적)

**왜 버킷을 만들지 않는가.** `지역=수도권`으로 고정하면 그 축의 버킷은 하나뿐이다. `segments.ts:193`이 `restN = perPersona.size - nP` → `0`, `restRatio = segRatio` → `diff = 0`이 되어 `withinNoise`에 실린다. **비교 대상이 없는데 "차이가 작다"고 말하는 것**이다. 게이트 수학은 건드리지 않고 버킷을 아예 만들지 않는다.

**왜 그래도 말해야 하는가.** 이 저장소엔 이름 붙은 원칙이 있다 — `generate.test.ts:103` `"기준선과 동률인 세그먼트는 withinNoise로 보존된다 (조용한 소실 금지)"`. 관측된 축이 리포트에서 흔적 없이 사라지면 안 된다. 그래서 **버킷은 만들지 않되(가짜 비교 금지), 제외했다는 사실은 렌더가 밝힌다.** 두 원칙을 다 지킨다.

**⚠️ 왜 `observedButHeld`에 넣으면 안 되는가.** 그러면 `scopeVerdict`(`src/report/scope.ts`)가 `observedButHeld.length > 0`을 보고 `underpowered`를 반환하고, 리포트는 **"세그먼트로 쪼개 보려면 표본을 키우세요"**라고 쓴다. 축을 고정한 것은 표본 크기와 무관하다 — 600명을 뽑아도 `지역`은 한 값이다. 2026-07-08에 잡은 Critical(미검정 세그먼트를 `no-effect`로 오분류)과 **같은 종류의 거짓말**이 된다.

**⚠️ 기존 테스트 2건이 반드시 깨진다. 예상된 것이다.** 둘 다 픽스처가 `연령`을 한 값으로 고정한다:
- `src/report/generate.test.ts:103` — `"기준선과 동률인 세그먼트는 withinNoise로 보존된다 (조용한 소실 금지)"`
- `src/report/generate.test.ts` — `"비승격 티어(weakSignals/withinNoise/lowRelevance)도 confidence가 unknown이 아니다"`

**단언을 느슨하게 만들지 말고, 새 계약으로 다시 쓸 것.** 첫 번째는 "축이 하나뿐이면 버킷이 없고 대신 `skippedDims`에 담긴다"를 검증하도록, 두 번째는 두 값 이상인 픽스처로 바꿔 원래 의도(비승격 티어의 confidence)를 계속 검증하도록. `src/report/segments.test.ts:172-175`는 `지역: "A"`·`"B"` 두 값이라 안전하다.

**반환 필드명 확인됨** (`src/report/segments.ts:73-81`): `opportunity` · `resistance` (**단수**) · `weakSignals` · `withinNoise` · `observedButHeld` · `globalPositiveRatio`.

- [ ] **Step 1: Write the failing tests**

`src/report/segments.test.ts` 끝에 추가 (파일의 기존 `makeRepeats`·`study` 헬퍼를 쓴다. 이 파일은 `test(`를 쓴다):

```ts
describe("rankSegments — 값이 하나뿐인 축", () => {
  test("상수 축은 어느 티어에도 없고 skippedDims에 담긴다", () => {
    const responses = makeRepeats([
      { id: "a1", attrs: { 연령: "30대", 지역: "수도권" }, picks: ["쓴다", "쓴다", "쓴다"] },
      { id: "a2", attrs: { 연령: "30대", 지역: "수도권" }, picks: ["쓴다", "쓴다", "쓴다"] },
      { id: "a3", attrs: { 연령: "30대", 지역: "수도권" }, picks: ["쓴다", "쓴다", "쓴다"] },
      { id: "b1", attrs: { 연령: "60대", 지역: "수도권" }, picks: ["안쓴다", "안쓴다", "안쓴다"] },
      { id: "b2", attrs: { 연령: "60대", 지역: "수도권" }, picks: ["안쓴다", "안쓴다", "안쓴다"] },
      { id: "b3", attrs: { 연령: "60대", 지역: "수도권" }, picks: ["안쓴다", "안쓴다", "안쓴다"] },
    ]);
    const r = rankSegments(study(responses), "쓴다", 1);
    const all = [
      ...r.opportunity,
      ...r.resistance,
      ...r.weakSignals,
      ...r.withinNoise,
      ...r.observedButHeld,
    ].map((s) => s.segmentLabel);
    expect(all.some((l) => l.startsWith("지역="))).toBe(false);
    expect(all.some((l) => l.startsWith("연령="))).toBe(true);
    expect(r.skippedDims).toEqual(["지역"]);
  });

  test("두 값 이상인 축은 종전대로 버킷을 만들고 skippedDims는 빈다", () => {
    const responses = makeRepeats([
      { id: "a1", attrs: { 지역: "수도권" }, picks: ["쓴다", "쓴다", "쓴다"] },
      { id: "b1", attrs: { 지역: "비수도권" }, picks: ["안쓴다", "안쓴다", "안쓴다"] },
    ]);
    const r = rankSegments(study(responses), "쓴다", 1);
    const all = [
      ...r.opportunity,
      ...r.resistance,
      ...r.weakSignals,
      ...r.withinNoise,
      ...r.observedButHeld,
    ].map((s) => s.segmentLabel);
    expect(all.some((l) => l.startsWith("지역="))).toBe(true);
    expect(r.skippedDims).toEqual([]);
  });
});
```

`src/report/generate.test.ts:103`의 테스트를 **다음으로 교체** (계약이 바뀌었다 — 느슨해진 게 아니라 달라졌다):

```ts
  test("값이 하나뿐인 축은 버킷이 없고 appendix.skippedDims에 담긴다 (조용한 소실 금지)", () => {
    const responses = [
      ...Array.from({ length: 5 }, () => r({ 연령: "30대" }, "쓴다")),
      ...Array.from({ length: 5 }, () => r({ 연령: "30대" }, "안쓴다")),
    ];
    const rep = generateFounderInsightReport(study(responses), opts);
    expect(rep.opportunitySegments).toEqual([]);
    expect(rep.resistanceSegments).toEqual([]);
    // 대조군이 없으므로 "차이가 작다"고 말할 수 없다 — 버킷 자체가 없어야 한다
    expect(rep.withinNoise.some((s) => s.segmentLabel === "연령=30대")).toBe(false);
    // 그러나 조용히 사라지지도 않는다
    expect(rep.appendix.skippedDims).toEqual(["연령"]);
  });
```

`src/report/generate.test.ts`의 `"비승격 티어(weakSignals/withinNoise/lowRelevance)도 confidence가 unknown이 아니다"` 테스트를 찾아라. 픽스처가 `연령`을 한 값으로 고정하고 있으면 **두 값 이상으로 바꾼다.** 예: 응답의 절반은 `r({ 연령: "30대" }, …)`, 절반은 `r({ 연령: "60대" }, …)`. 원래 의도(비승격 티어의 confidence 검증)를 그대로 유지할 것.

`src/report/render.test.ts` 끝에 추가 (이 파일은 `it(`을 쓴다):

```ts
describe("renderFounderInsightReport — 제외된 축", () => {
  it("skippedDims가 있으면 제외 사실과 이유를 밝힌다", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const rep = {
      ...base,
      appendix: { ...base.appendix, skippedDims: ["지역"] },
    };
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("비교에서 제외된 축: 지역");
    expect(md).toContain("이 패널에서 값이 하나뿐이라 대조군이 없습니다");
  });

  it("skippedDims가 비면 그 문구가 없다", () => {
    const md = renderFounderInsightReport(
      generateFounderInsightReport(bigResult(), {
        question: "q?",
        choices: ["쓴다", "안쓴다"],
      }),
    );
    expect(md).not.toContain("비교에서 제외된 축");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run --pool=threads src/report/segments.test.ts -t "값이 하나뿐인 축"
```
Expected: FAIL — 첫 테스트에서 `지역=수도권`이 `withinNoise`에서 발견되고, `r.skippedDims`가 `undefined`다.

- [ ] **Step 3: Write minimal implementation**

**(a) `src/report/segments.ts`** — 상단 import에 추가:

```ts
import { constantDims } from "../population/screen.js";
```

`rankSegments`의 반환 타입(73~81행)에 필드 추가:

```ts
  /** 값이 하나뿐이라 대조군이 없어 버킷을 만들지 않은 축 (스크리너로 고정한 경우) */
  skippedDims: string[];
```

버킷 구성 루프(현재 92~111행) 바로 **위**에 삽입:

```ts
  // 값이 하나뿐인 축은 여집합이 비어(restN=0) 비교가 불가능하다. 비교 대상 없이
  // "차이가 작다"고 말할 근거가 없으므로 버킷 자체를 만들지 않는다.
  // 다만 조용히 사라지게 두지 않는다 — skippedDims로 내보내 렌더가 밝힌다.
  const skipped = constantDims(
    result.responses.filter((x) => x.choice != null).map((x) => x.persona),
  );
  const skipDims = new Set(skipped);
```

루프 안의 `for (const [dim, value] of Object.entries(r.persona.attrs)) {` 바로 다음 줄에 삽입:

```ts
      if (skipDims.has(dim)) continue;
```

`rankSegments`의 `return { … }`에 `skippedDims: skipped,`를 추가한다.

**(b) `src/report/types.ts`** — `ReportAppendix`(148~154행)에 필드 추가:

```ts
  /** 값이 하나뿐이라 세그먼트 비교에서 제외한 축. 없으면 미설정. */
  skippedDims?: string[];
```

**(c) `src/report/generate.ts`** — `rankSegments` 호출 결과에서 `skippedDims`를 받아 appendix에 넣는다. appendix 객체 리터럴에 다음을 추가 (변수명은 실제 구조분해에 맞출 것):

```ts
      skippedDims: ranked.skippedDims.length > 0 ? ranked.skippedDims : undefined,
```

**빈 배열이면 `undefined`로 둔다.** 그래야 스크리너 없는 리포트의 appendix가 종전과 동일하다(Task 6의 바이트 동일 회귀).

**(d) `src/report/render.ts`** — `## 기회 세그먼트` 헤더 push 직후(다중비교 고지 앞)에 삽입:

```ts
  // 조용한 소실 금지 — 버킷은 안 만들었지만 제외했다는 사실은 밝힌다.
  const skippedDims = report.appendix.skippedDims;
  if (skippedDims && skippedDims.length > 0)
    md.push(
      `_비교에서 제외된 축: ${skippedDims.join(" · ")} — 이 패널에서 값이 하나뿐이라 대조군이 없습니다._`,
      "",
    );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --pool=threads src/report/segments.test.ts src/report/generate.test.ts src/report/render.test.ts
npx vitest run --pool=threads --reporter=json --outputFile=/tmp/vitest.json >/dev/null 2>&1
node -e "const r=require('/tmp/vitest.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"
npx tsc --noEmit && npm run lint
```
Expected: `numFailedTests 0` · `success true`. **위 두 개 말고 다른 테스트가 깨지면 그 픽스처를 읽고 보고할 것.**

- [ ] **Step 5: Commit**

```bash
git add src/report/segments.ts src/report/segments.test.ts src/report/types.ts src/report/generate.ts src/report/generate.test.ts src/report/render.ts src/report/render.test.ts
git commit -m "fix(report): 값이 하나뿐인 축은 버킷을 만들지 않되 제외 사실을 밝힌다"
```

---

### Task 4: 리포트 본문에 모집단 명시 + 순환논증 경고

**Files:**
- Modify: `src/report/types.ts` (`FounderReportOptions`에 옵셔널 필드 하나)
- Modify: `src/report/render.ts` (상단 고지, `## 전체 신호` 두 번째 불릿)
- Test: `src/report/render.test.ts`, `web/og-stats.test.ts`

**Interfaces:**
- Consumes: `report.appendix.options.panelLabel` (아래에서 추가). `screenerLabel`은 **호출부(플랜 2의 pipeline)** 가 쓴다 — 이 태스크는 라벨 문자열을 받기만 한다.
- Produces: `export const SCREENER_CIRCULAR_WARNING` (render.ts)

**⚠️ og-stats 회귀 위험 — 이미 실행으로 확인했다.** `web/og-stats.ts`의
`/^- 표본 \d+명 · 각 \d+회 응답\(총 (\d+)\)/m`는 줄 **앞부분**에 앵커가 있으므로
`· 대상: …`을 **뒤에** 붙이면 `총 180` 캡처가 그대로다. 확인 결과 접미 유무 모두 `180`을 반환한다. 그래도 테스트로 못박는다.

- [ ] **Step 1: Write the failing test**

`src/report/render.test.ts` 끝에 추가:

```ts
describe("renderFounderInsightReport — 패널 스크리너 표기", () => {
  function withPanelLabel(label?: string) {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    return {
      ...base,
      appendix: {
        ...base.appendix,
        options: { ...base.appendix.options, panelLabel: label },
      },
    };
  }

  it("panelLabel이 있으면 상단에 대상 모집단과 순환논증 경고가 온다", () => {
    const md = renderFounderInsightReport(withPanelLabel("20~39세 · 수도권"));
    expect(md).toContain("이 리포트는 **20~39세 · 수도권** 인구만 대상으로 합니다.");
    expect(md).toContain("이 집단이 내 타깃이라는 가정은 검증되지 않았습니다");
    expect(md).toContain("스크리너 없이 한 번 더 돌리세요");
  });

  it("panelLabel이 있으면 전체 신호 표본 줄에 대상이 접미로 붙는다", () => {
    const md = renderFounderInsightReport(withPanelLabel("20~39세 · 수도권"));
    expect(md).toMatch(/^- 표본 \d+명.*· 대상: 20~39세 · 수도권/m);
  });

  it("panelLabel이 없으면 대상·경고가 어디에도 없다", () => {
    const md = renderFounderInsightReport(withPanelLabel(undefined));
    expect(md).not.toContain("인구만 대상으로 합니다");
    expect(md).not.toContain("이 집단이 내 타깃이라는 가정은");
    expect(md).not.toContain("· 대상:");
  });

  it("panelLabel이 붙어도 og-stats 파서 소스 형식은 그대로다", () => {
    const md = renderFounderInsightReport(withPanelLabel("20~39세 · 수도권"));
    expect(md).toMatch(/^- .*?· 응답 분포: /m);
  });
});
```

`web/og-stats.test.ts` 끝에 추가:

```ts
it("표본 줄에 '· 대상: …' 접미가 붙어도 n을 그대로 파싱한다", () => {
  const md = [
    "## 전체 신호",
    "",
    "- 🟢 consensus(합의) · 응답 분포: 쓴다=150, 안쓴다=30",
    "- 표본 60명 · 각 3회 응답(총 180) · 대상: 20~39세 · 수도권 · 누락률 0.0%",
    "",
  ].join("\n");
  const s = extractOgStats(md);
  expect(s?.n).toBe(180);
  expect(s?.dist[0]).toEqual(["쓴다", 150]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads src/report/render.test.ts -t "패널 스크리너 표기"`
Expected: FAIL — `panelLabel`이 `FounderReportOptions`에 없어 tsc가 거부하거나, 고지 문구가 md에 없다.
(og-stats 신규 테스트는 **이미 통과할 수 있다** — 정규식이 접미를 무시하므로. 회귀 가드로 남긴다.)

- [ ] **Step 3: Write minimal implementation**

`src/report/types.ts`의 `FounderReportOptions`(21~29행)에 필드 추가:

```ts
  /** 스크리너로 한정된 모집단의 이름 ("20~39세 · 수도권"). 미지정이면 전 인구. */
  panelLabel?: string;
```

`src/report/render.ts` 배너 상수들 옆에 추가:

```ts
export const SCREENER_CIRCULAR_WARNING =
  '> ⚠️ **이 집단이 내 타깃이라는 가정은 검증되지 않았습니다.** 패널을 한정하면 "누가 반응하는가"는 물을 수 없습니다 — 타깃 자체를 확인하려면 스크리너 없이 한 번 더 돌리세요.';
```

`render.ts`의 제목/disclaimer push(**113행** — `md.push(\`# ${report.title}\`, "", \`> ⚠️ ${report.disclaimer}\`, "");`) **바로 다음**에 삽입:

```ts
  // 스크리너를 걸면 리포트가 말하는 모집단이 바뀐다. 그 사실을 안 실으면 거짓말이 된다.
  const panelLabel = report.appendix.options.panelLabel;
  if (panelLabel) {
    md.push(`> 이 리포트는 **${panelLabel}** 인구만 대상으로 합니다.`, "");
    md.push(SCREENER_CIRCULAR_WARNING, "");
  }
```

`render.ts`의 `## 전체 신호` 두 번째 불릿을 교체 (`sampleLabel` 바로 뒤에 접미):

```ts
    `- ${sampleLabel}${panelLabel ? ` · 대상: ${panelLabel}` : ""}${o.seed != null ? ` · seed=${o.seed}` : ""}${o.provider ? ` · provider=${o.provider}` : ""} · 누락률 ${pct(o.missingRate)}`,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --pool=threads src/report/render.test.ts web/og-stats.test.ts
npx vitest run --pool=threads --reporter=json --outputFile=/tmp/vitest.json >/dev/null 2>&1
node -e "const r=require('/tmp/vitest.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"
npx tsc --noEmit && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/report/types.ts src/report/render.ts src/report/render.test.ts web/og-stats.test.ts
git commit -m "feat(report): 스크리너로 한정된 모집단을 본문에 명시 + 순환논증 경고"
```

---

### Task 5: 쉬운 요약 카드에 모집단 명시

**Files:**
- Modify: `web/easy-summary.ts` (`easy-count` 줄)
- Test: `web/easy-summary.test.ts`

**Interfaces:**
- Consumes: `report.appendix.options.panelLabel` (Task 4)
- Produces: 없음

**⚠️ 픽스처가 터진다.** `web/easy-summary.test.ts`의 `reportWith` 헬퍼는 `appendix`를 채우지 않는다. `report.appendix.options.panelLabel`을 읽으면 `undefined.options` 런타임 에러가 난다. 픽스처에 `appendix: { options: {} }`를 추가해야 한다 (`scopeVerdict` 때 `weakSignals`를 추가한 것과 같은 조치).

- [ ] **Step 1: Write the failing test**

`web/easy-summary.test.ts`의 `reportWith` 헬퍼에 `appendix`를 추가한다. 기존 반환 객체 안에 다음을 넣는다 (`over.panelLabel` 파라미터도 함께 추가):

```ts
    appendix: { options: { panelLabel: over.panelLabel } } as never,
```

그리고 파라미터 타입에 `panelLabel?: string;`을 추가한다.

파일 끝에 새 describe 추가:

```ts
describe("easySummaryHTML — 모집단 명시", () => {
  test("panelLabel이 있으면 카드가 대상 모집단을 밝힌다", () => {
    const html = easySummaryHTML(
      reportWith({ opp: "연령=30대", panelLabel: "20~39세 · 수도권" }),
      "찬성",
    );
    expect(html).toContain("20~39세 · 수도권 10명 중 9명");
  });

  test("panelLabel이 없으면 종전 그대로 'N명 중 M명'", () => {
    const html = easySummaryHTML(reportWith({ opp: "연령=30대" }), "찬성");
    expect(html).toContain("10명 중 9명");
    expect(html).not.toContain("· 수도권 10명");
  });

  test("panelLabel도 이스케이프된다", () => {
    const html = easySummaryHTML(
      reportWith({ opp: "연령=30대", panelLabel: '<script>"x"' }),
      "찬성",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads web/easy-summary.test.ts`
Expected: FAIL — `"20~39세 · 수도권 10명 중 9명"`이 없다.

- [ ] **Step 3: Write minimal implementation**

`web/easy-summary.ts`의 `easy-count` 줄(현재 100행)에서 카운트 span 앞에 라벨을 붙인다. 함수 본문 위쪽(예: `const verdict = …` 다음)에 추가:

```ts
  // 스크리너를 걸면 "60명"이 전 인구 60명이 아니다. 카드가 그 사실을 밝힌다.
  const panelLabel = report.appendix.options.panelLabel;
  const denomPrefix = panelLabel ? `${esc(panelLabel)} ` : "";
```

그리고 `easy-count` 줄을 교체:

```ts
<p class="easy-count"><span class="easy-count-num">${denomPrefix}${denom}명 중 ${positiveCount}명</span>이 "${esc(positiveChoice)}" <span class="easy-basis">가상 응답 ${report.overallSignal.n}개 기준</span></p>
```

`whoLine`·`next`·`easy-trust`는 건드리지 않는다.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --pool=threads web/easy-summary.test.ts
npx vitest run --pool=threads --reporter=json --outputFile=/tmp/vitest.json >/dev/null 2>&1
node -e "const r=require('/tmp/vitest.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"
npx tsc --noEmit && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add web/easy-summary.ts web/easy-summary.test.ts
git commit -m "feat(web): 쉬운 요약 카드가 한정된 모집단을 밝힌다"
```

---

### Task 6: 게이트 + 바이트 동일 회귀 + 실물 렌더

**Files:** 없음 (검증만). 실패 시 해당 Task로 되돌아간다.

**Interfaces:**
- Consumes: Task 1~5의 산출물, `/tmp/baseline-demo.md` (Task 1 Step 1)
- Produces: 없음

- [ ] **Step 1: 게이트 4종**

```bash
npx vitest run --pool=threads --reporter=json --outputFile=/tmp/vitest.json >/dev/null 2>&1
node -e "const r=require('/tmp/vitest.json');console.log(r.numTotalTests,r.numPassedTests,r.numFailedTests,r.success)"
npx tsc --noEmit
npm run lint
cd app && npx next build && cd ..
```
Expected: `numFailedTests 0` · `success true` · tsc 무출력 · biome 0 errors · next build 성공.

- [ ] **Step 2: 스크리너 없으면 바이트 동일 (이 플랜의 핵심 회귀)**

데모는 스크리너를 쓰지 않는다. 따라서 렌더 결과가 **변경 전과 한 글자도 달라선 안 된다.**

```bash
npm run build
npm run report:demo > /tmp/after-demo.md
diff /tmp/baseline-demo.md /tmp/after-demo.md && echo "IDENTICAL"
```
Expected: `IDENTICAL`.

**차이가 나면 원인을 반드시 규명할 것.** 가장 가능성 높은 원인은 Task 3이다 — 데모 표본에서 어떤 축이 우연히 단일값이면 그 세그먼트가 사라진다. 그 경우 diff를 보고하고 **임의로 넘어가지 말 것.**

- [ ] **Step 3: 스크리너를 건 실물 렌더를 눈으로 본다**

유닛 테스트가 못 보는 것을 실물이 잡는다(2026-07-08 세션에서 결함 5건 중 3건이 그랬다).

```bash
cat > .screener-check.mjs <<'EOF'
import { generateFounderInsightReport, renderFounderInsightReport } from "./dist/src/index.js";
const R = [];
for (let i = 0; i < 12; i++)
  R.push({ persona: { id: `a${i}`, attrs: { 연령: "25~29세", 지역: "수도권" }, weight: 1 }, answer: "쓴다", choice: "쓴다" });
for (let i = 0; i < 12; i++)
  R.push({ persona: { id: `b${i}`, attrs: { 연령: "35~39세", 지역: "수도권" }, weight: 1 }, answer: i < 3 ? "쓴다" : "안쓴다", choice: i < 3 ? "쓴다" : "안쓴다" });
const rep = generateFounderInsightReport(
  { responses: R, signal: "split", dispersion: 0.6, bySegment: { 연령: {} } },
  { question: "q?", choices: ["쓴다", "안쓴다"], panelLabel: "20~39세 · 수도권" },
);
const md = renderFounderInsightReport(rep);
console.log(md.slice(0, md.indexOf("## 관심을 끄는 이유")));
console.log("--- 지역 세그먼트가 있는가(없어야):", md.includes("지역="));
EOF
node .screener-check.mjs
rm -f .screener-check.mjs
git status --porcelain
```

Expected 출력에 다음이 순서대로 보여야 한다:
```
> 이 리포트는 **20~39세 · 수도권** 인구만 대상으로 합니다.
> ⚠️ **이 집단이 내 타깃이라는 가정은 검증되지 않았습니다.** …
...
- 표본 24명 … · 대상: 20~39세 · 수도권 · 누락률 0.0%
```
그리고 `지역 세그먼트가 있는가(없어야): false` — 지역이 상수라 버킷이 안 만들어진다.
`git status --porcelain`은 비어 있어야 한다(임시 스크립트 삭제 확인).

- [ ] **Step 4: 정직성 신호 보존 확인**

```bash
grep -c "아직 믿으면 안 되는 것" /tmp/after-demo.md      # ≥1
grep -c "## 기술 상세 — 신뢰도 4층" /tmp/after-demo.md    # =1
grep -c "synthetic panel" /tmp/after-demo.md            # ≥2
```
`grep -c`는 매치 0건일 때 exit 1이므로 `&&`로 묶지 말 것.

- [ ] **Step 5: Commit (변경 없으면 생략)**

게이트만 돌린 경우 커밋할 것이 없다.

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | Task |
|---|---|
| §1 `screen.ts` 순수 함수 | Task 1 |
| §2 표집 지점 필터 (`study.ts:93-94`) | Task 2 |
| §3 고정된 축 세그먼트 제외 | Task 3 |
| §4 모집단 표기 — 본문 | Task 4 |
| §4 모집단 표기 — 카드 | Task 5 |
| §4 모집단 표기 — **OG** | **플랜 2** (DB 컬럼 필요) |
| §5 순환논증 경고 | Task 4 |
| §6 DB 마이그레이션 | **플랜 2** |
| §7 입력 검증 | **플랜 2** |
| 검증 1~4·7·10 | Task 1·2·3·4 |
| 검증 5 (스크리너 없으면 바이트 동일) | Task 6 Step 2 |
| 검증 6 (og-stats 접미 회귀) | Task 4 |
| 검증 8·9 (마이그레이션·검증계층) | **플랜 2** |
| 범위 밖(YAGNI) 4건 | 어떤 Task에도 없음 ✅ |

**플랜 2로 미룬 것**: OG 부제 · DB `screener` 컬럼 + `ALTER TABLE` 마이그레이션 · `web/validate.ts` 스크리너 검증 · `app/src/app/api/reports/route.ts` 저장 · `app/src/app/new/page.tsx` 폼. 사용자 승인으로 분리했다 — 되돌리기 어려운 프로덕션 마이그레이션이 순수 함수 작업과 같은 리뷰 게이트를 통과하지 않게 하기 위함이다.

**2. 플레이스홀더 스캔** — TBD·TODO 없음. 모든 코드 스텝에 실제 코드가 있다.
작성 중 실제로 확인한 것:
- `src/study.ts:93-94`가 `population()` → `sampleForSimulation` 순서다.
- `src/population/source.ts:12`가 `personas.reduce((s,p)=>s+p.weight,0)`으로 총 가중치를 재계산한다 → 가중치 재정규화가 공짜.
- `src/report/segments.ts:97`이 `Object.entries(r.persona.attrs)`를 순회한다.
- `src/report/types.ts:150`에 `options: FounderReportOptions`가 있어 `report.appendix.options`로 접근 가능 → **`FounderInsightReport`에 새 필드를 더할 필요가 없다.**
- `web/og-stats.ts`의 표본 줄 정규식이 `· 대상: …` 접미를 견딘다(실행 확인: 접미 유무 모두 `180` 반환).
- `src/report/segments.test.ts:172-175`는 `지역: "A"`·`"B"` 두 값이라 Task 3에 안전하다.
- `rankSegments`의 반환 필드는 `opportunity`·`resistance`(**단수**)다 (`segments.ts:73-81`). 복수형으로 쓰면 컴파일된다 해도 `undefined` 스프레드로 조용히 빈 배열이 된다.
- `src/study.test.ts`는 `MockProvider`(`:4`)와 `runCensusStudy`(`:9`)를 이미 임포트하며, `it`이 아니라 `test`를 쓴다.
- `render.ts`의 제목/disclaimer push는 **113행**이다.
- `web/easy-summary.test.ts`의 `reportWith`에는 `appendix`가 없다 → Task 5가 추가해야 `report.appendix.options`가 터지지 않는다.

**3. 타입 일관성**
- `PanelScreener` — Task 1 정의, Task 2가 `CensusStudyConfig.screener?: PanelScreener`로 소비.
- `screenPersonas(all: Persona[], s?: PanelScreener): Persona[]` — Task 1 정의, Task 2 소비.
- `constantDims(personas: Persona[]): string[]` — Task 1 정의, Task 3 소비. Task 3은 `Response[]` → `Persona[]`로 매핑해 넘긴다.
- `screenerLabel(s?: PanelScreener): string` — Task 1 정의. **이 플랜에서는 호출부가 없다.** 플랜 2의 `web/pipeline.ts`가 쓴다. Task 1의 테스트가 유일한 소비자다 — 이는 의도된 것이며, 플랜 2가 즉시 소비한다.
- `panelLabel?: string` — Task 4가 `FounderReportOptions`에 추가, Task 4(render)·Task 5(card)가 `report.appendix.options.panelLabel`로 읽는다.
- `SCREENER_CIRCULAR_WARNING` — Task 4가 `render.ts`에서 export.

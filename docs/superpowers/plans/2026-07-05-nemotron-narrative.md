# Nemotron 서사 레이어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KOSIS IPF 표본의 각 페르소나에 Nemotron-Personas-Korea 서사를 결정적으로 매칭해 롤플레이 프롬프트만 풍부화한다 (수치·세그먼트 불변, 검증 3층 통과 전 프로덕션 기본 OFF).

**Architecture:** `src/personas/narrative.ts` 순수 매칭(스트라텀 키 + 가구 호환 필터 + FNV 해시 결정 선택) → `runCensusStudy` 옵션 배선 → `personaSystemPrompt` 배경 블록. 데이터는 오프라인 스크립트가 HF rows API(JSON)로 층화 수집해 `data/nemotron/kr-pool.json`으로 커밋.

**Tech Stack:** TypeScript 순수 함수 + fetch(HF datasets-server) + vitest. 신규 런타임 의존성 0.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-05-nemotron-narrative-design.md` (매핑 규칙·GO 기준 포함)
- `src/types.ts`는 **승인된 1줄만** 추가(`narrative?: string`), 기존 필드 무수정. `src/aggregate` 무수정
- 표본 추출·가중치·세그먼트·리포트 수치 불변 — 서사는 프롬프트 전용 (attrs에 절대 유입 금지)
- 테스트는 전부 키 없이 그린. 결정성: 같은 seed → 같은 서사
- 웹 기본 **OFF** (`NARRATIVE === "on"`일 때만 활성) — 기본 ON 전환은 A/B GO 후 별도 커밋(Task 4)
- **서브에이전트는 실키 LLM 호출 금지** — A/B 실행(비용 발생)은 컨트롤러 전담
- 저작자표시: `페르소나 서사: NVIDIA Nemotron-Personas-Korea (CC BY 4.0)`
- 커밋 메시지 끝 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- push는 사용자 승인 후에만. 실행 모델: 서브에이전트 Opus 4.8, 컨트롤러 fable

---

### Task 1: 매칭 코어 (narrative.ts + 타입 + 프롬프트 + study 배선)

**Files:**
- Modify: `src/types.ts` (Persona에 optional 1줄)
- Create: `src/personas/narrative.ts`
- Modify: `src/llm/claude.ts` (personaSystemPrompt 배경 블록)
- Modify: `src/study.ts` (CensusStudyConfig.narrativePool + runCensusStudy 적용)
- Test: `src/personas/narrative.test.ts` (신규), `src/llm/claude.test.ts`·`src/study.test.ts` (추가)

**Interfaces:**
- Produces: `PoolEntry { n; job; edu; hh: "1"|"2"|"3+"|"unknown" }`, `NarrativePool { meta; strata: Record<string, PoolEntry[]> }`, `narrativeKey(attrs): string | null` (형식 `연령|성|지역|혼인`), `attachNarratives(personas, pool, seed): Persona[]` — Task 2의 빌드 스크립트와 Task 3의 pipeline·audit이 소비

- [ ] **Step 1: 실패하는 테스트 작성**

`src/personas/narrative.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { Persona } from "../types.js";
import {
  attachNarratives,
  narrativeKey,
  type NarrativePool,
} from "./narrative.js";

function p(attrs: Record<string, string>, id = "p1"): Persona {
  return { id, attrs, weight: 1 };
}

const pool: NarrativePool = {
  meta: {
    source: "nvidia/Nemotron-Personas-Korea",
    license: "CC BY 4.0",
    generatedAt: "2026-07-05",
    rowsScanned: 1,
    strataFilled: 1,
    strataTotal: 168,
  },
  strata: {
    "45~49세|남자|수도권|유배우": [
      { n: "김철수 씨는 성실한 회사원입니다.", job: "사무원", edu: "대학교", hh: "2" },
      { n: "박영호 씨는 자영업자입니다.", job: "자영업", edu: "고등학교", hh: "unknown" },
      { n: "이민수 씨는 혼자 삽니다.", job: "프리랜서", edu: "대학교", hh: "1" },
    ],
  },
};

describe("narrativeKey", () => {
  test("네 축이 있으면 '연령|성|지역|혼인' 키", () => {
    expect(
      narrativeKey({ 연령: "45~49세", 성: "남자", 지역: "수도권", 혼인: "유배우", 가구원수: "가구원수 2명" }),
    ).toBe("45~49세|남자|수도권|유배우");
  });
  test("축이 하나라도 없으면 null", () => {
    expect(narrativeKey({ 연령: "45~49세", 성: "남자" })).toBeNull();
  });
});

describe("attachNarratives", () => {
  const attrs = { 연령: "45~49세", 성: "남자", 지역: "수도권", 혼인: "유배우", 가구원수: "가구원수 2명" };

  test("매칭되면 narrative가 '서사 (직업: … · 학력: …)' 형식으로 붙는다", () => {
    const [out] = attachNarratives([p(attrs)], pool, 7);
    expect(out.narrative).toMatch(/^(김철수|박영호) .*\(직업: .+ · 학력: .+\)$/);
  });

  test("결정적: 같은 seed 두 번 = 동일, 다른 id는 독립 선택", () => {
    const a = attachNarratives([p(attrs, "x"), p(attrs, "y")], pool, 7);
    const b = attachNarratives([p(attrs, "x"), p(attrs, "y")], pool, 7);
    expect(a[0].narrative).toBe(b[0].narrative);
    expect(a[1].narrative).toBe(b[1].narrative);
  });

  test("가구 모순 후보는 제외된다 (2인 가구 페르소나에 hh:'1' 서사 금지)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const [out] = attachNarratives([p(attrs)], pool, seed);
      expect(out.narrative).not.toContain("이민수");
    }
  });

  test("스트라텀 없음/후보 전멸이면 미부착 + 원본 불변", () => {
    const solo = p({ ...attrs, 연령: "20~24세" });
    const [out] = attachNarratives([solo], pool, 1);
    expect(out.narrative).toBeUndefined();
    // 1인 가구인데 후보가 전부 2인/1인모순이면 unknown만 허용
    const one = p({ ...attrs, 가구원수: "가구원수 1명" });
    const [o2] = attachNarratives([one], pool, 1);
    if (o2.narrative) expect(o2.narrative).not.toContain("김철수");
  });

  test("attrs는 절대 변형되지 않는다 (세그먼트 축 오염 방지)", () => {
    const src = p(attrs);
    const [out] = attachNarratives([src], pool, 7);
    expect(out.attrs).toEqual(attrs);
    expect(Object.keys(out.attrs)).toHaveLength(5);
    expect(src.narrative).toBeUndefined(); // 원본 객체 불변 (새 객체 반환)
  });
});
```

`src/llm/claude.test.ts`에 추가:

```ts
  test("narrative가 있으면 배경 블록 + 속성 우선 문구가 들어간다", () => {
    const prompt = personaSystemPrompt({
      id: "p1",
      attrs: { 연령: "45~49세" },
      weight: 1,
      narrative: "김철수 씨는 성실한 회사원입니다. (직업: 사무원 · 학력: 대학교)",
    });
    expect(prompt).toContain("배경 서사 (참고용 — 아래 속성과 상충하면 속성이 우선):");
    expect(prompt).toContain("김철수 씨는 성실한 회사원입니다.");
  });

  test("narrative가 없으면 배경 블록이 없다", () => {
    const prompt = personaSystemPrompt({ id: "p1", attrs: { 연령: "45~49세" }, weight: 1 });
    expect(prompt).not.toContain("배경 서사");
  });
```

`src/study.test.ts`에 추가 (기존 mock population 패턴 재사용):

```ts
  test("narrativePool을 주면 표본 페르소나에 서사가 붙는다 (미지정 시 기존과 동일)", async () => {
    const seen: string[] = [];
    const provider: LLMProvider = {
      ask: async (persona) => {
        seen.push(persona.narrative ?? "");
        return "쓴다";
      },
    };
    const population = {
      population: async () => [
        { id: "c1", attrs: { 연령: "45~49세", 성: "남자", 지역: "수도권", 혼인: "유배우" }, weight: 1 },
      ],
    };
    const pool: NarrativePool = {
      meta: { source: "s", license: "CC BY 4.0", generatedAt: "d", rowsScanned: 1, strataFilled: 1, strataTotal: 168 },
      strata: { "45~49세|남자|수도권|유배우": [{ n: "서사입니다.", job: "j", edu: "e", hh: "unknown" }] },
    };
    await runCensusStudy({
      population,
      provider,
      question: { prompt: "q?", choices: ["쓴다", "안쓴다"] },
      n: 1,
      seed: 1,
      narrativePool: pool,
    });
    expect(seen.some((s) => s.includes("서사입니다."))).toBe(true);
  });
```

(기존 study.test의 import·헬퍼 형식에 맞춰 조정. simulate가 ask 경로를 타는지 확인 — askChoice 미구현 provider면 ask+matchChoice 폴백이므로 위 형태로 동작.)

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/personas/narrative.test.ts src/llm/claude.test.ts src/study.test.ts`
Expected: FAIL (모듈/필드/블록 부재)

- [ ] **Step 3: 구현**

`src/types.ts` — Persona 마지막에:

```ts
  /** 매칭된 배경 서사 (Nemotron-Personas-Korea, CC BY 4.0) — 프롬프트 전용, 집계·세그먼트 미사용 */
  narrative?: string;
```

`src/personas/narrative.ts` (전체):

```ts
import type { Persona } from "../types.js";

export interface PoolEntry {
  /** persona 요약 서사 */
  n: string;
  job: string;
  edu: string;
  /** 가구 호환 클래스 (family_type에서 유도) */
  hh: "1" | "2" | "3+" | "unknown";
}

export interface NarrativePool {
  meta: {
    source: string;
    license: string;
    generatedAt: string;
    rowsScanned: number;
    strataFilled: number;
    strataTotal: number;
  };
  strata: Record<string, PoolEntry[]>;
}

/** 스트라텀 키 "연령|성|지역|혼인". 네 축 중 하나라도 없으면 null. */
export function narrativeKey(attrs: Record<string, string>): string | null {
  const a = attrs.연령;
  const s = attrs.성;
  const r = attrs.지역;
  const m = attrs.혼인;
  if (!a || !s || !r || !m) return null;
  return `${a}|${s}|${r}|${m}`;
}

/** 가구원수 attr("가구원수 N명")과 후보 hh 클래스의 호환 검사. */
function hhCompatible(attrs: Record<string, string>, hh: PoolEntry["hh"]): boolean {
  if (hh === "unknown") return true;
  const v = attrs.가구원수;
  if (!v) return true;
  const m = v.match(/(\d+)/);
  if (!m) return true;
  const n = Number(m[1]);
  if (hh === "1") return n === 1;
  if (hh === "2") return n === 2;
  return n >= 3;
}

/** FNV-1a 32bit — 결정적 후보 선택 (Math.random 금지: 재현성). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 페르소나마다 스트라텀 매칭 + 가구 호환 필터 후 서사를 결정적으로 부착한다.
 * 후보가 없으면 미부착(현행과 동일 동작). 원본 배열·객체는 변형하지 않는다.
 */
export function attachNarratives(
  personas: Persona[],
  pool: NarrativePool,
  seed: number,
): Persona[] {
  return personas.map((p) => {
    const key = narrativeKey(p.attrs);
    if (!key) return p;
    const candidates = (pool.strata[key] ?? []).filter((e) =>
      hhCompatible(p.attrs, e.hh),
    );
    if (candidates.length === 0) return p;
    const pick = candidates[fnv1a(`${p.id}:${seed}`) % candidates.length];
    return { ...p, narrative: `${pick.n} (직업: ${pick.job} · 학력: ${pick.edu})` };
  });
}
```

`src/llm/claude.ts` — personaSystemPrompt에서 bridge 처리 뒤, 마지막 출처 문구 앞에:

```ts
  if (persona.narrative) {
    lines.push(
      "",
      "배경 서사 (참고용 — 아래 속성과 상충하면 속성이 우선):",
      persona.narrative,
    );
  }
```

`src/study.ts`:
- import 추가: `import { attachNarratives, type NarrativePool } from "./personas/narrative.js";`
- `CensusStudyConfig`에: `/** 서사 풀 — 주어지면 표본에 배경 서사를 결정적으로 부착 */ narrativePool?: NarrativePool;`
- `runCensusStudy`에서:

```ts
  let sample = sampleForSimulation(all, config.n, config.seed ?? 1);
  if (config.narrativePool) {
    sample = attachNarratives(sample, config.narrativePool, config.seed ?? 1);
  }
```

- [ ] **Step 4: 통과 + 전체 확인**

Run: `npx vitest run src/personas/narrative.test.ts src/llm/claude.test.ts src/study.test.ts` → PASS
Run: `npx vitest run` → 전체 그린 (300+신규), `npx tsc --noEmit` → 통과

- [ ] **Step 5: biome + Commit**

```bash
npx biome check --write src/types.ts src/personas/narrative.ts src/personas/narrative.test.ts src/llm/claude.ts src/llm/claude.test.ts src/study.ts src/study.test.ts
git add src/types.ts src/personas src/llm/claude.ts src/llm/claude.test.ts src/study.ts src/study.test.ts
git commit -m "feat(personas): narrative matching layer — deterministic Nemotron backstory attach

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 풀 빌드 스크립트 + 실데이터 수집

**Files:**
- Create: `scripts/build-nemotron-pool.ts`
- Create: `data/nemotron/kr-pool.json` (스크립트 실행 산출물, 커밋)
- Test: `src/personas/narrative-pool.test.ts` (실파일 스키마 검증)
- Modify: `tsup.config.ts` (entry에 `scripts/build-nemotron-pool.ts` 추가 — refresh-census 패턴)

**Interfaces:**
- Consumes: Task 1의 `NarrativePool`/`PoolEntry` 타입
- Produces: `data/nemotron/kr-pool.json` — Task 3의 pipeline·audit이 로드

- [ ] **Step 1: family_type 실값 덤프 (규칙 확정용)**

스크립트에 `--dump-family-types` 모드를 먼저 구현: HF rows API로 3,000행을 읽어 `family_type` 고유값·빈도 출력.

```ts
// scripts/build-nemotron-pool.ts (전체 골격)
import { mkdirSync, writeFileSync } from "node:fs";
import type { NarrativePool, PoolEntry } from "../src/personas/narrative.js";

const API = "https://datasets-server.huggingface.co/rows";
const DS = "nvidia%2FNemotron-Personas-Korea";
const TOTAL_ROWS = 1_000_000;

interface HFRow {
  row: {
    persona: string;
    sex: string;
    age: number;
    marital_status: string;
    family_type: string;
    education_level: string;
    occupation: string;
    province: string;
  };
}

async function fetchRows(offset: number, length: number): Promise<HFRow[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `${API}?dataset=${DS}&config=default&split=train&offset=${offset}&length=${length}`,
    );
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`HF rows ${res.status} @offset=${offset}`);
    const body = (await res.json()) as { rows: HFRow[] };
    return body.rows;
  }
  throw new Error(`HF rows 429 재시도 초과 @offset=${offset}`);
}

const CAPITAL = new Set(["서울", "경기", "인천"]);
const AGE_BUCKETS = [
  "20~24세", "25~29세", "30~34세", "35~39세", "40~44세", "45~49세",
  "50~54세", "55~59세", "60~64세", "65~69세", "70~74세", "75~79세",
  "80~84세", "85세이상",
];

function ageBucket(age: number): string | null {
  if (age < 20) return null; // 19세 제외 (스펙)
  if (age >= 85) return "85세이상";
  const lo = Math.floor(age / 5) * 5;
  return `${lo}~${lo + 4}세`;
}

function mapMarital(m: string): string | null {
  if (m === "배우자있음") return "유배우";
  if (m === "미혼") return "미혼";
  if (m === "사별" || m === "이혼") return "사별·이혼";
  return null; // 미지 값은 스킵하고 카운트 보고
}

// family_type 39종 → 가구 호환 클래스. --dump-family-types 결과로 확정한
// 규칙을 여기 하드코딩한다 (아래는 초기 규칙 — 덤프 후 조정하고 커밋 메시지에 근거 기록).
function hhClass(familyType: string): PoolEntry["hh"] {
  const f = familyType;
  if (/1인|혼자|독거/.test(f)) return "1";
  if (/^배우자와 거주$|부부/.test(f) && !/자녀|부모|손/.test(f)) return "2";
  if (/자녀|부모|손|형제|3세대/.test(f)) return "3+";
  return "unknown";
}
```

Run: `npm run build && node dist/scripts/build-nemotron-pool.js --dump-family-types`
Expected: 39개 내외 고유값 목록 + 빈도. **이 출력을 근거로 hhClass 규칙을 확정**하고(분류 불가 값은 unknown 유지) 보고서에 값→클래스 표 전체를 기록.

- [ ] **Step 2: 층화 수집 구현 + 실행**

이어서 기본 모드 구현: 결정적 오프셋 시퀀스(예: seed 고정 LCG로 0~999,900 범위 100행 단위, 콜 사이 300ms 대기, 최대 600콜)로 페이지를 훑어 스트라텀당 20명 채우면 조기 종료. 필터: `ageBucket !== null && mapMarital !== null`. PoolEntry는 `{ n: row.persona, job: row.occupation, edu: row.education_level, hh: hhClass(row.family_type) }`. 서사(n)가 400자 넘으면 앞 400자 + "…"로 절단.

meta 기록: `{ source: "nvidia/Nemotron-Personas-Korea", license: "CC BY 4.0", generatedAt: ISO, rowsScanned, strataFilled, strataTotal: 168 }`.

Run: `node dist/scripts/build-nemotron-pool.js`
Expected: `data/nemotron/kr-pool.json` 생성 (~1-2MB). 콘솔에 스트라텀 충족률(예: 160/168)·미지 marital 값 카운트 출력 — 보고서에 기록. 충족률 90% 미만이면 최대 콜 수를 늘려 1회 재시도.

- [ ] **Step 3: 실파일 스키마 검증 테스트**

`src/personas/narrative-pool.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { NarrativePool } from "./narrative.js";

describe("kr-pool.json (커밋된 실데이터)", () => {
  const pool = JSON.parse(
    readFileSync(new URL("../../data/nemotron/kr-pool.json", import.meta.url), "utf8"),
  ) as NarrativePool;

  test("meta에 출처·라이선스가 기록돼 있다", () => {
    expect(pool.meta.source).toBe("nvidia/Nemotron-Personas-Korea");
    expect(pool.meta.license).toBe("CC BY 4.0");
  });

  test("모든 스트라텀 키가 '연령|성|지역|혼인' 형식이고 우리 카테고리 값만 쓴다", () => {
    const AGES = new Set(["20~24세","25~29세","30~34세","35~39세","40~44세","45~49세","50~54세","55~59세","60~64세","65~69세","70~74세","75~79세","80~84세","85세이상"]);
    for (const key of Object.keys(pool.strata)) {
      const [age, sex, region, marital] = key.split("|");
      expect(AGES.has(age), key).toBe(true);
      expect(["남자", "여자"]).toContain(sex);
      expect(["수도권", "비수도권"]).toContain(region);
      expect(["미혼", "유배우", "사별·이혼"]).toContain(marital);
    }
  });

  test("항목은 비지 않고 필드가 유효하다", () => {
    const entries = Object.values(pool.strata).flat();
    expect(entries.length).toBeGreaterThan(500);
    for (const e of entries.slice(0, 200)) {
      expect(e.n.length).toBeGreaterThan(20);
      expect(e.n.length).toBeLessThanOrEqual(401);
      expect(["1", "2", "3+", "unknown"]).toContain(e.hh);
    }
  });

  test("15~19세 스트라텀은 없다 (19세 제외 규칙)", () => {
    expect(Object.keys(pool.strata).some((k) => k.startsWith("15~19세"))).toBe(false);
  });
});
```

Run: `npx vitest run src/personas/narrative-pool.test.ts` → PASS

- [ ] **Step 4: 전체 게이트 + Commit**

Run: `npx vitest run` 전체 그린, `npx tsc --noEmit`, `npx biome check --write scripts/build-nemotron-pool.ts src/personas/narrative-pool.test.ts`

```bash
git add scripts/build-nemotron-pool.ts data/nemotron/kr-pool.json src/personas/narrative-pool.test.ts tsup.config.ts
git commit -m "feat(data): Nemotron narrative pool — stratified fetch via HF rows API (CC BY 4.0)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 웹 배선(기본 OFF) + 표기 + 감사·A/B 스크립트

**Files:**
- Modify: `web/pipeline.ts` (NARRATIVE=on 게이트 + options.run.narrative 플래그)
- Modify: `src/report/types.ts` (FounderReportOptions.run에 `narrative?: boolean`)
- Modify: `src/report/generate.ts` (appendix 저작자표시 1줄)
- Modify: `README.md` (저작자표시 절)
- Create: `eval/narrative-audit.ts` (키 없는 모순 감사, tsup entry 추가)
- Create: `eval/narrative-ab.ts` (실키 A/B 스크립트 — **작성만, 실행은 컨트롤러**, tsup entry 추가)
- Test: `web/pipeline.test.ts`(NARRATIVE=on 경로), `src/report/generate.test.ts`(appendix 표기)

**Interfaces:**
- Consumes: `attachNarratives`/`NarrativePool` (Task 1), `data/nemotron/kr-pool.json` (Task 2)
- Produces: `NARRATIVE=on` 환경변수 계약, appendix 문자열 `페르소나 서사: NVIDIA Nemotron-Personas-Korea (CC BY 4.0)`

- [ ] **Step 1: 실패하는 테스트**

`src/report/generate.test.ts`:

```ts
  test("run.narrative가 참이면 appendix에 서사 저작자표시가 붙는다", () => {
    const responses = [...mk(15, 0, "혼인", "A"), ...mk(3, 12, "혼인", "B")];
    const result: StudyResult = { responses, signal: "split", dispersion: 1, bySegment: {} };
    const rep = generateFounderInsightReport(result, {
      question: "q?", choices: ["쓴다", "안쓴다"], minN: 8,
      run: { n: 30, narrative: true },
    });
    expect(rep.appendix.caveats).toContain(
      "페르소나 서사: NVIDIA Nemotron-Personas-Korea (CC BY 4.0)",
    );
  });
```

`web/pipeline.test.ts`:

```ts
  test("NARRATIVE=on이면 프롬프트에 배경 서사가 실리고 md에 저작자표시가 남는다", async () => {
    process.env.NARRATIVE = "on";
    try {
      const prompts: string[] = [];
      const provider = new MockProvider((p) => ((p.attrs.연령 ?? "").startsWith("2") ? "쓴다" : "안쓴다"));
      const origAsk = provider.ask.bind(provider);
      provider.ask = async (persona, prompt) => {
        prompts.push(personaSystemPrompt(persona));
        return origAsk(persona, prompt);
      };
      const runner = makeReportRunner(provider, { n: 10, repeats: 1, concurrency: 1 });
      const md = await runner("질문?", ["쓴다", "안쓴다"], () => {});
      expect(prompts.some((s) => s.includes("배경 서사"))).toBe(true);
      expect(md).toContain("페르소나 서사: NVIDIA Nemotron-Personas-Korea (CC BY 4.0)");
    } finally {
      delete process.env.NARRATIVE;
    }
  });

  test("NARRATIVE 미설정이면 서사가 붙지 않는다 (기본 OFF)", async () => {
    const prompts: string[] = [];
    const provider = new MockProvider(() => "쓴다");
    const origAsk = provider.ask.bind(provider);
    provider.ask = async (persona, prompt) => {
      prompts.push(personaSystemPrompt(persona));
      return origAsk(persona, prompt);
    };
    const runner = makeReportRunner(provider, { n: 5, repeats: 1, concurrency: 1 });
    const md = await runner("질문?", ["쓴다", "안쓴다"], () => {});
    expect(prompts.every((s) => !s.includes("배경 서사"))).toBe(true);
    expect(md).not.toContain("Nemotron");
  });
```

(personaSystemPrompt를 web/pipeline.test.ts에서 import: `import { personaSystemPrompt } from "../src/llm/claude.js";`. MockProvider.ask 시그니처가 다르면 실제 정의에 맞춰 래핑. 프롬프트 캡처가 MockProvider 구조상 어려우면 대안: responses의 persona.narrative 존재를 검증하는 것으로 완화하되 md 저작자표시 단언은 유지.)

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/report/generate.test.ts web/pipeline.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/report/types.ts` — `run?: { seed?: number; provider?: string; n?: number }`에 `narrative?: boolean;` 추가.

`src/report/generate.ts` — caveats 초기화 이후 아무 곳(관련성 캐비앗 부근):

```ts
  if (options.run?.narrative) {
    caveats.push("페르소나 서사: NVIDIA Nemotron-Personas-Korea (CC BY 4.0)");
  }
```

`web/pipeline.ts`:

```ts
import poolJson from "../data/nemotron/kr-pool.json" with { type: "json" };
import type { NarrativePool } from "../src/personas/narrative.js";
```

runner 내부:

```ts
    const narrativeOn = process.env.NARRATIVE === "on"; // 기본 OFF — A/B GO 후 기본 ON 전환
    const narrativePool = narrativeOn
      ? (poolJson as unknown as NarrativePool)
      : undefined;
```

`runCensusStudy({ ..., narrativePool })` 전달, `options.run`에 `narrative: narrativeOn` 추가.

`README.md` — 라이선스/출처 절에 1줄:

```markdown
- 페르소나 배경 서사: [NVIDIA Nemotron-Personas-Korea](https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea) (CC BY 4.0) — `NARRATIVE=on`일 때 롤플레이 프롬프트에만 사용
```

`eval/narrative-audit.ts` (키 없음 — 실풀 + census 모집단 200명 매칭 감사):

```ts
import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import poolJson from "../data/nemotron/kr-pool.json" with { type: "json" };
import type { NarrativePool } from "../src/personas/narrative.js";
import { attachNarratives, narrativeKey } from "../src/personas/narrative.js";
import type { Snapshot } from "../src/population/schema.js";
import { CensusPopulation } from "../src/population/source.js";
import { sampleForSimulation } from "../src/population/source.js";

const pool = poolJson as unknown as NarrativePool;
const population = new CensusPopulation(snapshotJson as unknown as Snapshot);
const all = await population.population();
const sample = sampleForSimulation(all, 200, 42);
const attached = attachNarratives(sample, pool, 42);

let withNarrative = 0;
let violations = 0;
for (const p of attached) {
  if (!p.narrative) continue;
  withNarrative++;
  const key = narrativeKey(p.attrs);
  if (!key) {
    console.error("VIOLATION: narrative without key", p.id);
    violations++;
    continue;
  }
  // 부착된 서사가 실제 그 스트라텀 후보에서 왔는지 역검증
  const bases = (pool.strata[key] ?? []).map((e) => `${e.n} (직업: ${e.job} · 학력: ${e.edu})`);
  if (!bases.includes(p.narrative)) {
    console.error("VIOLATION: stratum mismatch", p.id, key);
    violations++;
  }
}
console.log(`감사: 표본 200 · 서사 부착 ${withNarrative} · 모순 ${violations}`);
console.log("무작위 10건 (정성 검토용):");
for (const p of attached.filter((x) => x.narrative).slice(0, 10)) {
  console.log("-", JSON.stringify(p.attrs), "→", p.narrative?.slice(0, 120));
}
if (violations > 0) process.exit(1);
```

`eval/narrative-ab.ts` (실키, **작성만** — 실행·판정은 컨트롤러):

```ts
import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import poolJson from "../data/nemotron/kr-pool.json" with { type: "json" };
import { OpenAIProvider } from "../src/llm/openai.js";
import type { NarrativePool } from "../src/personas/narrative.js";
import type { Snapshot } from "../src/population/schema.js";
import { CensusPopulation } from "../src/population/source.js";
import { runCensusStudy } from "../src/study.js";

const question = { prompt: "개인용 클라우드 백업 서비스에 월 5천원을 낼 의향이 있으신가요?", choices: ["있다", "없다", "모르겠다"] };
const seed = 424242;
const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY ?? "", model: "gpt-4o-mini" });
const population = new CensusPopulation(snapshotJson as unknown as Snapshot);

for (const mode of ["off", "on"] as const) {
  const result = await runCensusStudy({
    population, provider, question, n: 30, seed, repeats: 3,
    simulate: { concurrency: 4, retries: 1, counterbalance: true },
    narrativePool: mode === "on" ? (poolJson as unknown as NarrativePool) : undefined,
  });
  const dist: Record<string, number> = {};
  let parsed = 0;
  for (const r of result.responses) {
    if (r.choice) { parsed++; dist[r.choice] = (dist[r.choice] ?? 0) + 1; }
  }
  console.log(`\n=== NARRATIVE ${mode} ===`);
  console.log("분포:", JSON.stringify(dist), `파싱 ${parsed}/${result.responses.length}`);
  console.log("reason 표본 5건:");
  for (const r of result.responses.filter((x) => x.answer).slice(0, 5)) {
    console.log(`- [${r.choice}] ${r.answer.slice(0, 150)}`);
  }
}
```

(OpenAIProvider 생성자 시그니처·응답 reason 접근 방식은 실제 코드에 맞춰 조정 — eval/report-live.ts의 기존 사용 패턴을 그대로 따를 것. tsup entry 두 개 추가.)

- [ ] **Step 4: 게이트 + 감사 실행 + Commit**

Run: `npx vitest run` 전체 그린, `npx tsc --noEmit`, `npm run build`
Run: `node dist/eval/narrative-audit.js` → `모순 0` 확인 (출력 전문을 보고서에 포함)

```bash
npx biome check --write web/pipeline.ts web/pipeline.test.ts src/report eval/narrative-audit.ts eval/narrative-ab.ts README.md
git add web/pipeline.ts web/pipeline.test.ts src/report/types.ts src/report/generate.ts src/report/generate.test.ts README.md eval/narrative-audit.ts eval/narrative-ab.ts tsup.config.ts
git commit -m "feat(web,eval): narrative wiring (default OFF) + attribution + audit/AB harness

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 컨트롤러 검증 — 정성 검토·A/B·GO 판정·배포

(컨트롤러 fable 직접 수행 — 실키 비용 발생 단계)

- [ ] **Step 1: 정성 검토** — `node dist/eval/narrative-audit.js` 재실행, 표본 20건(스크립트 10건 + 재실행 10건)을 직접 읽고 속성↔서사 정합 판정 보고
- [ ] **Step 2: Full gates** — tsc·lint·vitest 전체·app next build
- [ ] **Step 3: push (사용자 승인)** — 기본 OFF 상태로 3커밋 push (프로덕션 무영향)
- [ ] **Step 4: 라이브 A/B (≈$0.04)** — `node --env-file=.env dist/eval/narrative-ab.js` 실행, GO 기준 판정:
  파싱률 저하 없음 · 분포 전면 붕괴 없음(이동 폭 보고) · reason에 서사 맥락 반영 · 감사 모순 0
- [ ] **Step 5: GO면** — `web/pipeline.ts`의 게이트를 `process.env.NARRATIVE !== "off"`(기본 ON)로 + 관련 테스트 기대값 갱신 + `app/src/app/layout.tsx` 콜로폰에 저작자표시 추가 + 커밋 → push 승인 → 라이브 스모크 1건(리포트 appendix에 표기 확인). **NO-GO면** — 기본 OFF 유지, 원인 분석 보고 후 사용자 결정 대기
- [ ] **Step 6: handoff 갱신** — `docs/handoff-2026-07-05-v1-live.md`에 서사 레이어·불변식 갱신(types.ts optional 승인분)·A/B 결과 기록, 커밋

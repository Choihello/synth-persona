# Synthetic Population Engine Implementation Plan (Plan 3A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통계청 다수 교차표 스냅샷에서 **가중치 달린 5속성 합성 인구**(3축 matched-core + 2 조건부 맥락)를 결정적으로 생성하고, 그 출처(provenance)·프레임·결측을 정직하게 표시하는 엔진을 만든다.

**Architecture:** 접근 B(matched-core + 조건부 부착). core(성×연령×권역)는 실측 joint를 가중 열거하고, 혼인·가구원수는 연령 앵커 조건부로 분할 부착(weight 곱). 모든 합성은 RNG 없이 결정적(LLM용 추출만 시드 사용). 데이터는 번들 스냅샷 JSON(키 없이 재현) + 라이브 갱신 스크립트.

**Tech Stack:** TypeScript, Node 24(ESM), vitest. 런타임 외부 의존성 추가 없음(`@anthropic-ai/sdk`만).

## Global Constraints

- 런타임 외부 의존성은 `@anthropic-ai/sdk` 하나뿐. population/loader/synthesize는 무의존(Node 내장만).
- 키 없이 `npm install && npm test`가 항상 초록불. 합성·로더·샘플 테스트는 인라인 픽스처(네트워크/키 없음). refresh 스크립트만 라이브.
- 언어 TypeScript, ESM, 들여쓰기 2칸. 합성은 결정적(시드 불필요), `sampleForSimulation`만 시드.
- 정직성: "5-way joint 아님". matched-core vs conditioned/inferred를 provenance로 분리. suppressed(X)는 0이 아니라 분모 제외, structural zero(-)만 0.
- 응답자 universe = 15세 이상(혼인 universe 정렬 + householder bridge 오차 축소).
- Persona.weight 필수. fidelity(3B)는 가중 집계.
- 빌드 임포트는 `.js` 확장자로 `.ts`를 가리킨다.

---

### Task 1: Persona 확장 (weight 필수 + provenance/flags + Frame/Provenance 타입)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/personas/sample.ts` (samplePersonas가 weight 설정)
- Modify: `src/simulate/simulate.test.ts`, `src/llm/claude.test.ts`, `src/llm/mock.test.ts`, `src/llm/recorded.test.ts`, `src/aggregate/uncertainty.test.ts` (기존 Persona 리터럴에 `weight` 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type Provenance = "matched" | "conditioned" | "inferred" | "llm_generated"`
  - `type Frame = "individual" | "householder" | "household"`
  - `interface Persona { id: string; attrs: Record<string, string>; weight: number; provenance?: Record<string, Provenance>; flags?: string[] }`

- [ ] **Step 1: types.ts 수정 (실패 유발)**

`src/types.ts`의 `Persona`를 교체하고 타입 추가:
```ts
export type Provenance = "matched" | "conditioned" | "inferred" | "llm_generated";
export type Frame = "individual" | "householder" | "household";
export interface Persona {
  id: string;
  attrs: Record<string, string>;
  weight: number;
  provenance?: Record<string, Provenance>;
  flags?: string[];
}
```

- [ ] **Step 2: 전체 타입체크로 깨지는 곳 확인**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: `weight` 누락으로 5개 테스트 파일 + 가능시 sample.ts에서 에러. (어디를 고칠지 목록 확보)

- [ ] **Step 3: samplePersonas가 weight 설정**

`src/personas/sample.ts`의 persona 생성부 `out.push({ id: \`p${k + 1}\`, attrs });` 를:
```ts
out.push({ id: `p${k + 1}`, attrs, weight: 1 });
```

- [ ] **Step 4: 기존 테스트의 Persona 리터럴에 weight 추가**

아래 5개 파일에서 `{ id: ..., attrs: {...} }` 형태의 모든 Persona 리터럴에 `weight: 1`을 추가한다(값은 1 고정 — 기존 동작 동일, 비가중과 같음):
- `src/simulate/simulate.test.ts`
- `src/llm/claude.test.ts`
- `src/llm/mock.test.ts`
- `src/llm/recorded.test.ts`
- `src/aggregate/uncertainty.test.ts`

패턴 예:
```ts
// before
{ id: "1", attrs: { age: "20대" } }
// after
{ id: "1", attrs: { age: "20대" }, weight: 1 }
```
`aggregate/uncertainty.test.ts`의 `r()` 헬퍼는:
```ts
const r = (age: string, choice: string): Response => ({
  persona: { id: Math.random().toString(), attrs: { age }, weight: 1 },
  answer: choice,
  choice,
});
```

- [ ] **Step 5: 타입체크 + 전체 테스트 통과**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 타입 에러 0, 전체 스위트 통과(개수 동일).

- [ ] **Step 6: 린트 클린 후 커밋**

```bash
npm run lint || npm run format
git add -A
git commit -m "feat: Persona에 weight(필수)+provenance/flags, Frame/Provenance 타입 (가중 합성 기반)"
```

---

### Task 2: KOSIS 엔진 c3nm 축 지원

**Files:**
- Modify: `src/data/kosis-source.ts`
- Modify: `src/data/kosis-source.test.ts`

**Interfaces:**
- Consumes: 기존 `KosisRow`, `KosisAxis`, `parseKosisRows`, `rowsToCrossTable`
- Produces: `KosisRow`에 `c3nm: string | null`; `KosisAxis`에 `"c3nm"` 추가. (DT_1IN1509는 연령이 C3에 옴)

- [ ] **Step 1: 실패 테스트 추가**

`src/data/kosis-source.test.ts`의 `describe("kosis 항목축(ITM) 지원", ...)` 안에 추가:
```ts
test("parseKosisRows는 C3_NM을 c3nm으로 노출하고 c3nm 축으로 교차표를 만든다", () => {
  const rows = parseKosisRows([
    { PRD_DE: "2024", C1_NM: "전국", C2_NM: "남자", C3_NM: "20~24세", ITM_NM: "일반가구원", DT: "100", UNIT_NM: "명" },
    { PRD_DE: "2024", C1_NM: "전국", C2_NM: "여자", C3_NM: "20~24세", ITM_NM: "일반가구원", DT: "120", UNIT_NM: "명" },
  ]);
  expect(rows[0].c3nm).toBe("20~24세");
  const m = rowsToCrossTable(rows, ["남자", "여자"], ["20~24세"], {
    rowField: "c2nm",
    colField: "c3nm",
  });
  expect(m.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/data/kosis-source.test.ts`
Expected: FAIL (`c3nm` 없음 / `"c3nm"` 타입 불가)

- [ ] **Step 3: kosis-source.ts 수정**

`KosisRow`에 필드 추가:
```ts
export interface KosisRow {
  period: string;
  c1nm: string;
  c2nm: string | null;
  c3nm: string | null;
  item: string;
  value: number | null;
}
```
`KosisAxis`:
```ts
export type KosisAxis = "c1nm" | "c2nm" | "c3nm" | "item";
```
`parseKosisRows`의 매핑에 추가(`c2nm` 다음 줄):
```ts
    c3nm: r.C3_NM != null ? String(r.C3_NM) : null,
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/data/kosis-source.test.ts`
Expected: PASS

- [ ] **Step 5: 린트 + 커밋**

```bash
npm run lint || npm run format
git add src/data/kosis-source.ts src/data/kosis-source.test.ts
git commit -m "feat: KosisAxis에 c3nm 추가 (DT_1IN1509 등 연령=C3 표 지원)"
```

---

### Task 3: 스냅샷 스키마 + 로더(frame 가드)

**Files:**
- Create: `src/population/schema.ts`, `src/population/loader.ts`, `src/population/loader.test.ts`

**Interfaces:**
- Consumes: `Frame` (`../types.js`)
- Produces:
  - schema 타입: `SnapshotSourceMeta`, `SnapshotMeta`, `CoreJoint`, `ConditionalTable`, `Snapshot`
  - `function loadSnapshot(json: unknown): Snapshot` — 구조 검증 + **frame 가드**(개인 프레임이 아닌 conditional은 `bridge` 선언 필수, 아니면 throw).

- [ ] **Step 1: 실패 테스트 작성**

`src/population/loader.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { loadSnapshot } from "./loader.js";
import type { Snapshot } from "./schema.js";

const ok: Snapshot = {
  meta: {
    year: 2024, geographyLevel: "권역", generatedAt: "2026-06-29",
    sources: [], ageBins: ["15~19세"], weightUnit: "person_count",
  },
  core: { dims: ["성", "연령", "지역"], categories: { 성: ["남자"], 연령: ["15~19세"], 지역: ["수도권"] }, counts: [100] },
  conditional: [
    { given: "연령", var: "혼인", frame: "individual", universe: "15세이상", givenKeys: ["15~19세"], varKeys: ["미혼"], matrix: [[100]] },
    { given: "연령", var: "가구원수", frame: "householder", universe: "일반가구", bridge: "householder_age_as_proxy", givenKeys: ["15~19세"], varKeys: ["가구원수 1명"], matrix: [[50]] },
  ],
};

describe("loadSnapshot", () => {
  test("정상 스냅샷을 로드한다", () => {
    const s = loadSnapshot(ok);
    expect(s.core.dims).toEqual(["성", "연령", "지역"]);
  });
  test("frame 가드: 비개인 conditional이 bridge 없으면 throw", () => {
    const bad = structuredClone(ok);
    bad.conditional[1].bridge = undefined;
    expect(() => loadSnapshot(bad)).toThrow(/bridge/i);
  });
  test("구조 불량은 throw", () => {
    expect(() => loadSnapshot({})).toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/population/loader.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: schema.ts 구현**

`src/population/schema.ts`:
```ts
import type { Frame } from "../types.js";

export interface SnapshotSourceMeta {
  var: string[];
  tblId: string;
  orgId?: string;
  frame: Frame;
  universe: string;
  denominator?: string;
}
export interface SnapshotMeta {
  year: number;
  geographyLevel: "시도" | "권역" | "전국";
  generatedAt: string;
  sources: SnapshotSourceMeta[];
  ageBins: string[];
  weightUnit: "person_count" | "normalized_weight";
  regionMapping?: Record<string, string[]>;
  bridgeAssumptions?: string[];
  missingPolicy?: { structuralZero: string[]; suppressed: string[] };
}
export interface CoreJoint {
  dims: string[];
  categories: Record<string, string[]>;
  counts: number[]; // flat, row-major over dims
}
export interface ConditionalTable {
  given: string;
  var: string;
  frame: Frame;
  universe: string;
  givenKeys: string[];
  varKeys: string[];
  matrix: (number | null)[][]; // [given][var] counts; null = suppressed
  bridge?: string;
}
export interface Snapshot {
  meta: SnapshotMeta;
  core: CoreJoint;
  conditional: ConditionalTable[];
}
```

`src/population/loader.ts`:
```ts
import type { Snapshot } from "./schema.js";

export function loadSnapshot(json: unknown): Snapshot {
  const s = json as Snapshot;
  if (!s || !s.meta || !s.core || !Array.isArray(s.conditional)) {
    throw new Error("invalid snapshot: missing meta/core/conditional");
  }
  if (!Array.isArray(s.core.dims) || !Array.isArray(s.core.counts)) {
    throw new Error("invalid snapshot: malformed core");
  }
  // frame 가드: 개인 프레임이 아닌 conditional은 명시 bridge가 있어야 결합 허용
  for (const ct of s.conditional) {
    if (ct.frame !== "individual" && !ct.bridge) {
      throw new Error(
        `cross-frame conditional '${ct.var}' (frame=${ct.frame}) requires an explicit bridge`,
      );
    }
  }
  return s;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/population/loader.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 린트 + 커밋**

```bash
npm run lint || npm run format
git add src/population/schema.ts src/population/loader.ts src/population/loader.test.ts
git commit -m "feat: 합성 인구 스냅샷 스키마 + 로더(frame 가드)"
```

---

### Task 4: synthesizePopulation (가중 열거 + 조건부 부착)

**Files:**
- Create: `src/population/synthesize.ts`, `src/population/synthesize.test.ts`

**Interfaces:**
- Consumes: `Persona`, `Provenance` (`../types.js`); `Snapshot`, `ConditionalTable` (`./schema.js`)
- Produces:
  - `function conditionalProbs(row: (number | null)[]): number[]` — suppressed(null) 제외 정규화.
  - `function synthesizePopulation(snapshot: Snapshot, opts?: { minRespondentAge?: string; minCellWeight?: number }): Persona[]` — 가중 모집단. core=matched 열거(응답자 15세+), 혼인/가구원수=조건부 분할(weight 곱, provenance=conditioned, bridge flag).

- [ ] **Step 1: 실패 테스트 작성**

`src/population/synthesize.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { conditionalProbs, synthesizePopulation } from "./synthesize.js";
import type { Snapshot } from "./schema.js";

const snap: Snapshot = {
  meta: { year: 2024, geographyLevel: "권역", generatedAt: "x", sources: [], ageBins: ["15세미만", "20~24세", "40~44세"], weightUnit: "person_count" },
  core: {
    dims: ["성", "연령", "지역"],
    categories: { 성: ["남자", "여자"], 연령: ["15세미만", "20~24세", "40~44세"], 지역: ["수도권", "비수도권"] },
    // row-major: 성(2)×연령(3)×지역(2) = 12 cells
    counts: [
      // 남자
      10, 10,  /*15미만 수/비*/  100, 50, /*20-24*/  80, 40, /*40-44*/
      // 여자
      10, 10,  120, 60,  90, 45,
    ],
  },
  conditional: [
    { given: "연령", var: "혼인", frame: "individual", universe: "15세이상",
      givenKeys: ["20~24세", "40~44세"], varKeys: ["미혼", "기혼"],
      matrix: [[90, 10], [30, 70]] },
    { given: "연령", var: "가구원수", frame: "householder", universe: "일반가구", bridge: "householder_age_as_proxy",
      givenKeys: ["20~24세", "40~44세"], varKeys: ["가구원수 1명", "가구원수 4명"],
      matrix: [[80, 20], [25, 75]] },
  ],
};

describe("synthesize", () => {
  test("conditionalProbs: suppressed(null) 제외 정규화", () => {
    expect(conditionalProbs([3, 1])).toEqual([0.75, 0.25]);
    expect(conditionalProbs([3, null])).toEqual([1, 0]); // null 제외 → 3/3
  });

  test("응답자 universe 15세+: 15세미만 코어는 제외된다", () => {
    const pop = synthesizePopulation(snap);
    expect(pop.every((p) => p.attrs["연령"] !== "15세미만")).toBe(true);
  });

  test("성×연령×지역은 matched, 혼인/가구원수는 conditioned + bridge flag", () => {
    const pop = synthesizePopulation(snap);
    const p = pop[0];
    expect(p.provenance?.["성"]).toBe("matched");
    expect(p.provenance?.["혼인"]).toBe("conditioned");
    expect(p.provenance?.["가구원수"]).toBe("conditioned");
    expect(p.flags).toContain("bridge:householder_age_as_proxy");
  });

  test("weight 합이 보존된다(15세+ core 총합)", () => {
    const pop = synthesizePopulation(snap);
    const total = pop.reduce((s, p) => s + p.weight, 0);
    // 15세+ core 합 = 전체(700) - 15세미만(40) = 660
    expect(total).toBeCloseTo(660, 4);
  });

  test("연령-혼인 상관 보존: 20~24세는 미혼>기혼, 40~44세는 기혼>미혼", () => {
    const pop = synthesizePopulation(snap);
    const w = (age: string, m: string) =>
      pop.filter((p) => p.attrs["연령"] === age && p.attrs["혼인"] === m).reduce((s, p) => s + p.weight, 0);
    expect(w("20~24세", "미혼")).toBeGreaterThan(w("20~24세", "기혼"));
    expect(w("40~44세", "기혼")).toBeGreaterThan(w("40~44세", "미혼"));
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/population/synthesize.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: synthesize.ts 구현**

`src/population/synthesize.ts`:
```ts
import type { Persona, Provenance } from "../types.js";
import type { ConditionalTable, Snapshot } from "./schema.js";

export function conditionalProbs(row: (number | null)[]): number[] {
  const tot = row.reduce<number>((s, v) => s + (v ?? 0), 0);
  return row.map((v) => (v == null || tot === 0 ? 0 : v / tot));
}

function strides(sizes: number[]): number[] {
  const s = new Array(sizes.length).fill(1);
  for (let i = sizes.length - 2; i >= 0; i--) s[i] = s[i + 1] * sizes[i + 1];
  return s;
}

function attachConditional(personas: Persona[], ct: ConditionalTable): Persona[] {
  const gi = Object.fromEntries(ct.givenKeys.map((k, i) => [k, i]));
  const out: Persona[] = [];
  for (const p of personas) {
    const rowIdx = gi[p.attrs[ct.given]];
    const probs = rowIdx == null ? [] : conditionalProbs(ct.matrix[rowIdx]);
    const tot = probs.reduce((a, b) => a + b, 0);
    if (tot === 0) {
      // given 값이 conditional universe 밖이거나 전부 suppressed → inferred 기본값
      out.push({
        ...p,
        attrs: { ...p.attrs, [ct.var]: "해당없음" },
        provenance: { ...p.provenance, [ct.var]: "inferred" as Provenance },
      });
      continue;
    }
    for (let v = 0; v < ct.varKeys.length; v++) {
      if (probs[v] <= 0) continue;
      const flags = [...(p.flags ?? [])];
      if (ct.bridge) flags.push(`bridge:${ct.bridge}`);
      out.push({
        ...p,
        attrs: { ...p.attrs, [ct.var]: ct.varKeys[v] },
        weight: p.weight * probs[v],
        provenance: { ...p.provenance, [ct.var]: "conditioned" as Provenance },
        flags,
      });
    }
  }
  return out;
}

export function synthesizePopulation(
  snapshot: Snapshot,
  opts?: { minCellWeight?: number },
): Persona[] {
  const { core, conditional } = snapshot;
  const sizes = core.dims.map((d) => core.categories[d].length);
  const st = strides(sizes);
  const N = sizes.reduce((a, b) => a * b, 1);

  let pop: Persona[] = [];
  for (let i = 0; i < N; i++) {
    const w = core.counts[i];
    if (!(w > 0)) continue;
    const attrs: Record<string, string> = {};
    const provenance: Record<string, Provenance> = {};
    for (let d = 0; d < core.dims.length; d++) {
      const c = Math.floor(i / st[d]) % sizes[d];
      const dim = core.dims[d];
      attrs[dim] = core.categories[dim][c];
      provenance[dim] = "matched";
    }
    if (attrs["연령"] === "15세미만") continue; // 응답자 universe 15세+
    pop.push({ id: "tmp", attrs, weight: w, provenance, flags: [] });
  }

  for (const ct of conditional) pop = attachConditional(pop, ct);

  const minW = opts?.minCellWeight ?? 0;
  return pop.map((p, i) => {
    const flags = p.weight < minW ? [...(p.flags ?? []), "low-confidence"] : p.flags;
    return { ...p, id: `p${i + 1}`, flags };
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/population/synthesize.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 린트 + 커밋**

```bash
npm run lint || npm run format
git add src/population/synthesize.ts src/population/synthesize.test.ts
git commit -m "feat: synthesizePopulation (가중 열거 + 조건부 부착 + provenance/bridge/15세+)"
```

---

### Task 5: sampleForSimulation + PersonaSource/CensusPopulation + 공개 API

**Files:**
- Create: `src/population/source.ts`, `src/population/source.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `Persona`; `makeRng` (`../personas/sample.js`); `Snapshot`; `synthesizePopulation`
- Produces:
  - `function sampleForSimulation(personas: Persona[], n: number, seed: number): Persona[]` — weight 비례 추출(결정적).
  - `interface PersonaSource { population(): Promise<Persona[]> }`
  - `class CensusPopulation implements PersonaSource` — 생성자 `(snapshot: Snapshot)`.
  - `src/index.ts`에서 population 모듈 export.

- [ ] **Step 1: 실패 테스트 작성**

`src/population/source.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import type { Persona } from "../types.js";
import { CensusPopulation, sampleForSimulation } from "./source.js";
import type { Snapshot } from "./schema.js";

const personas: Persona[] = [
  { id: "a", attrs: { x: "A" }, weight: 1 },
  { id: "b", attrs: { x: "B" }, weight: 99 },
];

describe("sampleForSimulation", () => {
  test("같은 시드는 같은 결과(결정적)", () => {
    const s1 = sampleForSimulation(personas, 20, 7);
    const s2 = sampleForSimulation(personas, 20, 7);
    expect(s1.map((p) => p.attrs.x)).toEqual(s2.map((p) => p.attrs.x));
  });
  test("weight 비례: 무거운 쪽이 압도적으로 많이 뽑힘", () => {
    const s = sampleForSimulation(personas, 200, 1);
    const b = s.filter((p) => p.attrs.x === "B").length;
    expect(b).toBeGreaterThan(150); // 99% 가중
  });
});

describe("CensusPopulation", () => {
  test("스냅샷에서 population을 생성한다", async () => {
    const snap: Snapshot = {
      meta: { year: 2024, geographyLevel: "권역", generatedAt: "x", sources: [], ageBins: ["20~24세"], weightUnit: "person_count" },
      core: { dims: ["성", "연령", "지역"], categories: { 성: ["남자"], 연령: ["20~24세"], 지역: ["수도권"] }, counts: [100] },
      conditional: [],
    };
    const pop = await new CensusPopulation(snap).population();
    expect(pop.length).toBeGreaterThan(0);
    expect(pop[0].weight).toBe(100);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/population/source.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: source.ts 구현**

`src/population/source.ts`:
```ts
import { makeRng } from "../personas/sample.js";
import type { Persona } from "../types.js";
import type { Snapshot } from "./schema.js";
import { synthesizePopulation } from "./synthesize.js";

export function sampleForSimulation(personas: Persona[], n: number, seed: number): Persona[] {
  const total = personas.reduce((s, p) => s + p.weight, 0);
  const rng = makeRng(seed);
  const out: Persona[] = [];
  for (let k = 0; k < n; k++) {
    let r = rng() * total;
    let pick = personas[personas.length - 1];
    for (const p of personas) {
      r -= p.weight;
      if (r <= 0) {
        pick = p;
        break;
      }
    }
    out.push({ ...pick, id: `s${k + 1}` });
  }
  return out;
}

export interface PersonaSource {
  population(): Promise<Persona[]>;
}

export class CensusPopulation implements PersonaSource {
  constructor(private snapshot: Snapshot) {}
  async population(): Promise<Persona[]> {
    return synthesizePopulation(this.snapshot);
  }
}
```

- [ ] **Step 4: index.ts export 추가**

`src/index.ts`에 추가:
```ts
export type { Snapshot, SnapshotMeta, CoreJoint, ConditionalTable } from "./population/schema.js";
export { loadSnapshot } from "./population/loader.js";
export { synthesizePopulation, conditionalProbs } from "./population/synthesize.js";
export { sampleForSimulation, CensusPopulation, type PersonaSource } from "./population/source.js";
```

- [ ] **Step 5: 통과 + 전체 게이트**

Run: `npx vitest run src/population/source.test.ts && npm run lint && npm test && npm run build`
Expected: 모두 통과(전체 스위트에 population 테스트 포함).

- [ ] **Step 6: 커밋**

```bash
git add src/population/source.ts src/population/source.test.ts src/index.ts
git commit -m "feat: sampleForSimulation(weight 비례) + CensusPopulation + 공개 API"
```

---

### Task 6: refresh-census 스크립트 (라이브 스냅샷 생성)

**Files:**
- Create: `scripts/build-region-core.ts`, `scripts/build-region-core.test.ts` (순수 집계 헬퍼)
- Create: `scripts/refresh-census.ts` (라이브 main — 키 필요)
- Create(런타임 산출): `data/census/kr-2024.json`, `data/census/manifest.json`
- Modify: `.gitignore`(필요 없음 — 스냅샷은 커밋 대상), `tsconfig.json`/`tsup.config.ts`(`scripts` 포함)

**Interfaces:**
- Consumes: `KosisSource`, `parseKosisRows`, `rowsToCrossTable`; `Snapshot`/`CoreJoint`/`ConditionalTable`
- Produces:
  - `function aggregateSidoToRegion(rows: KosisRow[], regionMapping: Record<string,string[]>, sexKeys: string[], ageKeys: string[]): CoreJoint` — 시도 행을 권역으로 합산해 성×연령×권역 CoreJoint 생성. (순수, 테스트 가능)
  - `scripts/refresh-census.ts` `main()` — 라이브 호출로 3개 표 받아 Snapshot+manifest 작성(키 필요, CI 제외).

- [ ] **Step 1: 실패 테스트 작성 (순수 집계 헬퍼만)**

`scripts/build-region-core.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { aggregateSidoToRegion } from "./build-region-core.js";
import { parseKosisRows } from "../src/data/kosis-source.js";

// DT_1IN1509 형태: C1=지역(시도), C2=성, C3=연령, ITM=세대구성(여기선 일반가구원 사용)
const rows = parseKosisRows([
  { C1_NM: "서울특별시", C2_NM: "남자", C3_NM: "20~24세", ITM_NM: "일반가구원", DT: "100" },
  { C1_NM: "경기도", C2_NM: "남자", C3_NM: "20~24세", ITM_NM: "일반가구원", DT: "50" },
  { C1_NM: "부산광역시", C2_NM: "남자", C3_NM: "20~24세", ITM_NM: "일반가구원", DT: "30" },
]);

describe("aggregateSidoToRegion", () => {
  test("시도를 권역으로 합산한다", () => {
    const core = aggregateSidoToRegion(
      rows.filter((r) => r.item === "일반가구원"),
      { 수도권: ["서울특별시", "경기도", "인천광역시"], 비수도권: ["부산광역시"] },
      ["남자"],
      ["20~24세"],
    );
    expect(core.dims).toEqual(["성", "연령", "지역"]);
    // 남자×20~24세×수도권 = 100+50 = 150, 비수도권 = 30
    const idx = (s: number, a: number, r: number) => s * (1 * 2) + a * 2 + r;
    expect(core.counts[idx(0, 0, 0)]).toBe(150);
    expect(core.counts[idx(0, 0, 1)]).toBe(30);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run scripts/build-region-core.test.ts`
Expected: FAIL (모듈 없음). (vitest include에 `scripts/**/*.test.ts` 추가 필요 — 아래 Step 4)

- [ ] **Step 3: build-region-core.ts 구현**

`scripts/build-region-core.ts`:
```ts
import type { KosisRow } from "../src/data/kosis-source.js";
import type { CoreJoint } from "../src/population/schema.js";

export function aggregateSidoToRegion(
  rows: KosisRow[],
  regionMapping: Record<string, string[]>,
  sexKeys: string[],
  ageKeys: string[],
): CoreJoint {
  const regionKeys = Object.keys(regionMapping);
  const sidoToRegion: Record<string, string> = {};
  for (const [region, sidos] of Object.entries(regionMapping))
    for (const s of sidos) sidoToRegion[s] = region;

  const si = Object.fromEntries(sexKeys.map((k, i) => [k, i]));
  const ai = Object.fromEntries(ageKeys.map((k, i) => [k, i]));
  const ri = Object.fromEntries(regionKeys.map((k, i) => [k, i]));
  const counts = new Array(sexKeys.length * ageKeys.length * regionKeys.length).fill(0);
  const stride = [ageKeys.length * regionKeys.length, regionKeys.length, 1];

  for (const r of rows) {
    if (r.value == null) continue;
    const region = sidoToRegion[r.c1nm];
    const s = si[r.c2nm ?? ""];
    const a = ai[r.c3nm ?? ""];
    if (region == null || s == null || a == null) continue;
    counts[s * stride[0] + a * stride[1] + ri[region] * stride[2]] += r.value;
  }
  return {
    dims: ["성", "연령", "지역"],
    categories: { 성: sexKeys, 연령: ageKeys, 지역: regionKeys },
    counts,
  };
}
```

- [ ] **Step 4: vitest/tsconfig가 scripts를 포함하도록 설정**

`vitest.config.ts`의 `include`에 추가: `"scripts/**/*.test.ts"`.
`tsconfig.json`의 `include`에 `"scripts"` 추가.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run scripts/build-region-core.test.ts`
Expected: PASS

- [ ] **Step 6: refresh-census.ts main 작성 (라이브, 단위테스트 없음)**

`scripts/refresh-census.ts` — `KosisSource`로 3개 표를 받아 `aggregateSidoToRegion`으로 core 생성, `DT_1MR2060`(연령×혼인)·`DT_1JC1511`(연령×가구원수)를 `ConditionalTable`로 변환, `Snapshot`+`manifest`를 `data/census/`에 기록한다. `node:fs`로 write. (정확한 objL/itmId 파라미터는 라이브 정찰에서 확인된 값 사용: `DT_1JC1511`은 objL1=00·objL2=ALL·itmId=ALL·colAxis="item"; `DT_1IN1509`는 objL1/2/3=ALL·itmId=ALL·성=c2nm·연령=c3nm·지역=c1nm; suppressed "X"→null.) main 가드는 기존 패턴(`process.argv[1]?.endsWith("refresh-census.js")`).

```ts
// 골격 — 라이브 호출부는 정찰값 사용. (실행: node --env-file=.env dist/scripts/refresh-census.js)
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
// ... KosisSource import, build core+conditionals, assemble Snapshot+manifest, write JSON ...
```

> 주: 이 main은 키·네트워크 필요 → CI/단위테스트 제외. 순수 변환 헬퍼(`aggregateSidoToRegion`)만 테스트.

- [ ] **Step 7: 빌드 설정에 scripts 엔트리 추가 + 게이트**

`tsup.config.ts`의 `entry`에 `"scripts/refresh-census.ts"` 추가.
Run: `npm run lint && npm test && npm run build`
Expected: 모두 통과(단위테스트는 헬퍼만; 전체 그린).

- [ ] **Step 8: 커밋**

```bash
git add scripts/ vitest.config.ts tsconfig.json tsup.config.ts
git commit -m "feat: refresh-census 스크립트(라이브 스냅샷 생성) + 권역 집계 헬퍼"
```

- [ ] **Step 9: (라이브, 수동) 실제 스냅샷 생성 — 키 필요**

빌드 후 `.env`의 `KOSIS_API_KEY`로 실제 스냅샷 생성:
Run: `npm run build && node --env-file=.env dist/scripts/refresh-census.js`
Expected: `data/census/kr-2024.json` + `manifest.json` 생성. 그 뒤 `synthesizePopulation(loadSnapshot(...))`로 실제 5속성 페르소나가 나오는지 수동 확인 후 스냅샷 커밋:
```bash
git add data/census/kr-2024.json data/census/manifest.json
git commit -m "data: 2024 인구총조사 합성 인구 스냅샷(권역) 추가"
```

---

## Self-Review

**Spec coverage (스펙 6절 3A 범위 대비):**
- Persona weight/provenance/flags → Task 1 ✅
- c3nm 엔진 보강 → Task 2 ✅
- 스냅샷 스키마(universe/denominator/manifest/missingPolicy/regionMapping) + frame 가드 → Task 3 ✅
- synthesize(가중 열거 + 조건부 부착 + universe 15+ + suppressed 정규화 + bridge flag + provenance) → Task 4 ✅
- sampleForSimulation + PersonaSource/CensusPopulation + export → Task 5 ✅
- refresh 스크립트 + 권역 집계 + 라이브 스냅샷 → Task 6 ✅
- **runStudy 통합은 2층 기능점검 단계로 이월**(3A는 population 생성·검증까지; runStudy에 PersonaSource 연결은 LLM 점검 때) — 의도적 범위 조정.
- fidelity 리포트 → **Plan 3B**(별도).

**Placeholder scan:** Task 6 Step 6의 refresh main은 "골격"으로 표기 — 라이브 코드라 정찰 파라미터를 명시했고 순수 헬퍼는 완전 구현/테스트됨. 그 외 모든 코드 스텝은 완전한 코드 포함.

**Type consistency:** `Persona.weight`(T1) ↔ synthesize/source(T4·5) 일치. `Snapshot`/`CoreJoint`/`ConditionalTable`(T3) ↔ synthesize·refresh(T4·6) 일치. `KosisRow.c3nm`/`KosisAxis "c3nm"`(T2) ↔ refresh 집계(T6) 일치. `conditionalProbs`/`synthesizePopulation`/`sampleForSimulation`/`CensusPopulation` 시그니처 정의·소비 일치. index export 이름 모듈 실제 export와 일치.

**남은 메모:** suppressed→null은 스냅샷 생성(refresh)에서 처리되어 `ConditionalTable.matrix`에 null로 들어오고, synthesize의 `conditionalProbs`가 null을 분모서 제외. structural zero("-")는 refresh에서 0으로 기록.

# Core Engine Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통계청(또는 번들 샘플) 분포 → IPF 결합분포 → 페르소나 샘플 → LLM 시뮬 → 불확실성 집계까지, CLI로 한 번에 돌아가는 코어 엔진을 완성한다.

**Architecture:** 순수 함수 파이프라인(접근 A). 각 단계는 입력→출력만 갖는 독립 모듈이고 얇은 `runStudy()` 오케스트레이터가 연결한다. 데이터 소스와 LLM 제공자는 인터페이스 뒤에 숨겨 mock/sample로 LLM·네트워크 없이 테스트한다.

**Tech Stack:** TypeScript, Node 24(네이티브 TS 실행·`--env-file`·`node:util parseArgs`), vitest(테스트), fast-check(property test), Biome(lint/format), tsup(빌드), `@anthropic-ai/sdk`(유일한 런타임 외부 의존성).

## Global Constraints

- 런타임 외부 의존성은 `@anthropic-ai/sdk` 하나뿐. IPF·샘플링·KOSIS·집계·CLI는 무의존(Node 내장만).
- 키 없이 `npm install && npm test`가 항상 초록불. Claude 키는 실제 시뮬레이션 때만 필요.
- 모든 무작위성은 시드 주입(`seed`)으로 결정적이어야 한다(테스트 재현성).
- 결합분포 마진 타깃은 사용 전 합=1로 정규화한다(검증 스파이크에서 확인된 IPF 수렴 조건).
- 언어 TypeScript, 모듈 ESM(`"type": "module"`). 들여쓰기 2칸.
- 라이선스 MIT. 작업명 `synth-persona`.

---

### Task 1: 프로젝트 스캐폴드 & 도구

**Files:**
- Create: `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `LICENSE`, `src/smoke.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `npm test`/`npm run build`/`npm run lint` 스크립트, ESM+TS 환경.

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "synth-persona",
  "version": "0.0.0",
  "type": "module",
  "license": "MIT",
  "bin": { "synth-persona": "dist/cli/main.js" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsup",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "fast-check": "^3.22.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: tsconfig.json / biome.json / vitest.config.ts / tsup 설정**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "cli", "test"]
}
```

`biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "formatter": { "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts", "test/**/*.test.ts"] } });
```

`tsup.config.ts`:
```ts
import { defineConfig } from "tsup";
export default defineConfig({ entry: ["src/index.ts", "cli/main.ts"], format: ["esm"], clean: true });
```

`.gitignore`:
```
node_modules/
dist/
.env
eval/report/*.html
```

`.env.example`:
```
ANTHROPIC_API_KEY=
KOSIS_API_KEY=
```

`LICENSE`: 표준 MIT 텍스트(연도 2026, 저작자 본인 이름).

- [ ] **Step 3: 스모크 테스트 작성**

`src/smoke.test.ts`:
```ts
import { expect, test } from "vitest";
test("toolchain runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 4: 설치 후 테스트 실행 → 통과 확인**

Run: `npm install && npm test`
Expected: 1 passed (smoke.test.ts)

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "chore: 프로젝트 스캐폴드 (TS+vitest+biome+tsup)"
```

---

### Task 2: 공유 타입 + IPF 엔진

**Files:**
- Create: `src/types.ts`, `src/personas/ipf.ts`, `src/personas/ipf.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `interface Dimension { name: string; categories: string[] }`
  - `interface CrossTable { dims: [string, string]; matrix: number[][] }`
  - `interface Distribution { dimensions: Dimension[]; marginals: Record<string, number[]>; crossTables?: CrossTable[] }`
  - `interface JointDistribution { dimensions: Dimension[]; cells: Float64Array }`
  - `function ipf(dist: Distribution, opts?: { iterations?: number }): JointDistribution` — 결합분포 텐서를 반환(row-major, dimension 순서대로 mixed-radix).

- [ ] **Step 1: 실패 테스트 작성**

`src/personas/ipf.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { ipf } from "./ipf.js";
import type { Distribution } from "../types.js";

const baseDist = (): Distribution => ({
  dimensions: [
    { name: "age", categories: ["20s", "30s", "40s", "50s"] },
    { name: "hh", categories: ["1", "2", "3", "4+"] },
  ],
  marginals: {},
  crossTables: [
    {
      dims: ["age", "hh"],
      matrix: [
        [0.115, 0.07, 0.03, 0.025],
        [0.085, 0.08, 0.045, 0.04],
        [0.06, 0.06, 0.07, 0.09],
        [0.09, 0.07, 0.055, 0.055],
      ],
    },
  ],
});

const cellSum = (j: { cells: Float64Array }) => j.cells.reduce((a, b) => a + b, 0);

describe("ipf", () => {
  test("결합분포 합은 1 (정규화)", () => {
    const j = ipf(baseDist());
    expect(cellSum(j)).toBeCloseTo(1, 6);
  });

  test("모든 셀은 음수가 아니다", () => {
    const j = ipf(baseDist());
    expect(j.cells.every((v) => v >= 0)).toBe(true);
  });

  test("2-way 교차표 타깃을 복원한다", () => {
    const d = baseDist();
    const j = ipf(d);
    // age=2(40s), hh=3(4+) 셀 합이 타깃과 일치해야 함
    const ai = 2, hi = 3;
    let s = 0;
    for (let a = 0; a < 4; a++)
      for (let h = 0; h < 4; h++)
        if (a === ai && h === hi) s += j.cells[a * 4 + h];
    const targetTotal = d.crossTables![0].matrix.flat().reduce((x, y) => x + y, 0);
    expect(s).toBeCloseTo(0.09 / targetTotal, 4);
  });

  test("property: 1-way 마진 타깃을 항상 복원한다", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.05, max: 1, noNaN: true }), { minLength: 2, maxLength: 2 }),
        (sexRaw) => {
          const total = sexRaw[0] + sexRaw[1];
          const sex = sexRaw.map((v) => v / total);
          const d: Distribution = {
            dimensions: [
              { name: "age", categories: ["20s", "30s"] },
              { name: "sex", categories: ["m", "f"] },
            ],
            marginals: { sex },
            crossTables: [],
          };
          const j = ipf(d);
          // sex 마진 복원 확인
          let m = 0, f = 0;
          for (let a = 0; a < 2; a++) { m += j.cells[a * 2 + 0]; f += j.cells[a * 2 + 1]; }
          expect(m).toBeCloseTo(sex[0], 4);
          expect(f).toBeCloseTo(sex[1], 4);
        },
      ),
      { numRuns: 50 },
    );
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/personas/ipf.test.ts`
Expected: FAIL ("Cannot find module './ipf.js'" 또는 ipf is not a function)

- [ ] **Step 3: types.ts + ipf.ts 구현**

`src/types.ts`:
```ts
export interface Dimension {
  name: string;
  categories: string[];
}
export interface CrossTable {
  dims: [string, string];
  matrix: number[][];
}
export interface Distribution {
  dimensions: Dimension[];
  marginals: Record<string, number[]>;
  crossTables?: CrossTable[];
}
export interface JointDistribution {
  dimensions: Dimension[];
  cells: Float64Array; // row-major, dimension 순서 mixed-radix
}
export interface Persona {
  id: string;
  attrs: Record<string, string>;
}
export interface Response {
  persona: Persona;
  answer: string;
  choice?: string;
}
export interface SegmentResult {
  signal: "consensus" | "split";
  breakdown: Record<string, number>;
}
export interface StudyResult {
  responses: Response[];
  signal: "consensus" | "split";
  dispersion: number;
  bySegment: Record<string, Record<string, SegmentResult>>;
  missing?: { personaId: string; reason: string }[];
}
```

`src/personas/ipf.ts`:
```ts
import type { Distribution, JointDistribution } from "../types.js";

function strides(sizes: number[]): number[] {
  const s = new Array(sizes.length).fill(1);
  for (let i = sizes.length - 2; i >= 0; i--) s[i] = s[i + 1] * sizes[i + 1];
  return s;
}

function normalize(vec: number[]): number[] {
  const t = vec.reduce((a, b) => a + b, 0);
  return t > 0 ? vec.map((v) => v / t) : vec.map(() => 0);
}

export function ipf(dist: Distribution, opts?: { iterations?: number }): JointDistribution {
  const iterations = opts?.iterations ?? 50;
  const sizes = dist.dimensions.map((d) => d.categories.length);
  const dimIndex = Object.fromEntries(dist.dimensions.map((d, i) => [d.name, i]));
  const st = strides(sizes);
  const N = sizes.reduce((a, b) => a * b, 1);
  const cells = new Float64Array(N).fill(1 / N);

  // 셀 i의 특정 차원 d 값(category index)
  const coord = (i: number, d: number) => Math.floor(i / st[d]) % sizes[d];

  for (let iter = 0; iter < iterations; iter++) {
    // 1-way 마진 적합
    for (const [name, rawTarget] of Object.entries(dist.marginals)) {
      const d = dimIndex[name];
      if (d == null) continue;
      const target = normalize(rawTarget);
      const cur = new Array(sizes[d]).fill(0);
      for (let i = 0; i < N; i++) cur[coord(i, d)] += cells[i];
      for (let i = 0; i < N; i++) {
        const c = coord(i, d);
        if (cur[c] > 0) cells[i] *= target[c] / cur[c];
      }
    }
    // 2-way 교차표 적합
    for (const ct of dist.crossTables ?? []) {
      const da = dimIndex[ct.dims[0]];
      const db = dimIndex[ct.dims[1]];
      if (da == null || db == null) continue;
      const flatTotal = ct.matrix.flat().reduce((a, b) => a + b, 0);
      const cur: number[][] = Array.from({ length: sizes[da] }, () => new Array(sizes[db]).fill(0));
      for (let i = 0; i < N; i++) cur[coord(i, da)][coord(i, db)] += cells[i];
      for (let i = 0; i < N; i++) {
        const ca = coord(i, da);
        const cb = coord(i, db);
        const tgt = flatTotal > 0 ? ct.matrix[ca][cb] / flatTotal : 0;
        if (cur[ca][cb] > 0) cells[i] *= tgt / cur[ca][cb];
      }
    }
  }
  return { dimensions: dist.dimensions, cells };
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/personas/ipf.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/types.ts src/personas/ipf.ts src/personas/ipf.test.ts
git commit -m "feat: IPF 엔진 + 공유 타입 (계층1 불변식 테스트 포함)"
```

---

### Task 3: 페르소나 샘플링 (결합분포 → 페르소나)

**Files:**
- Create: `src/personas/sample.ts`, `src/personas/sample.test.ts`

**Interfaces:**
- Consumes: `JointDistribution`, `Persona`, `Dimension` (`../types.js`)
- Produces:
  - `function makeRng(seed: number): () => number` — 결정적 PRNG(mulberry32).
  - `function samplePersonas(joint: JointDistribution, n: number, seed?: number): Persona[]` — 결합분포 가중치로 N명 추출, `attrs`는 차원명→카테고리.

- [ ] **Step 1: 실패 테스트 작성**

`src/personas/sample.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { makeRng, samplePersonas } from "./sample.js";
import type { JointDistribution } from "../types.js";

const joint = (): JointDistribution => ({
  dimensions: [
    { name: "age", categories: ["20s", "40s"] },
    { name: "hh", categories: ["1", "4+"] },
  ],
  // 20s-1인 0.5, 20s-4+ 0.0, 40s-1인 0.0, 40s-4+ 0.5  (강한 상관)
  cells: new Float64Array([0.5, 0.0, 0.0, 0.5]),
});

describe("samplePersonas", () => {
  test("같은 시드는 같은 결과(결정적)", () => {
    const a = samplePersonas(joint(), 20, 123);
    const b = samplePersonas(joint(), 20, 123);
    expect(a).toEqual(b);
  });

  test("페르소나 attrs는 차원명 키를 갖는다", () => {
    const [p] = samplePersonas(joint(), 1, 1);
    expect(Object.keys(p.attrs).sort()).toEqual(["age", "hh"]);
    expect(p.id).toBeTruthy();
  });

  test("가중치 0인 조합은 절대 나오지 않는다(상관 보존)", () => {
    const ps = samplePersonas(joint(), 200, 7);
    const bad = ps.filter((p) => (p.attrs.age === "20s" && p.attrs.hh === "4+") || (p.attrs.age === "40s" && p.attrs.hh === "1"));
    expect(bad.length).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/personas/sample.test.ts`
Expected: FAIL (module/함수 없음)

- [ ] **Step 3: sample.ts 구현**

`src/personas/sample.ts`:
```ts
import type { JointDistribution, Persona } from "../types.js";

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function samplePersonas(joint: JointDistribution, n: number, seed = 1): Persona[] {
  const sizes = joint.dimensions.map((d) => d.categories.length);
  const st = new Array(sizes.length).fill(1);
  for (let i = sizes.length - 2; i >= 0; i--) st[i] = st[i + 1] * sizes[i + 1];
  const total = joint.cells.reduce((a, b) => a + b, 0);
  const rng = makeRng(seed);
  const out: Persona[] = [];
  for (let k = 0; k < n; k++) {
    let r = rng() * total;
    let idx = 0;
    for (let i = 0; i < joint.cells.length; i++) {
      r -= joint.cells[i];
      if (r <= 0) { idx = i; break; }
      idx = i;
    }
    const attrs: Record<string, string> = {};
    for (let d = 0; d < joint.dimensions.length; d++) {
      const c = Math.floor(idx / st[d]) % sizes[d];
      attrs[joint.dimensions[d].name] = joint.dimensions[d].categories[c];
    }
    out.push({ id: `p${k + 1}`, attrs });
  }
  return out;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/personas/sample.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/personas/sample.ts src/personas/sample.test.ts
git commit -m "feat: 결정적 페르소나 샘플링 (상관 보존 검증)"
```

---

### Task 4: DataSource 인터페이스 + 번들 샘플 소스

**Files:**
- Create: `src/data/source.ts`, `src/data/sample-source.ts`, `data/samples/kr-census-sample.json`, `src/data/sample-source.test.ts`

**Interfaces:**
- Consumes: `Distribution` (`../types.js`)
- Produces:
  - `interface DistSpec { year?: string; dimensions?: string[] }`
  - `interface DataSource { getDistribution(spec?: DistSpec): Promise<Distribution> }`
  - `class SampleSource implements DataSource` — 번들 JSON을 읽어 `Distribution` 반환.

- [ ] **Step 1: 번들 샘플 JSON 작성**

`data/samples/kr-census-sample.json` (검증 스파이크의 분포를 그대로 사용):
```json
{
  "dimensions": [
    { "name": "age", "categories": ["20대", "30대", "40대", "50대"] },
    { "name": "sex", "categories": ["남", "여"] },
    { "name": "region", "categories": ["수도권", "비수도권"] },
    { "name": "hh", "categories": ["1인가구", "2인가구", "3인가구", "4인이상"] }
  ],
  "marginals": {
    "sex": [0.5, 0.5],
    "region": [0.5, 0.5]
  },
  "crossTables": [
    {
      "dims": ["age", "hh"],
      "matrix": [
        [0.115, 0.07, 0.03, 0.025],
        [0.085, 0.08, 0.045, 0.04],
        [0.06, 0.06, 0.07, 0.09],
        [0.09, 0.07, 0.055, 0.055]
      ]
    }
  ]
}
```

- [ ] **Step 2: 실패 테스트 작성**

`src/data/sample-source.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { SampleSource } from "./sample-source.js";

describe("SampleSource", () => {
  test("번들 분포를 로드한다", async () => {
    const dist = await new SampleSource().getDistribution();
    expect(dist.dimensions.map((d) => d.name)).toEqual(["age", "sex", "region", "hh"]);
    expect(dist.crossTables?.[0].dims).toEqual(["age", "hh"]);
    expect(dist.marginals.sex).toEqual([0.5, 0.5]);
  });
});
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/data/sample-source.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 4: source.ts + sample-source.ts 구현**

`src/data/source.ts`:
```ts
import type { Distribution } from "../types.js";

export interface DistSpec {
  year?: string;
  dimensions?: string[];
}
export interface DataSource {
  getDistribution(spec?: DistSpec): Promise<Distribution>;
}
```

`src/data/sample-source.ts`:
```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Distribution } from "../types.js";
import type { DataSource, DistSpec } from "./source.js";

const SAMPLE_PATH = fileURLToPath(new URL("../../data/samples/kr-census-sample.json", import.meta.url));

export class SampleSource implements DataSource {
  constructor(private path: string = SAMPLE_PATH) {}
  async getDistribution(_spec?: DistSpec): Promise<Distribution> {
    const raw = await readFile(this.path, "utf8");
    return JSON.parse(raw) as Distribution;
  }
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/data/sample-source.test.ts`
Expected: PASS (1 test)

- [ ] **Step 6: 커밋**

```bash
git add src/data/source.ts src/data/sample-source.ts data/samples/kr-census-sample.json src/data/sample-source.test.ts
git commit -m "feat: DataSource 인터페이스 + 번들 샘플 소스"
```

---

### Task 5: KOSIS 소스 (URL 빌드 · 파싱 · Distribution 변환)

**Files:**
- Create: `src/data/kosis-source.ts`, `src/data/kosis-source.test.ts`

**Interfaces:**
- Consumes: `Distribution`, `DataSource`, `DistSpec`
- Produces:
  - `interface KosisRow { period: string; c1nm: string; c2nm: string | null; value: number | null }`
  - `function buildKosisUrl(p: { apiKey: string; tblId: string; orgId?: string; objL1?: string; objL2?: string; prdSe?: string; startPrdDe?: string; endPrdDe?: string; itmId?: string }): string`
  - `function parseKosisRows(json: unknown): KosisRow[]` — KOSIS 에러객체(`{err,errMsg}`)는 throw.
  - `function rowsToCrossTable(rows: KosisRow[], rowKeys: string[], colKeys: string[]): number[][]`
  - `class KosisSource implements DataSource` — 생성자 `(opts: { apiKey: string; ... })`, `getDistribution`에서 fetch→parse→변환.

- [ ] **Step 1: 실패 테스트 작성** (검증 스파이크의 mock 그대로 이식)

`src/data/kosis-source.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { buildKosisUrl, parseKosisRows, rowsToCrossTable } from "./kosis-source.js";

const mock = [
  { PRD_DE: "2020", C1: "20", C1_NM: "20대", C2: "1", C2_NM: "1인가구", ITM_NM: "가구수", DT: "1500000", UNIT_NM: "가구" },
  { PRD_DE: "2020", C1: "20", C1_NM: "20대", C2: "4", C2_NM: "4인이상", ITM_NM: "가구수", DT: "120000", UNIT_NM: "가구" },
  { PRD_DE: "2020", C1: "40", C1_NM: "40대", C2: "1", C2_NM: "1인가구", ITM_NM: "가구수", DT: "600000", UNIT_NM: "가구" },
  { PRD_DE: "2020", C1: "40", C1_NM: "40대", C2: "4", C2_NM: "4인이상", ITM_NM: "가구수", DT: "1100000", UNIT_NM: "가구" },
];

describe("kosis", () => {
  test("URL 빌더는 필수 파라미터를 포함한다", () => {
    const url = buildKosisUrl({ apiKey: "K", tblId: "T1", objL1: "ALL", objL2: "ALL" });
    expect(url).toContain("statisticsParameterData.do");
    expect(url).toContain("apiKey=K");
    expect(url).toContain("tblId=T1");
    expect(url).toContain("orgId=101");
  });

  test("정상 응답을 행으로 파싱한다", () => {
    const rows = parseKosisRows(mock);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ c1nm: "20대", c2nm: "1인가구", value: 1500000 });
  });

  test("에러 응답은 throw 한다", () => {
    expect(() => parseKosisRows({ err: "20", errMsg: "인증키가 유효하지 않습니다." })).toThrow(/KOSIS/);
  });

  test("행 → 정규화 교차표", () => {
    const m = rowsToCrossTable(parseKosisRows(mock), ["20대", "40대"], ["1인가구", "4인이상"]);
    const total = m.flat().reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(m[0][0]).toBeGreaterThan(m[0][1]); // 20대는 1인가구 > 4인이상
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/data/kosis-source.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: kosis-source.ts 구현** (검증된 `kosis_client.mjs` 로직 이식 + TS화)

`src/data/kosis-source.ts`:
```ts
import type { Distribution } from "../types.js";
import type { DataSource, DistSpec } from "./source.js";

const ENDPOINT = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

export interface KosisRow {
  period: string;
  c1nm: string;
  c2nm: string | null;
  value: number | null;
}

export function buildKosisUrl(p: {
  apiKey: string;
  tblId: string;
  orgId?: string;
  objL1?: string;
  objL2?: string;
  prdSe?: string;
  startPrdDe?: string;
  endPrdDe?: string;
  itmId?: string;
}): string {
  const q = new URLSearchParams({
    method: "getList",
    apiKey: p.apiKey,
    orgId: p.orgId ?? "101",
    tblId: p.tblId,
    itmId: p.itmId ?? "T1",
    objL1: p.objL1 ?? "ALL",
    ...(p.objL2 ? { objL2: p.objL2 } : {}),
    prdSe: p.prdSe ?? "Y",
    ...(p.startPrdDe ? { startPrdDe: p.startPrdDe } : {}),
    ...(p.endPrdDe ? { endPrdDe: p.endPrdDe } : {}),
    format: "json",
    jsonVD: "Y",
  });
  return `${ENDPOINT}?${q.toString()}`;
}

export function parseKosisRows(json: unknown): KosisRow[] {
  if (!Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    const code = o?.err ?? o?.errCd ?? "?";
    const msg = o?.errMsg ?? JSON.stringify(json);
    throw new Error(`KOSIS API error [${code}]: ${msg}`);
  }
  return json.map((r: Record<string, unknown>) => ({
    period: String(r.PRD_DE ?? ""),
    c1nm: String(r.C1_NM ?? ""),
    c2nm: r.C2_NM != null ? String(r.C2_NM) : null,
    value: r.DT === "" || r.DT == null ? null : Number(r.DT),
  }));
}

export function rowsToCrossTable(rows: KosisRow[], rowKeys: string[], colKeys: string[]): number[][] {
  const ri = Object.fromEntries(rowKeys.map((k, i) => [k, i]));
  const ci = Object.fromEntries(colKeys.map((k, i) => [k, i]));
  const M = rowKeys.map(() => colKeys.map(() => 0));
  for (const r of rows) {
    if (r.value == null || r.c2nm == null) continue;
    const i = ri[r.c1nm];
    const j = ci[r.c2nm];
    if (i == null || j == null) continue;
    M[i][j] += r.value;
  }
  const tot = M.flat().reduce((a, b) => a + b, 0);
  if (tot > 0) for (let i = 0; i < M.length; i++) for (let j = 0; j < M[i].length; j++) M[i][j] /= tot;
  return M;
}

export interface KosisOpts {
  apiKey: string;
  tblId: string;
  rowDim: { name: string; keys: string[] };
  colDim: { name: string; keys: string[] };
  objL1?: string;
  objL2?: string;
  fetchImpl?: typeof fetch;
}

export class KosisSource implements DataSource {
  constructor(private opts: KosisOpts) {}
  async getDistribution(_spec?: DistSpec): Promise<Distribution> {
    const f = this.opts.fetchImpl ?? fetch;
    const url = buildKosisUrl({ apiKey: this.opts.apiKey, tblId: this.opts.tblId, objL1: this.opts.objL1, objL2: this.opts.objL2 });
    const res = await f(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from KOSIS`);
    const rows = parseKosisRows(await res.json());
    const matrix = rowsToCrossTable(rows, this.opts.rowDim.keys, this.opts.colDim.keys);
    return {
      dimensions: [
        { name: this.opts.rowDim.name, categories: this.opts.rowDim.keys },
        { name: this.opts.colDim.name, categories: this.opts.colDim.keys },
      ],
      marginals: {},
      crossTables: [{ dims: [this.opts.rowDim.name, this.opts.colDim.name], matrix }],
    };
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/data/kosis-source.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/data/kosis-source.ts src/data/kosis-source.test.ts
git commit -m "feat: KOSIS 데이터 소스 (URL/파싱/교차표 변환, fetch 주입가능)"
```

---

### Task 6: LLMProvider 인터페이스 + Mock 제공자

**Files:**
- Create: `src/llm/provider.ts`, `src/llm/mock.ts`, `src/llm/mock.test.ts`

**Interfaces:**
- Consumes: `Persona` (`../types.js`)
- Produces:
  - `interface LLMProvider { ask(persona: Persona, prompt: string): Promise<string> }`
  - `class MockProvider implements LLMProvider` — 생성자 `(fn: (persona, prompt) => string)`로 결정적 응답 주입.

- [ ] **Step 1: 실패 테스트 작성**

`src/llm/mock.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { MockProvider } from "./mock.js";

describe("MockProvider", () => {
  test("주입 함수의 응답을 반환한다", async () => {
    const p = new MockProvider((persona) => (persona.attrs.age === "20대" ? "A" : "B"));
    expect(await p.ask({ id: "1", attrs: { age: "20대" } }, "q")).toBe("A");
    expect(await p.ask({ id: "2", attrs: { age: "40대" } }, "q")).toBe("B");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/llm/mock.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: provider.ts + mock.ts 구현**

`src/llm/provider.ts`:
```ts
import type { Persona } from "../types.js";

export interface LLMProvider {
  ask(persona: Persona, prompt: string): Promise<string>;
}
```

`src/llm/mock.ts`:
```ts
import type { Persona } from "../types.js";
import type { LLMProvider } from "./provider.js";

export class MockProvider implements LLMProvider {
  constructor(private fn: (persona: Persona, prompt: string) => string) {}
  async ask(persona: Persona, prompt: string): Promise<string> {
    return this.fn(persona, prompt);
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/llm/mock.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add src/llm/provider.ts src/llm/mock.ts src/llm/mock.test.ts
git commit -m "feat: LLMProvider 인터페이스 + Mock 제공자"
```

---

### Task 7: Claude 어댑터

**Files:**
- Create: `src/llm/claude.ts`, `src/llm/claude.test.ts`

**Interfaces:**
- Consumes: `LLMProvider`, `Persona`
- Produces:
  - `function personaSystemPrompt(persona: Persona): string` — 페르소나 속성을 시스템 프롬프트로.
  - `class ClaudeProvider implements LLMProvider` — 생성자 `(opts?: { apiKey?: string; model?: string; client?: { messages: { create: Function } } })`. SDK 클라이언트 주입 가능(테스트용).

**구현 메모:** 정확한 모델 ID는 claude-api 스킬 레퍼런스로 확정한다. 기본값은 비용 우선 저가 모델(Haiku 계열). 환경변수 `ANTHROPIC_API_KEY` 사용.

- [ ] **Step 1: 실패 테스트 작성** (실제 네트워크 없이, client 주입으로)

`src/llm/claude.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { ClaudeProvider, personaSystemPrompt } from "./claude.js";

describe("ClaudeProvider", () => {
  test("페르소나 시스템 프롬프트에 속성이 들어간다", () => {
    const s = personaSystemPrompt({ id: "1", attrs: { age: "40대", region: "수도권" } });
    expect(s).toContain("40대");
    expect(s).toContain("수도권");
  });

  test("주입된 클라이언트로 응답 텍스트를 반환한다", async () => {
    const fakeClient = {
      messages: {
        create: async () => ({ content: [{ type: "text", text: "  살래요  " }] }),
      },
    };
    const p = new ClaudeProvider({ client: fakeClient as never, model: "test-model" });
    const out = await p.ask({ id: "1", attrs: { age: "40대" } }, "이거 살래요?");
    expect(out).toBe("살래요");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/llm/claude.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: claude.ts 구현**

`src/llm/claude.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import type { Persona } from "../types.js";
import type { LLMProvider } from "./provider.js";

// 정확한 모델 ID는 claude-api 레퍼런스로 확정 — 기본값은 비용 우선
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export function personaSystemPrompt(persona: Persona): string {
  const lines = Object.entries(persona.attrs).map(([k, v]) => `- ${k}: ${v}`);
  return [
    "당신은 아래 인구통계 속성을 가진 한국의 한 사람입니다. 그 사람으로서 답하세요.",
    ...lines,
    "교과서적 평균이 아니라 이 속성을 가진 실제 개인처럼, 간결하고 솔직하게 답하세요.",
  ].join("\n");
}

interface MessagesClient {
  messages: { create: (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> };
}

export class ClaudeProvider implements LLMProvider {
  private client: MessagesClient;
  private model: string;
  constructor(opts?: { apiKey?: string; model?: string; client?: MessagesClient }) {
    this.model = opts?.model ?? DEFAULT_MODEL;
    this.client = opts?.client ?? (new Anthropic({ apiKey: opts?.apiKey ?? process.env.ANTHROPIC_API_KEY }) as unknown as MessagesClient);
  }
  async ask(persona: Persona, prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: personaSystemPrompt(persona),
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    return text.trim();
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/llm/claude.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/llm/claude.ts src/llm/claude.test.ts
git commit -m "feat: Claude 어댑터 (client 주입으로 무네트워크 테스트)"
```

---

### Task 8: 녹화/재생(VCR) 제공자 — 검증 계층 2

**Files:**
- Create: `src/llm/recorded.ts`, `src/llm/recorded.test.ts`

**Interfaces:**
- Consumes: `LLMProvider`, `Persona`
- Produces:
  - `class RecordedProvider implements LLMProvider` — 생성자 `(opts: { cassettePath: string; mode: "replay" | "record"; underlying?: LLMProvider })`. `replay`는 카세트에서, `record`는 underlying 호출 후 카세트에 기록.
  - `function cassetteKey(persona: Persona, prompt: string): string` — 결정적 키.

- [ ] **Step 1: 실패 테스트 작성**

`src/llm/recorded.test.ts`:
```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { MockProvider } from "./mock.js";
import { RecordedProvider, cassetteKey } from "./recorded.js";

const dir = mkdtempSync(join(tmpdir(), "vcr-"));
const cassette = join(dir, "c.json");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("RecordedProvider", () => {
  test("record 모드는 underlying을 호출하고 저장, replay는 재생", async () => {
    const persona = { id: "1", attrs: { age: "40대" } };
    const rec = new RecordedProvider({ cassettePath: cassette, mode: "record", underlying: new MockProvider(() => "녹화응답") });
    expect(await rec.ask(persona, "q")).toBe("녹화응답");

    // underlying 없이 replay 가능해야 함
    const play = new RecordedProvider({ cassettePath: cassette, mode: "replay" });
    expect(await play.ask(persona, "q")).toBe("녹화응답");
  });

  test("키는 결정적", () => {
    const p = { id: "x", attrs: { a: "1" } };
    expect(cassetteKey(p, "q")).toBe(cassetteKey(p, "q"));
  });

  test("replay에 없는 키는 throw", async () => {
    const play = new RecordedProvider({ cassettePath: cassette, mode: "replay" });
    await expect(play.ask({ id: "z", attrs: {} }, "없음")).rejects.toThrow(/cassette/i);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/llm/recorded.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: recorded.ts 구현**

`src/llm/recorded.ts`:
```ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Persona } from "../types.js";
import type { LLMProvider } from "./provider.js";

export function cassetteKey(persona: Persona, prompt: string): string {
  const payload = JSON.stringify({ attrs: persona.attrs, prompt });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export class RecordedProvider implements LLMProvider {
  private store: Record<string, string>;
  constructor(
    private opts: { cassettePath: string; mode: "replay" | "record"; underlying?: LLMProvider },
  ) {
    this.store = existsSync(opts.cassettePath)
      ? (JSON.parse(readFileSync(opts.cassettePath, "utf8")) as Record<string, string>)
      : {};
  }
  async ask(persona: Persona, prompt: string): Promise<string> {
    const key = cassetteKey(persona, prompt);
    if (this.opts.mode === "replay") {
      if (!(key in this.store)) throw new Error(`No cassette entry for key ${key}`);
      return this.store[key];
    }
    if (!this.opts.underlying) throw new Error("record 모드에는 underlying provider가 필요합니다");
    const answer = await this.opts.underlying.ask(persona, prompt);
    this.store[key] = answer;
    writeFileSync(this.opts.cassettePath, JSON.stringify(this.store, null, 2));
    return answer;
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/llm/recorded.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/llm/recorded.ts src/llm/recorded.test.ts
git commit -m "feat: VCR 녹화/재생 제공자 (검증 계층2 결정적 LLM)"
```

---

### Task 9: 시뮬레이션 (페르소나 × 질문 → 응답)

**Files:**
- Create: `src/simulate/simulate.ts`, `src/simulate/simulate.test.ts`

**Interfaces:**
- Consumes: `Persona`, `Response`, `LLMProvider`
- Produces:
  - `interface Question { prompt: string; choices?: string[] }`
  - `function matchChoice(answer: string, choices: string[]): string | undefined` — 답변 텍스트에서 선택지 매칭.
  - `function simulate(personas: Persona[], question: Question, provider: LLMProvider): Promise<{ responses: Response[]; missing: { personaId: string; reason: string }[] }>` — 개별 실패는 missing에 기록(전체 중단 없음).

- [ ] **Step 1: 실패 테스트 작성**

`src/simulate/simulate.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { MockProvider } from "../llm/mock.js";
import { matchChoice, simulate } from "./simulate.js";

const personas = [
  { id: "1", attrs: { age: "20대" } },
  { id: "2", attrs: { age: "40대" } },
];

describe("simulate", () => {
  test("matchChoice는 답변에 포함된 선택지를 찾는다", () => {
    expect(matchChoice("저는 새벽배송이 더 좋아요", ["새벽배송", "저녁배송"])).toBe("새벽배송");
    expect(matchChoice("모르겠음", ["A", "B"])).toBeUndefined();
  });

  test("각 페르소나에 대해 응답과 choice를 만든다", async () => {
    const provider = new MockProvider((p) => (p.attrs.age === "20대" ? "새벽배송 좋아요" : "저녁배송 좋아요"));
    const { responses, missing } = await simulate(personas, { prompt: "q", choices: ["새벽배송", "저녁배송"] }, provider);
    expect(missing).toHaveLength(0);
    expect(responses[0].choice).toBe("새벽배송");
    expect(responses[1].choice).toBe("저녁배송");
  });

  test("개별 응답 실패는 missing에 기록되고 중단되지 않는다", async () => {
    const provider = new MockProvider((p) => {
      if (p.id === "1") throw new Error("rate limit");
      return "저녁배송";
    });
    const { responses, missing } = await simulate(personas, { prompt: "q", choices: ["새벽배송", "저녁배송"] }, provider);
    expect(responses).toHaveLength(1);
    expect(missing[0]).toMatchObject({ personaId: "1", reason: expect.stringContaining("rate limit") });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/simulate/simulate.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: simulate.ts 구현**

`src/simulate/simulate.ts`:
```ts
import type { LLMProvider } from "../llm/provider.js";
import type { Persona, Response } from "../types.js";

export interface Question {
  prompt: string;
  choices?: string[];
}

export function matchChoice(answer: string, choices: string[]): string | undefined {
  return choices.find((c) => answer.includes(c));
}

export async function simulate(
  personas: Persona[],
  question: Question,
  provider: LLMProvider,
): Promise<{ responses: Response[]; missing: { personaId: string; reason: string }[] }> {
  const responses: Response[] = [];
  const missing: { personaId: string; reason: string }[] = [];
  for (const persona of personas) {
    try {
      const answer = await provider.ask(persona, question.prompt);
      const choice = question.choices ? matchChoice(answer, question.choices) : undefined;
      responses.push({ persona, answer, choice });
    } catch (e) {
      missing.push({ personaId: persona.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { responses, missing };
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/simulate/simulate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/simulate/simulate.ts src/simulate/simulate.test.ts
git commit -m "feat: 시뮬레이션 단계 (choice 매칭 + 부분실패 정직 기록)"
```

---

### Task 10: 집계 / 불확실성 (🔴/🟢 + 세그먼트)

**Files:**
- Create: `src/aggregate/uncertainty.ts`, `src/aggregate/uncertainty.test.ts`

**Interfaces:**
- Consumes: `Response`, `StudyResult`, `SegmentResult`
- Produces:
  - `function normalizedEntropy(counts: number[]): number` — 0(완전합의)~1(완전분열).
  - `function aggregate(responses: Response[], opts?: { splitThreshold?: number; missing?: { personaId: string; reason: string }[] }): StudyResult` — 전체 신호 + 차원별 세그먼트 교차.

- [ ] **Step 1: 실패 테스트 작성**

`src/aggregate/uncertainty.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import type { Response } from "../types.js";
import { aggregate, normalizedEntropy } from "./uncertainty.js";

const r = (age: string, choice: string): Response => ({ persona: { id: Math.random().toString(), attrs: { age } }, answer: choice, choice });

describe("aggregate", () => {
  test("normalizedEntropy: 만장일치=0, 반반=1", () => {
    expect(normalizedEntropy([10, 0])).toBeCloseTo(0, 6);
    expect(normalizedEntropy([5, 5])).toBeCloseTo(1, 6);
  });

  test("합의된 응답은 consensus(🟢)", () => {
    const res = [r("20대", "A"), r("40대", "A"), r("20대", "A")];
    const out = aggregate(res, { splitThreshold: 0.5 });
    expect(out.signal).toBe("consensus");
  });

  test("갈린 응답은 split(🔴)", () => {
    const res = [r("20대", "A"), r("40대", "B"), r("20대", "A"), r("40대", "B")];
    const out = aggregate(res, { splitThreshold: 0.5 });
    expect(out.signal).toBe("split");
  });

  test("세그먼트(age)별 교차 신호를 만든다", () => {
    const res = [r("20대", "A"), r("20대", "A"), r("40대", "B"), r("40대", "B")];
    const out = aggregate(res, { splitThreshold: 0.5 });
    expect(out.bySegment.age["20대"].signal).toBe("consensus");
    expect(out.bySegment.age["40대"].signal).toBe("consensus");
    // 전체로는 갈리지만 각 세그먼트 안에서는 합의 → "세그먼트가 답을 가른다"
    expect(out.signal).toBe("split");
  });

  test("missing은 결과에 보존된다", () => {
    const out = aggregate([r("20대", "A")], { missing: [{ personaId: "9", reason: "err" }] });
    expect(out.missing?.[0].personaId).toBe("9");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/aggregate/uncertainty.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: uncertainty.ts 구현**

`src/aggregate/uncertainty.ts`:
```ts
import type { Response, SegmentResult, StudyResult } from "../types.js";

export function normalizedEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const k = counts.filter((c) => c > 0).length;
  if (k <= 1) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(k); // 0~1로 정규화
}

function tally(responses: Response[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of responses) {
    const key = r.choice ?? r.answer;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function signalOf(responses: Response[], threshold: number): { signal: "consensus" | "split"; dispersion: number; breakdown: Record<string, number> } {
  const breakdown = tally(responses);
  const dispersion = normalizedEntropy(Object.values(breakdown));
  return { signal: dispersion >= threshold ? "split" : "consensus", dispersion, breakdown };
}

export function aggregate(
  responses: Response[],
  opts?: { splitThreshold?: number; missing?: { personaId: string; reason: string }[] },
): StudyResult {
  const threshold = opts?.splitThreshold ?? 0.5;
  const overall = signalOf(responses, threshold);

  // 모든 속성 차원에 대해 세그먼트 교차
  const dims = new Set<string>();
  for (const r of responses) for (const k of Object.keys(r.persona.attrs)) dims.add(k);
  const bySegment: Record<string, Record<string, SegmentResult>> = {};
  for (const dim of dims) {
    bySegment[dim] = {};
    const groups: Record<string, Response[]> = {};
    for (const r of responses) {
      const v = r.persona.attrs[dim];
      (groups[v] ??= []).push(r);
    }
    for (const [v, rs] of Object.entries(groups)) {
      const s = signalOf(rs, threshold);
      bySegment[dim][v] = { signal: s.signal, breakdown: s.breakdown };
    }
  }

  return {
    responses,
    signal: overall.signal,
    dispersion: overall.dispersion,
    bySegment,
    missing: opts?.missing,
  };
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/aggregate/uncertainty.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/aggregate/uncertainty.ts src/aggregate/uncertainty.test.ts
git commit -m "feat: 불확실성 집계 (정규화 엔트로피 + 세그먼트 교차 신호)"
```

---

### Task 11: 오케스트레이터 runStudy + 공개 API

**Files:**
- Create: `src/study.ts`, `src/index.ts`, `src/study.test.ts`

**Interfaces:**
- Consumes: `DataSource`, `LLMProvider`, `Question`, `StudyResult`, `ipf`, `samplePersonas`, `simulate`, `aggregate`
- Produces:
  - `interface StudyConfig { source: DataSource; provider: LLMProvider; question: Question; n: number; seed?: number; splitThreshold?: number }`
  - `function runStudy(config: StudyConfig): Promise<StudyResult>`
  - `src/index.ts`는 공개 API를 배럴 export.

- [ ] **Step 1: 실패 테스트 작성** (sample source + mock provider로 엔드투엔드, LLM/네트워크 없음)

`src/study.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { SampleSource } from "./data/sample-source.js";
import { MockProvider } from "./llm/mock.js";
import { runStudy } from "./study.js";

describe("runStudy (end-to-end, mock)", () => {
  test("샘플 분포 + mock LLM로 StudyResult를 만든다", async () => {
    // 연령으로 갈리는 mock: 20/30대는 A, 40/50대는 B
    const provider = new MockProvider((p) => (["20대", "30대"].includes(p.attrs.age) ? "A안" : "B안"));
    const result = await runStudy({
      source: new SampleSource(),
      provider,
      question: { prompt: "A안 vs B안?", choices: ["A안", "B안"] },
      n: 80,
      seed: 42,
    });
    expect(result.responses.length).toBeGreaterThan(0);
    expect(result.bySegment.age).toBeDefined();
    // 같은 시드는 같은 결과(결정적)
    const again = await runStudy({
      source: new SampleSource(),
      provider,
      question: { prompt: "A안 vs B안?", choices: ["A안", "B안"] },
      n: 80,
      seed: 42,
    });
    expect(again.responses.map((r) => r.choice)).toEqual(result.responses.map((r) => r.choice));
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/study.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: study.ts + index.ts 구현**

`src/study.ts`:
```ts
import { aggregate } from "./aggregate/uncertainty.js";
import type { DataSource } from "./data/source.js";
import type { LLMProvider } from "./llm/provider.js";
import { ipf } from "./personas/ipf.js";
import { samplePersonas } from "./personas/sample.js";
import { type Question, simulate } from "./simulate/simulate.js";
import type { StudyResult } from "./types.js";

export interface StudyConfig {
  source: DataSource;
  provider: LLMProvider;
  question: Question;
  n: number;
  seed?: number;
  splitThreshold?: number;
}

export async function runStudy(config: StudyConfig): Promise<StudyResult> {
  const dist = await config.source.getDistribution();
  const joint = ipf(dist);
  const personas = samplePersonas(joint, config.n, config.seed ?? 1);
  const { responses, missing } = await simulate(personas, config.question, config.provider);
  return aggregate(responses, { splitThreshold: config.splitThreshold, missing });
}
```

`src/index.ts`:
```ts
export type { Distribution, Dimension, CrossTable, JointDistribution, Persona, Response, StudyResult, SegmentResult } from "./types.js";
export { ipf } from "./personas/ipf.js";
export { samplePersonas, makeRng } from "./personas/sample.js";
export type { DataSource, DistSpec } from "./data/source.js";
export { SampleSource } from "./data/sample-source.js";
export { KosisSource, buildKosisUrl, parseKosisRows, rowsToCrossTable } from "./data/kosis-source.js";
export type { LLMProvider } from "./llm/provider.js";
export { MockProvider } from "./llm/mock.js";
export { ClaudeProvider } from "./llm/claude.js";
export { RecordedProvider } from "./llm/recorded.js";
export { simulate, matchChoice, type Question } from "./simulate/simulate.js";
export { aggregate, normalizedEntropy } from "./aggregate/uncertainty.js";
export { runStudy, type StudyConfig } from "./study.js";
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/study.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: 전체 테스트 실행 → 전부 통과**

Run: `npm test`
Expected: 모든 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/study.ts src/index.ts src/study.test.ts
git commit -m "feat: runStudy 오케스트레이터 + 공개 API 배럴"
```

---

### Task 12: 얇은 CLI

**Files:**
- Create: `cli/main.ts`, `cli/main.test.ts`

**Interfaces:**
- Consumes: `runStudy`, `SampleSource`, `KosisSource`, `MockProvider`, `ClaudeProvider`
- Produces:
  - `function formatResult(result: StudyResult): string` — 결과를 사람이 읽는 텍스트(🔴/🟢 + 세그먼트)로.
  - `cli/main.ts` 실행 진입점 (`node:util parseArgs`).

CLI 인자: `--question <text>` (필수), `--choices "A,B"` , `--n <number>` (기본 50), `--seed <number>`, `--source sample|kosis` (기본 sample), `--mock` (LLM 대신 결정적 mock, 키 없이 데모용).

- [ ] **Step 1: 실패 테스트 작성** (포매터만 단위 테스트 — 순수 함수)

`cli/main.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import type { StudyResult } from "../src/types.js";
import { formatResult } from "./main.js";

const result: StudyResult = {
  responses: [],
  signal: "split",
  dispersion: 0.9,
  bySegment: { age: { "20대": { signal: "consensus", breakdown: { A안: 10 } }, "40대": { signal: "consensus", breakdown: { B안: 10 } } } },
};

describe("formatResult", () => {
  test("전체 신호와 세그먼트를 사람이 읽는 형태로 출력", () => {
    const text = formatResult(result);
    expect(text).toContain("🔴"); // split
    expect(text).toContain("age");
    expect(text).toContain("20대");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run cli/main.test.ts`
Expected: FAIL (module 없음)

- [ ] **Step 3: main.ts 구현**

`cli/main.ts`:
```ts
import { parseArgs } from "node:util";
import { SampleSource } from "../src/data/sample-source.js";
import { ClaudeProvider } from "../src/llm/claude.js";
import { MockProvider } from "../src/llm/mock.js";
import type { LLMProvider } from "../src/llm/provider.js";
import { type StudyConfig, runStudy } from "../src/study.js";
import type { StudyResult } from "../src/types.js";

export function formatResult(result: StudyResult): string {
  const dot = (s: string) => (s === "split" ? "🔴" : "🟢");
  const lines: string[] = [];
  lines.push(`전체 신호: ${dot(result.signal)} ${result.signal} (분산 ${result.dispersion.toFixed(2)})`);
  if (result.responses.length) {
    const total: Record<string, number> = {};
    for (const r of result.responses) {
      const k = r.choice ?? r.answer;
      total[k] = (total[k] ?? 0) + 1;
    }
    lines.push(`응답 분포: ${Object.entries(total).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  for (const [dim, segs] of Object.entries(result.bySegment)) {
    lines.push(`\n[${dim}별]`);
    for (const [val, s] of Object.entries(segs)) {
      const bd = Object.entries(s.breakdown).map(([k, v]) => `${k}=${v}`).join(", ");
      lines.push(`  ${dot(s.signal)} ${val}: ${bd}`);
    }
  }
  if (result.missing?.length) lines.push(`\n⚠️ 누락 ${result.missing.length}건(응답 실패)`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      question: { type: "string" },
      choices: { type: "string" },
      n: { type: "string", default: "50" },
      seed: { type: "string" },
      source: { type: "string", default: "sample" },
      mock: { type: "boolean", default: false },
    },
  });
  if (!values.question) {
    console.error('사용법: synth-persona --question "A안 vs B안?" --choices "A안,B안" [--n 50] [--mock]');
    process.exit(1);
  }
  const provider: LLMProvider = values.mock
    ? new MockProvider((p) => (["20대", "30대"].includes(p.attrs.age ?? "") ? (values.choices?.split(",")[0] ?? "A") : (values.choices?.split(",")[1] ?? "B")))
    : new ClaudeProvider();
  const config: StudyConfig = {
    source: new SampleSource(),
    provider,
    question: { prompt: values.question, choices: values.choices?.split(",").map((c) => c.trim()) },
    n: Number(values.n),
    seed: values.seed ? Number(values.seed) : undefined,
  };
  const result = await runStudy(config);
  console.log(formatResult(result));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run cli/main.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: CLI 수동 스모크 (키 없이 mock)**

Run: `node cli/main.ts --question "A안 vs B안?" --choices "A안,B안" --n 40 --mock`
Expected: 🔴/🟢 신호 + age별 세그먼트가 출력됨(에러 없이).

- [ ] **Step 6: 커밋**

```bash
git add cli/main.ts cli/main.test.ts
git commit -m "feat: 얇은 CLI (--mock으로 키 없이 데모 가능)"
```

---

### Task 13: CI (결정적 게이트, 키 불필요)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm test`, `npm run lint`, `npm run build`
- Produces: PR/푸시마다 키 없이 도는 초록불 게이트.

- [ ] **Step 1: 워크플로 작성**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: 로컬에서 동일 명령 검증**

Run: `npm run lint && npm test && npm run build`
Expected: 셋 다 성공(초록불).

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 결정적 게이트(lint+test+build), 키 불필요"
```

---

## Self-Review

**Spec coverage 점검 (스펙 9절 MVP 범위 대비):**
- 데이터(샘플+KOSIS rig) → Task 4, 5 ✅
- IPF → Task 2 ✅
- 페르소나 샘플 → Task 3 ✅
- 시뮬(Claude/mock/recorded) → Task 6, 7, 8, 9 ✅
- 집계(🔴/🟢+세그먼트) → Task 10 ✅
- CLI → Task 12 ✅
- 검증 계층 1(불변식) → Task 2(property test) ✅
- 검증 계층 2(VCR) → Task 8 ✅
- 검증 계층 6 일부(결정적 CI) → Task 13 ✅
- 계층 3·4·5 및 통합 성적표 → **Plan 2로 이월**(의도된 범위 분리). logs/ append·캘리브레이션 본격 구현도 Plan 2.

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "TBD"/"적절히 처리" 없음. 단, Claude 모델 ID는 "claude-api 레퍼런스로 확정"이라는 명시적 액션으로 표기(Task 7) — 구현자가 그 시점에 확정.

**Type consistency:** `DataSource.getDistribution`, `LLMProvider.ask`, `Question`, `StudyResult`/`SegmentResult`, `runStudy`/`StudyConfig`가 정의 태스크(2·4·6·9·10·11)와 소비 태스크 전반에서 시그니처 일치 확인. `bySegment`는 `Record<string, Record<string, SegmentResult>>`로 Task 2(타입)·10(생성)·12(출력) 일관.

**남은 메모:** Task 7의 정확한 모델 ID와 `@anthropic-ai/sdk` 버전은 구현 착수 시 claude-api 스킬로 최종 확인.

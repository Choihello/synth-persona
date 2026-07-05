// Nemotron-Personas-Korea → 서사 풀 (data/nemotron/kr-pool.json) 층화 수집.
// 실행:
//  - 덤프 모드: node dist/scripts/build-nemotron-pool.js --dump-family-types
//  - 본 수집:   node dist/scripts/build-nemotron-pool.js
// HF datasets-server rows API. 429엔 지수 백오프, 콜 간 300ms, 콜 상한 600,
// 스트라텀당 20명 채우면 조기 종료. 오프셋은 고정 seed LCG로 결정적.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  const url = `${API}?dataset=${DS}&config=default&split=train&offset=${offset}&length=${length}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      // 일시적 네트워크 오류도 지수 백오프로 재시도
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (
      res.status === 429 ||
      res.status === 500 ||
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504
    ) {
      // 지수 백오프 (결정적: Math.random 금지 정책 준수, 지터는 attempt·offset 파생)
      const jitter = ((offset + attempt * 131) % 500) + 100;
      const wait = 2000 * 2 ** attempt + jitter;
      await new Promise((r) => setTimeout(r, wait));
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

function ageBucket(age: number): string | null {
  if (age < 20) return null; // 19세 제외 (스펙)
  if (age >= 85) return "85세이상";
  const lo = Math.floor(age / 5) * 5;
  return `${lo}~${lo + 4}세`;
}

function region(province: string): "수도권" | "비수도권" {
  return CAPITAL.has(province) ? "수도권" : "비수도권";
}

function mapMarital(m: string): string | null {
  if (m === "배우자있음") return "유배우";
  if (m === "미혼") return "미혼";
  if (m === "사별" || m === "이혼") return "사별·이혼";
  return null; // 미지 값은 스킵하고 카운트 보고
}

// family_type → 가구 호환 클래스. --dump-family-types(3000행, 35종) 결과로 확정.
// 규칙 우선순위(위에서부터 먼저 매칭):
//  1) "혼자 거주"(별거 포함)                         → "1"
//  2) 정확히 부부만("배우자와 거주")                  → "2"
//  3) 한부모/조부모 중 1인과 동거(본인+1인)           → "2"
//     · "어머니와 동거" "아버지와 동거" "부 또는 모와 거주" "조부 또는 조모와 동거"
//  4) 3인 이상 함의(자녀·양친부모·조부모·손자·형제자매·
//     친인척·세대 결합, 배우자+@ 결합 포함, 중점 · 결합)  → "3+"
//  5) 나머지 세대/비친족 라벨(구성 불확정)             → "unknown"
//     · "기타1세대" "기타2세대" "기타3세대" "비친족 동거"
function hhClass(familyType: string): PoolEntry["hh"] {
  const f = familyType;
  if (/혼자 거주/.test(f)) return "1";
  if (f === "배우자와 거주") return "2";
  // 본인 + 한부모(1인) 또는 조부모 중 1인 → 2인 가구
  if (
    f === "어머니와 동거" ||
    f === "아버지와 동거" ||
    f === "부 또는 모와 거주" ||
    f === "조부 또는 조모와 동거"
  )
    return "2";
  // 3인 이상 함의: 자녀/양친부모/조부모(복수)/손자녀/형제자매/친인척/편부모 결합,
  // 배우자·@ 결합(중점 ·). 위 2인 케이스는 이미 걸러졌으므로 여기 남은 부모/조부는 복수.
  if (/자녀|부모|조부|조모|손|형제|자매|친인척|친척|편부모|·/.test(f))
    return "3+";
  return "unknown";
}

/** family_type이 unknown일 때 서사 텍스트에서 가구 단서로 보정 (잘못 부착 방지 — 과소 매칭 방향만). */
function refineHhFromNarrative(n: string): PoolEntry["hh"] {
  if (/혼자 살|독거|1인 가구/.test(n)) return "1";
  if (/3세대|삼세대|대가족/.test(n)) return "3+";
  const spouse = /(아내|남편|배우자)(와|과)/.test(n);
  const kidsOrParents =
    /(자녀|아이|아들|딸|손주|손자|부모님|어머니|아버지)(와|과|를)/.test(n);
  if (spouse && kidsOrParents) return "3+";
  if (spouse) return "2";
  if (kidsOrParents && /(모시|함께 살|함께 거주|봉양)/.test(n)) return "3+";
  if (/가족과 함께 (살|거주)/.test(n)) return "3+";
  return "unknown";
}

// 결정적 오프셋 시퀀스 — 고정 seed LCG (Math.random 금지: 재현성).
// Numerical Recipes LCG 상수. offset은 100 단위로 정렬해 페이지 경계에 맞춤.
function* offsetSeq(seed: number, pageSize: number, maxOffset: number) {
  let state = seed >>> 0;
  const seen = new Set<number>();
  const buckets = Math.floor(maxOffset / pageSize);
  while (true) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const bucket = state % buckets;
    const offset = bucket * pageSize;
    if (seen.has(offset)) continue;
    seen.add(offset);
    yield offset;
    if (seen.size >= buckets) return;
  }
}

async function dumpFamilyTypes(): Promise<void> {
  const freq = new Map<string, number>();
  const pageSize = 100;
  let scanned = 0;
  for (const offset of offsetSeq(0xc0ffee, pageSize, TOTAL_ROWS - pageSize)) {
    const rows = await fetchRows(offset, pageSize);
    for (const r of rows) {
      const ft = r.row.family_type ?? "(null)";
      freq.set(ft, (freq.get(ft) ?? 0) + 1);
    }
    scanned += rows.length;
    await new Promise((r) => setTimeout(r, 300));
    if (scanned >= 3000) break;
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  console.log(
    `\n=== family_type 고유값 (${sorted.length}종, ${scanned}행) ===`,
  );
  for (const [val, count] of sorted) {
    console.log(`${count}\t${val}\t→ ${hhClass(val)}`);
  }
}

async function build(): Promise<void> {
  const strata: Record<string, PoolEntry[]> = {};
  const CAP = 20;
  const pageSize = 100;
  const maxCalls = 600;
  const strataTotal = AGE_BUCKETS.length * 2 * 2 * 3; // 14*2*2*3 = 168
  const unknownMarital = new Map<string, number>();
  let rowsScanned = 0;
  let calls = 0;

  for (const offset of offsetSeq(0xc0ffee, pageSize, TOTAL_ROWS - pageSize)) {
    if (calls >= maxCalls) break;
    const rows = await fetchRows(offset, pageSize);
    calls++;
    rowsScanned += rows.length;
    for (const { row } of rows) {
      const age = ageBucket(row.age);
      if (age === null) continue;
      const marital = mapMarital(row.marital_status);
      if (marital === null) {
        unknownMarital.set(
          row.marital_status,
          (unknownMarital.get(row.marital_status) ?? 0) + 1,
        );
        continue;
      }
      const sex = row.sex; // "남자" | "여자"
      const reg = region(row.province);
      const key = `${age}|${sex}|${reg}|${marital}`;
      let bucket = strata[key];
      if (!bucket) {
        bucket = [];
        strata[key] = bucket;
      }
      if (bucket.length >= CAP) continue;
      const persona = row.persona ?? "";
      let n = persona;
      if (n.length > 400) n = `${n.slice(0, 400)}…`;
      const baseHh = hhClass(row.family_type);
      bucket.push({
        n,
        job: row.occupation,
        edu: row.education_level,
        hh: baseHh === "unknown" ? refineHhFromNarrative(persona) : baseHh,
      });
    }
    // 조기 종료: 모든 스트라텀이 CAP에 도달했는가?
    const filled = Object.values(strata).filter((b) => b.length >= CAP).length;
    if (filled >= strataTotal) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  const strataFilled = Object.keys(strata).length;
  const pool: NarrativePool = {
    meta: {
      source: "nvidia/Nemotron-Personas-Korea",
      license: "CC BY 4.0",
      generatedAt: new Date().toISOString(),
      rowsScanned,
      strataFilled,
      strataTotal,
    },
    strata,
  };

  const outDir = fileURLToPath(
    new URL("../../data/nemotron/", import.meta.url),
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}kr-pool.json`, JSON.stringify(pool, null, 2));

  const totalEntries = Object.values(strata).reduce((a, b) => a + b.length, 0);
  const capReached = Object.values(strata).filter(
    (b) => b.length >= CAP,
  ).length;
  console.log(
    `pool written: ${strataFilled}/${strataTotal} strata (CAP도달 ${capReached}/${strataTotal}), ${totalEntries} entries, ${rowsScanned} rows scanned, ${calls} calls`,
  );
  if (unknownMarital.size > 0) {
    console.log("미지 marital 값:");
    for (const [v, c] of [...unknownMarital.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  ${c}\t${v}`);
    }
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--dump-family-types")) {
    await dumpFamilyTypes();
    return;
  }
  await build();
}

if (
  process.argv[1]?.endsWith("build-nemotron-pool.js") ||
  process.argv[1]?.endsWith("build-nemotron-pool.ts")
) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

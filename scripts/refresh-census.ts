// 라이브 KOSIS → 권역 스냅샷 생성 (키 필요, CI/단위테스트 제외).
// 실행: npm run build && node --env-file=.env dist/scripts/refresh-census.js
// 순수 변환 헬퍼(aggregateSidoToRegion)는 build-region-core.ts에서 테스트됨.
// 표별 KOSIS 구조(정찰 확인):
//  - DT_1IN1509: C1=지역(시도) C2=성 C3=연령, 일반가구원=ITM T00 → 시도→권역 집계
//  - DT_1MR2060: C2=연령, 혼인=ITM(내국인_미혼 T2/유배우 T3/사별·이혼 T4), 18세+
//  - DT_1JC1511: C2=가구주연령, 가구원수=ITM("가구원수 N명")
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type KosisRow,
  buildKosisUrl,
  parseKosisRows,
} from "../src/data/kosis-source.js";
import type { ConditionalTable, Snapshot } from "../src/population/schema.js";
import { aggregateSidoToRegion } from "./build-region-core.js";

const KEY = process.env.KOSIS_API_KEY ?? "";

const REGION_MAPPING: Record<string, string[]> = {
  수도권: ["서울특별시", "인천광역시", "경기도"],
  비수도권: [
    "부산광역시",
    "대구광역시",
    "광주광역시",
    "대전광역시",
    "울산광역시",
    "세종특별자치시",
    "강원특별자치도",
    "충청북도",
    "충청남도",
    "전북특별자치도",
    "전라남도",
    "경상북도",
    "경상남도",
    "제주특별자치도",
  ],
};

const AGE_KEYS = [
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
  "85세이상", // 표마다 "85세이상"/"85세 이상" 혼재 → 공백 제거로 정규화(아래 stripAgeSpaces)
];

// 연령 라벨의 공백 차이를 흡수(표 간 "85세 이상" vs "85세이상"). 성/지역은 영향 없음.
function stripAgeSpaces(rows: KosisRow[]): KosisRow[] {
  return rows.map((r) => ({
    ...r,
    c2nm: r.c2nm == null ? null : r.c2nm.replace(/\s/g, ""),
    c3nm: r.c3nm == null ? null : r.c3nm.replace(/\s/g, ""),
  }));
}

async function fetchRows(params: {
  tblId: string;
  objL1?: string;
  objL2?: string;
  objL3?: string;
  itmId?: string;
}): Promise<KosisRow[]> {
  if (!KEY) throw new Error("KOSIS_API_KEY 미설정 (.env)");
  const url = buildKosisUrl({
    apiKey: KEY,
    orgId: "101",
    prdSe: "Y",
    newEstPrdCnt: 1,
    ...params,
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from KOSIS`);
  return stripAgeSpaces(parseKosisRows(await res.json()));
}

// 연령(C2)×var 조건부 행렬. var는 ITM_NM을 itemMap으로 깨끗한 키에 매핑.
// value==null(비공개 X)은 null 보존(분모 제외).
function buildConditionalFromItem(
  rows: KosisRow[],
  spec: {
    var: string;
    frame: ConditionalTable["frame"];
    universe: string;
    varKeys: string[];
    itemMap: Record<string, string>;
    bridge?: string;
  },
): ConditionalTable {
  const gi = Object.fromEntries(AGE_KEYS.map((k, i) => [k, i]));
  const vi = Object.fromEntries(spec.varKeys.map((k, i) => [k, i]));
  const matrix: (number | null)[][] = AGE_KEYS.map(() =>
    spec.varKeys.map(() => 0),
  );
  for (const r of rows) {
    const g = gi[r.c2nm ?? ""];
    const mapped = spec.itemMap[r.item];
    const v = mapped == null ? undefined : vi[mapped];
    if (g == null || v == null) continue;
    if (r.value == null) {
      matrix[g][v] = null;
      continue;
    }
    matrix[g][v] = (matrix[g][v] ?? 0) + r.value;
  }
  return {
    given: "연령",
    var: spec.var,
    frame: spec.frame,
    universe: spec.universe,
    givenKeys: AGE_KEYS,
    varKeys: spec.varKeys,
    matrix,
    bridge: spec.bridge,
  };
}

export async function main(): Promise<void> {
  // 1) core: DT_1IN1509, 일반가구원(T00), 시도→권역
  const coreRows = await fetchRows({
    tblId: "DT_1IN1509",
    objL1: "ALL",
    objL2: "ALL",
    objL3: "ALL",
    itmId: "T00",
  });
  const core = aggregateSidoToRegion(
    coreRows,
    REGION_MAPPING,
    ["남자", "여자"],
    AGE_KEYS,
  );

  // 2) 혼인: DT_1MR2060 (연령=C2, 혼인=ITM 내국인_*), 18세+
  const maritalRows = await fetchRows({
    tblId: "DT_1MR2060",
    objL1: "00",
    objL2: "ALL",
    itmId: "ALL",
  });
  const marital = buildConditionalFromItem(maritalRows, {
    var: "혼인",
    frame: "individual",
    universe: "내국인18세이상",
    varKeys: ["미혼", "유배우", "사별·이혼"],
    itemMap: {
      내국인_미혼: "미혼",
      내국인_유배우: "유배우",
      내국인_사별·이혼: "사별·이혼", // 중점(·) 포함 → 따옴표 필수
    },
  });

  // 3) 가구원수: DT_1JC1511 (가구주연령=C2, 가구원수=ITM) — householder bridge
  const hhKeys = [
    "가구원수 1명",
    "가구원수 2명",
    "가구원수 3명",
    "가구원수 4명",
    "가구원수 5명",
    "가구원수 6명",
    "가구원수 7명 이상",
  ];
  const hhRows = await fetchRows({
    tblId: "DT_1JC1511",
    objL1: "00",
    objL2: "ALL",
    itmId: "ALL",
  });
  const household = buildConditionalFromItem(hhRows, {
    var: "가구원수",
    frame: "householder",
    universe: "일반가구",
    varKeys: hhKeys,
    itemMap: Object.fromEntries(hhKeys.map((k) => [k, k])),
    bridge: "householder_age_as_proxy",
  });

  // year는 실행일이 아니라 데이터 기간(PRD_DE)에서 유도
  const year = Number(coreRows[0]?.period) || new Date().getFullYear();
  const generatedAt = new Date().toISOString();
  const snapshot: Snapshot = {
    meta: {
      year,
      geographyLevel: "권역",
      generatedAt,
      sources: [
        {
          var: ["성", "연령", "지역"],
          tblId: "DT_1IN1509",
          orgId: "101",
          frame: "individual",
          universe: "전체인구(일반가구원)",
          denominator: "명",
        },
        {
          var: ["연령", "혼인"],
          tblId: "DT_1MR2060",
          orgId: "101",
          frame: "individual",
          universe: "내국인18세이상",
          denominator: "명",
        },
        {
          var: ["연령", "가구원수"],
          tblId: "DT_1JC1511",
          orgId: "101",
          frame: "householder",
          universe: "일반가구",
          denominator: "가구",
        },
      ],
      ageBins: AGE_KEYS,
      weightUnit: "person_count",
      regionMapping: REGION_MAPPING,
      bridgeAssumptions: ["householder_age_as_proxy"],
      missingPolicy: { structuralZero: ["-"], suppressed: ["X"] },
    },
    core,
    conditional: [marital, household],
  };

  const outDir = fileURLToPath(new URL("../../data/census/", import.meta.url));
  const fileName = `kr-${year}.json`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}${fileName}`, JSON.stringify(snapshot, null, 2));
  writeFileSync(
    `${outDir}manifest.json`,
    JSON.stringify(
      {
        latest: fileName,
        availableYears: [year],
        tableIds: ["DT_1IN1509", "DT_1MR2060", "DT_1JC1511"],
        generatedAt,
      },
      null,
      2,
    ),
  );
  const coreTotal = core.counts.reduce((a, b) => a + b, 0);
  console.log(
    `snapshot written: core ${core.counts.length} cells (총 ${coreTotal}명), conditional ${snapshot.conditional.length}`,
  );
}

if (
  process.argv[1]?.endsWith("refresh-census.js") ||
  process.argv[1]?.endsWith("refresh-census.ts")
) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

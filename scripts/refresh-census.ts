// 라이브 KOSIS → 권역 스냅샷 생성 (키 필요, CI/단위테스트 제외).
// 실행: npm run build && node --env-file=.env dist/scripts/refresh-census.js
// 순수 변환 헬퍼는 build-region-core.ts(테스트됨). 이 main의 KOSIS 파라미터는
// 라이브 정찰값 기반이며, 표 구조 변경 시 여기만 손보면 된다.
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

async function fetchRows(params: {
  tblId: string;
  objL1?: string;
  objL2?: string;
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
  return parseKosisRows(await res.json());
}

// given(연령)×var 카운트 행렬 생성. value==null(비공개 X)은 null로 보존(분모 제외).
function buildConditional(
  rows: KosisRow[],
  spec: {
    var: string;
    frame: ConditionalTable["frame"];
    universe: string;
    givenKeys: string[];
    varKeys: string[];
    givenField: "c2nm" | "c3nm";
    varField: "c1nm" | "c2nm" | "c3nm" | "item";
    bridge?: string;
  },
): ConditionalTable {
  const gi = Object.fromEntries(spec.givenKeys.map((k, i) => [k, i]));
  const vi = Object.fromEntries(spec.varKeys.map((k, i) => [k, i]));
  const matrix: (number | null)[][] = spec.givenKeys.map(() =>
    spec.varKeys.map(() => 0),
  );
  for (const r of rows) {
    const g = gi[r[spec.givenField] ?? ""];
    const v = vi[r[spec.varField] ?? ""];
    if (g == null || v == null) continue;
    if (r.value == null) {
      matrix[g][v] = null; // 비공개/결측 보존
      continue;
    }
    const cur = matrix[g][v];
    matrix[g][v] = (cur ?? 0) + r.value;
  }
  return {
    given: "연령",
    var: spec.var,
    frame: spec.frame,
    universe: spec.universe,
    givenKeys: spec.givenKeys,
    varKeys: spec.varKeys,
    matrix,
    bridge: spec.bridge,
  };
}

export async function main(): Promise<void> {
  // 1) core: 성×연령×지역 — DT_1IN1509 (C1=지역, C2=성, C3=연령, ITM=세대구성)
  //    ITM "일반가구원"(개인 총계)만 사용해 성×연령×지역 도출 후 권역 집계.
  const sexKeys = ["남자", "여자"];
  const ageKeys = [
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
    "85세 이상",
  ];
  const coreRows = (
    await fetchRows({
      tblId: "DT_1IN1509",
      objL1: "ALL",
      objL2: "ALL",
      itmId: "ALL",
    })
  ).filter((r) => r.item === "일반가구원");
  const core = aggregateSidoToRegion(
    coreRows,
    REGION_MAPPING,
    sexKeys,
    ageKeys,
  );

  // 2) conditional 혼인: DT_1MR2060 (연령×혼인, 15세+)
  const maritalKeys = ["미혼", "배우자있음", "사별", "이혼"];
  const maritalRows = await fetchRows({
    tblId: "DT_1MR2060",
    objL1: "00",
    objL2: "ALL",
    itmId: "ALL",
  });
  const marital = buildConditional(maritalRows, {
    var: "혼인",
    frame: "individual",
    universe: "15세이상인구",
    givenKeys: ageKeys,
    varKeys: maritalKeys,
    givenField: "c2nm",
    varField: "item",
  });

  // 3) conditional 가구원수: DT_1JC1511 (가구주연령×가구원수) — householder bridge
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
  const household = buildConditional(hhRows, {
    var: "가구원수",
    frame: "householder",
    universe: "일반가구",
    givenKeys: ageKeys,
    varKeys: hhKeys,
    givenField: "c2nm",
    varField: "item",
    bridge: "householder_age_as_proxy",
  });

  const snapshot: Snapshot = {
    meta: {
      year: new Date().getFullYear(),
      geographyLevel: "권역",
      generatedAt: new Date().toISOString(),
      sources: [
        {
          var: ["성", "연령", "지역"],
          tblId: "DT_1IN1509",
          orgId: "101",
          frame: "individual",
          universe: "전체인구",
          denominator: "명",
        },
        {
          var: ["연령", "혼인"],
          tblId: "DT_1MR2060",
          orgId: "101",
          frame: "individual",
          universe: "15세이상인구",
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
      ageBins: ageKeys,
      weightUnit: "person_count",
      regionMapping: REGION_MAPPING,
      bridgeAssumptions: ["householder_age_as_proxy"],
      missingPolicy: { structuralZero: ["-"], suppressed: ["X"] },
    },
    core,
    conditional: [marital, household],
  };

  const outDir = fileURLToPath(new URL("../../data/census/", import.meta.url));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}kr-2024.json`, JSON.stringify(snapshot, null, 2));
  writeFileSync(
    `${outDir}manifest.json`,
    JSON.stringify(
      {
        latest: "kr-2024.json",
        availableYears: [snapshot.meta.year],
        tableIds: ["DT_1IN1509", "DT_1MR2060", "DT_1JC1511"],
        generatedAt: snapshot.meta.generatedAt,
      },
      null,
      2,
    ),
  );
  console.log(
    `snapshot written: core ${core.counts.length} cells, conditional ${snapshot.conditional.length}`,
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

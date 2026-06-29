import { describe, expect, test } from "vitest";
import {
  KosisSource,
  buildKosisUrl,
  parseKosisRows,
  rowsToCrossTable,
} from "./kosis-source.js";

const mock = [
  {
    PRD_DE: "2020",
    C1: "20",
    C1_NM: "20대",
    C2: "1",
    C2_NM: "1인가구",
    ITM_NM: "가구수",
    DT: "1500000",
    UNIT_NM: "가구",
  },
  {
    PRD_DE: "2020",
    C1: "20",
    C1_NM: "20대",
    C2: "4",
    C2_NM: "4인이상",
    ITM_NM: "가구수",
    DT: "120000",
    UNIT_NM: "가구",
  },
  {
    PRD_DE: "2020",
    C1: "40",
    C1_NM: "40대",
    C2: "1",
    C2_NM: "1인가구",
    ITM_NM: "가구수",
    DT: "600000",
    UNIT_NM: "가구",
  },
  {
    PRD_DE: "2020",
    C1: "40",
    C1_NM: "40대",
    C2: "4",
    C2_NM: "4인이상",
    ITM_NM: "가구수",
    DT: "1100000",
    UNIT_NM: "가구",
  },
];

describe("kosis", () => {
  test("URL 빌더는 필수 파라미터를 포함한다", () => {
    const url = buildKosisUrl({
      apiKey: "K",
      tblId: "T1",
      objL1: "ALL",
      objL2: "ALL",
    });
    expect(url).toContain("statisticsParameterData.do");
    expect(url).toContain("apiKey=K");
    expect(url).toContain("tblId=T1");
    expect(url).toContain("orgId=101");
    expect(url).toContain("method=getList");
    expect(url).toContain("format=json");
    expect(url).toContain("jsonVD=Y");
    expect(url).toContain("itmId=T1");
    expect(url).not.toContain("newEstPrdCnt"); // 미지정 시 생략
  });

  test("newEstPrdCnt 지정 시 URL에 포함된다(최신 N개 기간)", () => {
    const url = buildKosisUrl({ apiKey: "K", tblId: "T1", newEstPrdCnt: 1 });
    expect(url).toContain("newEstPrdCnt=1");
  });

  test("정상 응답을 행으로 파싱한다", () => {
    const rows = parseKosisRows(mock);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      c1nm: "20대",
      c2nm: "1인가구",
      value: 1500000,
    });
  });

  test("비숫자 DT(KOSIS 비공표 'X', 결측 '-')는 null로 처리한다", () => {
    const rows = parseKosisRows([
      {
        PRD_DE: "2024",
        C1_NM: "전국",
        C2_NM: "15세미만",
        ITM_NM: "가구원수 5명",
        DT: "X",
        UNIT_NM: "가구",
      },
      {
        PRD_DE: "2024",
        C1_NM: "전국",
        C2_NM: "15세미만",
        ITM_NM: "가구원수 6명",
        DT: "-",
        UNIT_NM: "가구",
      },
      {
        PRD_DE: "2024",
        C1_NM: "전국",
        C2_NM: "25~29세",
        ITM_NM: "가구원수 1명",
        DT: "901813",
        UNIT_NM: "가구",
      },
      {
        PRD_DE: "2024",
        C1_NM: "전국",
        C2_NM: "85세 이상",
        ITM_NM: "가구원수 7명 이상",
        DT: "0",
        UNIT_NM: "가구",
      },
    ]);
    expect(rows[0].value).toBeNull();
    expect(rows[1].value).toBeNull();
    expect(rows[2].value).toBe(901813);
    expect(rows[3].value).toBe(0); // 진짜 0은 결측(null)과 구분되어야
  });

  test("에러 응답은 throw 한다", () => {
    expect(() =>
      parseKosisRows({ err: "20", errMsg: "인증키가 유효하지 않습니다." }),
    ).toThrow(/KOSIS/);
  });

  test("행 → 정규화 교차표", () => {
    const m = rowsToCrossTable(
      parseKosisRows(mock),
      ["20대", "40대"],
      ["1인가구", "4인이상"],
    );
    const total = m.flat().reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(m[0][0]).toBeGreaterThan(m[0][1]); // 20대는 1인가구 > 4인이상
  });
});

// 실제 DT_1JC1511 구조: 지역=C1(전국), 연령=C2, 가구원수=항목(ITM_NM)
const liveMock = [
  {
    PRD_DE: "2020",
    C1: "00",
    C1_NM: "전국",
    C2: "25",
    C2_NM: "25~29세",
    ITM_NM: "가구원수 1명",
    DT: "900000",
    UNIT_NM: "가구",
  },
  {
    PRD_DE: "2020",
    C1: "00",
    C1_NM: "전국",
    C2: "25",
    C2_NM: "25~29세",
    ITM_NM: "가구원수 4명",
    DT: "50000",
    UNIT_NM: "가구",
  },
  {
    PRD_DE: "2020",
    C1: "00",
    C1_NM: "전국",
    C2: "40",
    C2_NM: "40~44세",
    ITM_NM: "가구원수 1명",
    DT: "200000",
    UNIT_NM: "가구",
  },
  {
    PRD_DE: "2020",
    C1: "00",
    C1_NM: "전국",
    C2: "40",
    C2_NM: "40~44세",
    ITM_NM: "가구원수 4명",
    DT: "700000",
    UNIT_NM: "가구",
  },
  // 합계행(키 목록에 없어 제외되어야 함)
  {
    PRD_DE: "2020",
    C1: "00",
    C1_NM: "전국",
    C2: "합계",
    C2_NM: "합계",
    ITM_NM: "일반가구",
    DT: "22294419",
    UNIT_NM: "가구",
  },
];

describe("kosis 항목축(ITM) 지원", () => {
  test("parseKosisRows는 ITM_NM을 item으로 노출한다", () => {
    const rows = parseKosisRows(liveMock);
    expect(rows[0].item).toBe("가구원수 1명");
    expect(rows[0].c2nm).toBe("25~29세");
  });

  test("rowsToCrossTable이 연령(c2nm) × 가구원수(item) 교차표를 만든다", () => {
    const m = rowsToCrossTable(
      parseKosisRows(liveMock),
      ["25~29세", "40~44세"],
      ["가구원수 1명", "가구원수 4명"],
      { rowField: "c2nm", colField: "item" },
    );
    const total = m.flat().reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6); // 합계행 제외되고 4셀만 정규화
    expect(m[0][0]).toBeGreaterThan(m[0][1]); // 25~29세: 1인 > 4인
    expect(m[1][1]).toBeGreaterThan(m[1][0]); // 40~44세: 4인 > 1인
  });

  test("KosisSource가 rowAxis/colAxis로 항목축 표를 Distribution으로 변환", async () => {
    const src = new KosisSource({
      apiKey: "K",
      tblId: "DT_1JC1511",
      objL1: "00",
      rowDim: { name: "연령", keys: ["25~29세", "40~44세"] },
      colDim: { name: "가구원수", keys: ["가구원수 1명", "가구원수 4명"] },
      rowAxis: "c2nm",
      colAxis: "item",
      fetchImpl: (async () => ({
        ok: true,
        json: async () => liveMock,
      })) as unknown as typeof fetch,
    });
    const dist = await src.getDistribution();
    expect(dist.dimensions.map((d) => d.name)).toEqual(["연령", "가구원수"]);
    expect(dist.crossTables?.[0].dims).toEqual(["연령", "가구원수"]);
    const m = dist.crossTables?.[0].matrix as number[][];
    expect(m[1][1]).toBeGreaterThan(m[1][0]); // 40~44세 4인 > 1인
  });

  test("parseKosisRows는 C3_NM을 c3nm으로 노출하고 c3nm 축으로 교차표를 만든다", () => {
    const rows = parseKosisRows([
      {
        PRD_DE: "2024",
        C1_NM: "전국",
        C2_NM: "남자",
        C3_NM: "20~24세",
        ITM_NM: "일반가구원",
        DT: "100",
        UNIT_NM: "명",
      },
      {
        PRD_DE: "2024",
        C1_NM: "전국",
        C2_NM: "여자",
        C3_NM: "20~24세",
        ITM_NM: "일반가구원",
        DT: "120",
        UNIT_NM: "명",
      },
    ]);
    expect(rows[0].c3nm).toBe("20~24세");
    const m = rowsToCrossTable(rows, ["남자", "여자"], ["20~24세"], {
      rowField: "c2nm",
      colField: "c3nm",
    });
    expect(m.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});

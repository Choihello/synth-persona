import { describe, expect, test } from "vitest";
import {
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

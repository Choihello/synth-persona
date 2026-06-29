import { describe, expect, test } from "vitest";
import { parseKosisRows } from "../src/data/kosis-source.js";
import { aggregateSidoToRegion } from "./build-region-core.js";

// DT_1IN1509 형태: C1=지역(시도), C2=성, C3=연령, ITM=세대구성(여기선 일반가구원 사용)
const rows = parseKosisRows([
  {
    C1_NM: "서울특별시",
    C2_NM: "남자",
    C3_NM: "20~24세",
    ITM_NM: "일반가구원",
    DT: "100",
  },
  {
    C1_NM: "경기도",
    C2_NM: "남자",
    C3_NM: "20~24세",
    ITM_NM: "일반가구원",
    DT: "50",
  },
  {
    C1_NM: "부산광역시",
    C2_NM: "남자",
    C3_NM: "20~24세",
    ITM_NM: "일반가구원",
    DT: "30",
  },
]);

describe("aggregateSidoToRegion", () => {
  test("시도를 권역으로 합산한다", () => {
    const core = aggregateSidoToRegion(
      rows.filter((r) => r.item === "일반가구원"),
      {
        수도권: ["서울특별시", "경기도", "인천광역시"],
        비수도권: ["부산광역시"],
      },
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

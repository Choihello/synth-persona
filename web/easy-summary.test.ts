import { describe, expect, test } from "vitest";
import { humanizeSegmentLabel } from "./easy-summary.js";

describe("humanizeSegmentLabel", () => {
  test("연령은 값 그대로", () => {
    expect(humanizeSegmentLabel("연령=45~49세")).toBe("45~49세");
  });
  test("지역은 거주자를 붙인다", () => {
    expect(humanizeSegmentLabel("지역=수도권")).toBe("수도권 거주자");
  });
  test("성은 여자→여성, 남자→남성", () => {
    expect(humanizeSegmentLabel("성=여자")).toBe("여성");
    expect(humanizeSegmentLabel("성=남자")).toBe("남성");
  });
  test("가구원수 N명은 N인 가구로", () => {
    expect(humanizeSegmentLabel("가구원수=가구원수 1명")).toBe("1인 가구");
    expect(humanizeSegmentLabel("가구원수=가구원수 4명")).toBe("4인 가구");
  });
  test("혼인은 값 그대로", () => {
    expect(humanizeSegmentLabel("혼인=사별·이혼")).toBe("사별·이혼");
  });
  test("미지의 차원은 라벨 원문 그대로", () => {
    expect(humanizeSegmentLabel("직업=자영업")).toBe("직업=자영업");
  });
  test("=가 없는 라벨은 원문 그대로", () => {
    expect(humanizeSegmentLabel("전체")).toBe("전체");
  });
});

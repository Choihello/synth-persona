import { describe, expect, test } from "vitest";
import { segmentBarsSVG, shareBarSVG } from "./charts.js";

describe("shareBarSVG (전체 분포 스택바)", () => {
  test("두 세그먼트 비율·직접 라벨·접근성 라벨 포함", () => {
    const svg = shareBarSVG({ 쓴다: 40, 안쓴다: 50 }, "쓴다");
    expect(svg).toContain("<svg");
    expect(svg).toContain('role="img"');
    expect(svg).toContain("44%"); // 40/90 반올림 직접 라벨
    expect(svg).toContain("쓴다");
    expect(svg).toContain("안쓴다");
    expect(svg).toContain("#2a78d6"); // 긍정 pole
    expect(svg).toContain("#e34948"); // 부정 pole
  });

  test("응답 0건이면 빈 문자열 (차트 생략)", () => {
    expect(shareBarSVG({}, "쓴다")).toBe("");
  });
});

describe("segmentBarsSVG (세그먼트 긍정률)", () => {
  test("세그먼트 바 + 전체 평균 기준선 + n 라벨", () => {
    const svg = segmentBarsSVG(
      [
        { label: "연령=25~29세", ratio: 0.77, n: 30 },
        { label: "가구원수=1명", ratio: 0.33, n: 45 },
      ],
      0.44,
    );
    expect(svg).toContain("연령=25~29세");
    expect(svg).toContain("77%");
    expect(svg).toContain("n=45");
    expect(svg).toContain("전체 평균 44%");
    expect(svg).toContain("stroke-dasharray"); // 기준선
  });

  test("세그먼트 없으면 빈 문자열", () => {
    expect(segmentBarsSVG([], 0.5)).toBe("");
  });
});

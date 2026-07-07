import { describe, expect, test } from "vitest";
import type { FounderInsightReport } from "../src/report/types.js";
import { easySummaryHTML, humanizeSegmentLabel } from "./easy-summary.js";

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

/** 최소 리포트 픽스처 — 필요한 필드만 채우고 나머지는 캐스팅으로 생략 */
function reportWith(over: {
  signal?: "consensus" | "split";
  dist?: Record<string, number>;
  n?: number;
  opp?: string;
  res?: string;
  consistency?: "high" | "medium" | "low" | "unknown";
  panelSize?: number;
  panelPositive?: number;
}): FounderInsightReport {
  return {
    overallSignal: {
      signal: over.signal ?? "consensus",
      distribution: over.dist ?? { 찬성: 78, 반대: 4, 유보: 8 },
      n: over.n ?? 90,
      missingRate: 0,
      label: "",
      panelSize: over.panelSize,
      panelPositive: over.panelPositive,
    },
    opportunitySegments: over.opp ? [{ segmentLabel: over.opp } as never] : [],
    resistanceSegments: over.res ? [{ segmentLabel: over.res } as never] : [],
    confidenceCard: {
      responseConsistency: { label: over.consistency ?? "medium" },
    } as never,
  } as unknown as FounderInsightReport;
}

describe("easySummaryHTML", () => {
  test("consensus r=0.87 → 뚜렷 긍정 + 10명 중 9명 + n 기준", () => {
    const html = easySummaryHTML(reportWith({}), "찬성");
    expect(html).toContain("반응이 뚜렷하게 긍정적이에요");
    expect(html).toContain("10명 중 9명");
    expect(html).toContain("가상 응답 90개 기준");
  });
  test("panelSize를 주면 그 수를 denominator로 (실제 표본 수 정직 표시)", () => {
    const html = easySummaryHTML(
      reportWith({ dist: { 찬성: 54, 반대: 6 } }), // r=0.9
      "찬성",
      60,
    );
    expect(html).toContain("60명 중 54명");
    expect(html).not.toContain("10명 중");
  });
  test("panelSize 미지정이면 기존대로 10 기준", () => {
    expect(easySummaryHTML(reportWith({}), "찬성")).toContain("10명 중");
  });
  test("overallSignal에 페르소나 총계가 있으면 그 실제값을 쓴다", () => {
    const html = easySummaryHTML(
      reportWith({
        dist: { 찬성: 90, 반대: 90 },
        panelSize: 60,
        panelPositive: 6,
      }),
      "찬성",
      60,
    );
    expect(html).toContain("60명 중 6명"); // 근사(round(0.5*60)=30)가 아니라 실제 6
  });
  test("판정 경계: 0.8 뚜렷 긍정 / 0.6 긍정 가까움 / 0.5 갈림 / 0.35 부정 가까움 / 0.1 뚜렷 부정", () => {
    const at = (pos: number, total: number) =>
      easySummaryHTML(
        reportWith({ dist: { 찬성: pos, 반대: total - pos } }),
        "찬성",
      );
    expect(at(80, 100)).toContain("반응이 뚜렷하게 긍정적이에요");
    expect(at(60, 100)).toContain("긍정에 가까운 반응이에요");
    expect(at(50, 100)).toContain("반응이 갈렸어요");
    expect(at(35, 100)).toContain("부정에 가까운 반응이에요");
    expect(at(10, 100)).toContain("반응이 뚜렷하게 부정적이에요");
  });
  test("split이면 비율과 무관하게 갈림", () => {
    const html = easySummaryHTML(
      reportWith({ signal: "split", dist: { 찬성: 85, 반대: 15 } }),
      "찬성",
    );
    expect(html).toContain("반응이 갈렸어요");
  });
  test("세그먼트가 있으면 생활 언어로 누가 좋아했나/망설였나", () => {
    const html = easySummaryHTML(
      reportWith({ opp: "연령=45~49세", res: "연령=65~69세" }),
      "찬성",
    );
    expect(html).toContain("특히 45~49세의 반응이 가장 좋았어요");
    expect(html).toContain("반대로 65~69세는 망설였어요");
    expect(html).toContain(
      "다음 할 일: 45~49세 실제 고객 5~8명에게 직접 물어보고",
    );
  });
  test("세그먼트 없으면 '뚜렷한 차이 없음' 문장 + 일반형 다음 할 일", () => {
    const html = easySummaryHTML(reportWith({}), "찬성");
    expect(html).toContain("세그먼트 간 뚜렷한 차이는 없었어요.");
    expect(html).not.toContain("특히");
    expect(html).toContain(
      "다음 할 일: 잠재 고객 5~8명에게 직접 물어보며 확인해 보세요",
    );
  });
  test("AI 면책은 항상 + consistency 분기", () => {
    expect(easySummaryHTML(reportWith({}), "찬성")).toContain(
      "AI가 인구 구성을 흉내 내 답한 결과예요",
    );
    expect(
      easySummaryHTML(reportWith({ consistency: "high" }), "찬성"),
    ).toContain("응답끼리는 꽤 일관적이었어요");
    expect(
      easySummaryHTML(reportWith({ consistency: "low" }), "찬성"),
    ).toContain("응답이 흔들려서 더 조심해서 봐야 해요");
    expect(easySummaryHTML(reportWith({}), "찬성")).not.toContain(
      "일관적이었어요",
    );
  });
  test("선택지 XSS 이스케이프", () => {
    const html = easySummaryHTML(
      reportWith({ dist: { "<script>x</script>": 9, 아니오: 1 } }),
      "<script>x</script>",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  test("og-stats 보호: '응답 분포:' 미포함 + 통계 용어 미포함", () => {
    const html = easySummaryHTML(reportWith({ opp: "연령=45~49세" }), "찬성");
    expect(html).not.toContain("응답 분포:");
    expect(html).not.toContain("n=");
    expect(html).not.toContain("%");
  });
  test("total=0이면 빈 문자열", () => {
    expect(easySummaryHTML(reportWith({ dist: {} }), "찬성")).toBe("");
  });
});

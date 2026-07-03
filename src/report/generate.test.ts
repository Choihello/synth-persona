import { describe, expect, test } from "vitest";
import type { Response, StudyResult } from "../types.js";
import { generateFounderInsightReport } from "./generate.js";

function r(attrs: Record<string, string>, choice: string): Response {
  return {
    persona: { id: Math.random().toString(), attrs, weight: 1 },
    answer: choice,
    choice,
  };
}
function study(responses: Response[]): StudyResult {
  return { responses, signal: "split", dispersion: 0.9, bySegment: {} };
}
const opts = { question: "쓸 의향?", choices: ["쓴다", "안쓴다"] };

describe("generateFounderInsightReport — core/validation", () => {
  test("choices가 2개 미만이면 throw", () => {
    expect(() =>
      generateFounderInsightReport(study([r({ 연령: "30대" }, "쓴다")]), {
        question: "q",
        choices: ["쓴다"],
      }),
    ).toThrow(/choices/);
  });

  test("positiveChoice가 choices에 없으면 throw", () => {
    expect(() =>
      generateFounderInsightReport(study([r({ 연령: "30대" }, "쓴다")]), {
        ...opts,
        positiveChoice: "몰라",
      }),
    ).toThrow(/positiveChoice/);
  });

  test("positiveChoice 미지정 → choices[0] 가정 + appendix caveat 기록", () => {
    const rep = generateFounderInsightReport(
      study([r({ 연령: "30대" }, "쓴다")]),
      opts,
    );
    expect(
      rep.appendix.caveats.some(
        (c) => c.includes("positiveChoice") && c.includes("쓴다"),
      ),
    ).toBe(true);
  });

  test("3지선다 이상이면 collapse caveat 기록", () => {
    const rep = generateFounderInsightReport(
      study([r({ 연령: "30대" }, "써본다")]),
      {
        question: "q",
        choices: ["써본다", "잘모르겠다", "안쓴다"],
        positiveChoice: "써본다",
      },
    );
    expect(rep.appendix.caveats.some((c) => c.includes("중립"))).toBe(true);
  });

  test("overall: 분포·missingRate·n·synthetic panel 라벨", () => {
    const result: StudyResult = {
      responses: [r({ 연령: "30대" }, "쓴다"), r({ 연령: "40대" }, "안쓴다")],
      signal: "split",
      dispersion: 1,
      bySegment: {},
      missing: [{ personaId: "x", reason: "rate limit" }],
    };
    const rep = generateFounderInsightReport(result, opts);
    expect(rep.overallSignal.n).toBe(2);
    expect(rep.overallSignal.missingRate).toBeCloseTo(1 / 3, 4);
    expect(rep.overallSignal.distribution).toEqual({ 쓴다: 1, 안쓴다: 1 });
    expect(rep.overallSignal.label).toContain("실제 시장 반응 아님");
    expect(rep.disclaimer).toContain("synthetic panel response");
  });

  test("처방 필드가 heuristic generator로 채워진다", () => {
    const rep = generateFounderInsightReport(
      study([r({ 연령: "30대" }, "쓴다")]),
      {
        question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
        choices: ["쓴다", "안쓴다"],
      },
    );
    expect(rep.keyDrivers.length).toBeGreaterThan(0);
    expect(rep.recommendedInterviews.length).toBeGreaterThanOrEqual(1);
    expect(rep.interviewQuestions.length).toBeGreaterThanOrEqual(8);
    expect(rep.surveyDraft.length).toBeGreaterThan(0);
    expect(rep.nextValidationPlan.length).toBeGreaterThanOrEqual(5);
    for (const d of [...rep.keyDrivers, ...rep.keyObjections]) {
      expect(d.provenance).toBe("inferred");
      expect(d.basis).toBe("heuristic");
    }
  });

  test("가격 무관 질문(단어 속 원: 직원)에는 가격 위험가정·가격 caveat이 붙지 않는다", () => {
    const rep = generateFounderInsightReport(
      study([r({ 연령: "30대" }, "쓴다"), r({ 연령: "40대" }, "안쓴다")]),
      { question: "직원 복지 앱 쓸 의향?", choices: ["쓴다", "안쓴다"] },
    );
    expect(
      rep.riskyAssumptions.some((a) => a.assumption.includes("가격")),
    ).toBe(false);
  });

  test("테마는 generate에서 1회 계산되어 generator ctx로 전달된다", () => {
    let seen: unknown;
    const stub = {
      drivers: (ctx: { themes?: string[] }) => {
        seen = ctx.themes;
        return { drivers: [], objections: [] };
      },
      interviews: () => [],
      interviewQuestions: () => [],
      survey: () => [],
      landingTests: () => [],
      validationPlan: () => [],
    };
    generateFounderInsightReport(
      study([r({ 연령: "30대" }, "쓴다")]),
      {
        question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
        choices: ["쓴다", "안쓴다"],
      },
      undefined,
      stub,
    );
    expect(seen).toEqual(expect.arrayContaining(["price", "subscription"]));
  });

  test("커스텀 generator를 주입할 수 있다 (issue #4 LLM v2 스왑 지점)", () => {
    const stub = {
      drivers: () => ({ drivers: [], objections: [] }),
      interviews: () => [],
      interviewQuestions: () => [],
      survey: () => [],
      landingTests: () => [],
      validationPlan: () => [],
    };
    const rep = generateFounderInsightReport(
      study([r({ 연령: "30대" }, "쓴다")]),
      { question: "q?", choices: ["A", "B"] },
      undefined,
      stub,
    );
    expect(rep.keyDrivers).toEqual([]);
    expect(rep.nextValidationPlan).toEqual([]);
  });
});

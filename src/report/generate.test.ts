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

  test("처방 배열은 P4-1에서 비어 있음", () => {
    const rep = generateFounderInsightReport(
      study([r({ 연령: "30대" }, "쓴다")]),
      opts,
    );
    expect(rep.recommendedInterviews).toEqual([]);
    expect(rep.interviewQuestions).toEqual([]);
    expect(rep.surveyDraft).toEqual([]);
    expect(rep.landingPageMessageTests).toEqual([]);
    expect(rep.nextValidationPlan).toEqual([]);
    expect(rep.keyDrivers).toEqual([]);
    expect(rep.keyObjections).toEqual([]);
  });
});

import { describe, expect, test } from "vitest";
import type { Response } from "../types.js";
import { buildLLMPrescriptions, sampleReasons } from "./llm-prescriptions.js";

function r(choice: string, answer: string, id = Math.random().toString()) {
  return {
    persona: { id, attrs: { 연령: "30대" }, weight: 1 },
    answer,
    choice,
  } as Response;
}

describe("sampleReasons", () => {
  test("긍정/부정으로 분리하고 reason 미수집(answer==choice)은 제외한다", () => {
    const responses = [
      r("쓴다", "바빠서 새벽배송이 편해요"),
      r("쓴다", "쓴다"), // 폴백 경로 — reason 없음
      r("안쓴다", "가격이 부담돼요"),
      r("안쓴다", "직접 장 보는 게 좋아요"),
    ];
    const { positive, negative } = sampleReasons(responses, "쓴다");
    expect(positive).toEqual(["바빠서 새벽배송이 편해요"]);
    expect(negative).toHaveLength(2);
  });

  test("중복 제거 + side당 상한 + 200자 절단", () => {
    const responses = [
      ...Array.from({ length: 30 }, (_, i) => r("쓴다", `이유 ${i % 5}`)), // 5종만
      r("안쓴다", "가".repeat(300)),
    ];
    const { positive, negative } = sampleReasons(responses, "쓴다", {
      maxPerSide: 3,
    });
    expect(positive).toHaveLength(3);
    expect(new Set(positive).size).toBe(3); // 중복 없음
    expect(negative[0]).toHaveLength(200);
  });

  test("같은 seed는 같은 표본 (결정적)", () => {
    const responses = Array.from({ length: 50 }, (_, i) =>
      r(i % 2 ? "쓴다" : "안쓴다", `이유-${i}`),
    );
    const a = sampleReasons(responses, "쓴다", { maxPerSide: 5, seed: 7 });
    const b = sampleReasons(responses, "쓴다", { maxPerSide: 5, seed: 7 });
    expect(a).toEqual(b);
  });
});

function studyWith(responses: Response[]) {
  return {
    responses,
    signal: "split" as const,
    dispersion: 0.9,
    bySegment: {},
  };
}

const options = {
  question: "월 9900원에 쓸 의향?",
  choices: ["쓴다", "안쓴다"],
};

const llmJson = {
  drivers: [{ label: "시간 절약", rationale: "바쁘다는 이유 다수" }],
  objections: [{ label: "[가격] 지불 저항", rationale: "부담 언급 다수" }],
  interviewQuestions: [
    { text: "최근에 장보기가 부담됐던 순간은?", type: "problem-discovery" },
  ],
};

function respondingProvider(json: unknown) {
  return {
    async ask() {
      return "x";
    },
    async generateJson() {
      return json;
    },
  };
}

describe("buildLLMPrescriptions", () => {
  const responses = [
    ...Array.from({ length: 25 }, (_, i) => r("쓴다", `바빠서 좋아요 ${i}`)),
    ...Array.from({ length: 25 }, (_, i) => r("안쓴다", `비싸요 ${i}`)),
  ];

  test("성공 시 하이브리드 generator: LLM 3종 + heuristic 위임 4종", async () => {
    const gen = await buildLLMPrescriptions({
      provider: respondingProvider(llmJson),
      result: studyWith(responses),
      options,
    });
    expect(gen).not.toBeNull();
    if (!gen) throw new Error("unreachable");
    const ctx = {
      options,
      positiveChoice: "쓴다",
      opportunitySegments: [],
      resistanceSegments: [],
      confidenceCard: {} as never,
      hasPriceSignal: true,
      priceAxisMissing: true,
    };
    const { drivers, objections } = gen.drivers(ctx);
    expect(drivers[0].label).toBe("시간 절약");
    expect(drivers[0].basis).toBe("llm");
    expect(drivers[0].provenance).toBe("inferred");
    expect(drivers[0].confidence).toBe("medium"); // reason 25+25 ≥ 20
    expect(drivers[0].rationale).toContain("응답 이유");
    expect(objections[0].label).toContain("[가격]");
    const qs = gen.interviewQuestions(ctx);
    expect(qs[0].basis).toBe("llm");
    // heuristic 위임 확인 — 기계적 처방은 v1 그대로
    expect(gen.validationPlan(ctx).length).toBeGreaterThanOrEqual(5);
    expect(gen.survey(ctx).some((q) => q.kind === "reason")).toBe(true);
    expect(gen.interviews(ctx).length).toBeGreaterThanOrEqual(1); // 세그먼트 없음 → 탐색 폴백 1개
    expect(gen.landingTests(ctx).length).toBeGreaterThanOrEqual(1);
  });

  test("reason 표본이 20개 미만이면 confidence low", async () => {
    const few = [
      ...Array.from({ length: 5 }, (_, i) => r("쓴다", `이유 ${i}`)),
      ...Array.from({ length: 5 }, (_, i) => r("안쓴다", `이유부정 ${i}`)),
    ];
    const gen = await buildLLMPrescriptions({
      provider: respondingProvider(llmJson),
      result: studyWith(few),
      options,
    });
    expect(gen).not.toBeNull();
    if (!gen) throw new Error("unreachable");
    const { drivers } = gen.drivers({
      options,
      positiveChoice: "쓴다",
      opportunitySegments: [],
      resistanceSegments: [],
      confidenceCard: {} as never,
      hasPriceSignal: false,
      priceAxisMissing: false,
    });
    expect(drivers[0].confidence).toBe("low");
  });

  test("generateJson 미구현 provider는 null", async () => {
    const gen = await buildLLMPrescriptions({
      provider: {
        async ask() {
          return "x";
        },
      },
      result: studyWith(responses),
      options,
    });
    expect(gen).toBeNull();
  });

  test("malformed 응답(스키마 불일치)은 null", async () => {
    const gen = await buildLLMPrescriptions({
      provider: respondingProvider({ nope: true }),
      result: studyWith(responses),
      options,
    });
    expect(gen).toBeNull();
  });

  test("generateJson throw도 null (호출자 heuristic 폴백)", async () => {
    const gen = await buildLLMPrescriptions({
      provider: {
        async ask() {
          return "x";
        },
        async generateJson() {
          throw new Error("boom");
        },
      },
      result: studyWith(responses),
      options,
    });
    expect(gen).toBeNull();
  });
});

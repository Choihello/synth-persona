import { describe, expect, it } from "vitest";
import {
  HeuristicPrescriptionGenerator,
  type PrescriptionContext,
  detectThemes,
} from "./prescriptions.js";
import type { ConfidenceCard, SegmentInsight } from "./types.js";

// biome-ignore lint/suspicious/noExportsInTest: test helpers are intentionally exported
export function fakeLayer(label = "low") {
  return {
    label: label as "high" | "medium" | "low" | "unknown",
    reason: "",
    whatThisAllows: "",
    whatThisDoesNotAllow: "",
  };
}
// biome-ignore lint/suspicious/noExportsInTest: test helpers are intentionally exported
export function fakeCard(): ConfidenceCard {
  return {
    composition: fakeLayer("unknown"),
    attributes: fakeLayer("medium"),
    responseConsistency: fakeLayer("unknown"),
    marketJudgment: fakeLayer("low"),
  };
}
// biome-ignore lint/suspicious/noExportsInTest: test helpers are intentionally exported
export function seg(
  label: string,
  over: Partial<SegmentInsight> = {},
): SegmentInsight {
  return {
    segmentLabel: label,
    segmentDefinition: `${label.split("=")[0]}이(가) "${label.split("=")[1]}"인 응답자`,
    sampleCount: 20,
    sampleWeightShare: 0.2,
    responseDistribution: { 쓴다: 14, 안쓴다: 6 },
    positiveRatio: 0.7,
    signal: "consensus",
    whyItMatters: "",
    likelyReasoning: "",
    confidence: "high",
    caveats: [],
    recommendedFollowUpQuestion: "",
    ...over,
  };
}
// biome-ignore lint/suspicious/noExportsInTest: test helpers are intentionally exported
export function baseCtx(
  over: Partial<PrescriptionContext> = {},
): PrescriptionContext {
  return {
    options: {
      question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
      choices: ["쓴다", "안쓴다"],
    },
    positiveChoice: "쓴다",
    opportunitySegments: [seg("연령=25~29세")],
    resistanceSegments: [seg("연령=50~54세", { positiveRatio: 0.2 })],
    confidenceCard: fakeCard(),
    hasPriceSignal: true,
    priceAxisMissing: true,
    ...over,
  };
}

describe("detectThemes", () => {
  it("가격·구독 키워드를 감지한다", () => {
    expect(detectThemes("월 9900원에 구독?")).toEqual(
      expect.arrayContaining(["price", "subscription"]),
    );
  });
  it("매칭 실패 시 generic 폴백", () => {
    expect(detectThemes("이 색상 어때요?")).toEqual(["generic"]);
  });
});

describe("drivers", () => {
  const gen = new HeuristicPrescriptionGenerator();
  it("모든 driver/objection이 inferred+heuristic+low", () => {
    const { drivers, objections } = gen.drivers(baseCtx());
    for (const d of [...drivers, ...objections]) {
      expect(d.provenance).toBe("inferred");
      expect(d.basis).toBe("heuristic");
      expect(d.confidence).toBe("low");
    }
    expect(drivers.length).toBeGreaterThan(0);
    expect(objections.length).toBeGreaterThan(0);
  });
  it("generic 폴백 시 free-text 수집 필요 문구 포함", () => {
    const ctx = baseCtx({
      options: { question: "이 색상 어때요?", choices: ["A", "B"] },
      hasPriceSignal: false,
    });
    const { drivers } = gen.drivers(ctx);
    expect(drivers.some((d) => d.rationale.includes("인터뷰로 확인"))).toBe(
      true,
    );
  });
});

describe("interviews", () => {
  const gen = new HeuristicPrescriptionGenerator();
  it("기회+저항에서 3~5개 대상, 전부 inferred/heuristic", () => {
    const ctx = baseCtx({
      opportunitySegments: [seg("연령=25~29세"), seg("가구원수=1인가구")],
      resistanceSegments: [seg("연령=50~54세", { positiveRatio: 0.2 })],
    });
    const targets = gen.interviews(ctx);
    expect(targets.length).toBeGreaterThanOrEqual(3);
    expect(targets.length).toBeLessThanOrEqual(5);
    for (const t of targets) {
      expect(t.provenance).toBe("inferred");
      expect(t.basis).toBe("heuristic");
      expect(t.sampleSizeRecommendation).toContain("5~8");
    }
  });
  it("기회/저항이 비면 안전한 폴백 대상을 낸다", () => {
    const ctx = baseCtx({ opportunitySegments: [], resistanceSegments: [] });
    const targets = gen.interviews(ctx);
    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect(targets[0].whyInterview).toContain("랭킹");
  });
  it("기회 1 + 저항 1이면 폴백을 더해 3개를 채운다", () => {
    const ctx = baseCtx(); // 기본 픽스처: opportunity 1개 + resistance 1개
    const targets = gen.interviews(ctx);
    expect(targets.length).toBe(3);
    expect(targets[2].targetLabel).toContain("탐색 보강");
  });
});

describe("interviewQuestions", () => {
  const gen = new HeuristicPrescriptionGenerator();
  it("8~12개, 과거 행동형 질문이 존재하고 가정형 사용의향 직문이 없다", () => {
    const qs = gen.interviewQuestions(baseCtx());
    expect(qs.length).toBeGreaterThanOrEqual(8);
    expect(qs.length).toBeLessThanOrEqual(12);
    expect(qs.some((q) => /최근|마지막|실제로/.test(q.text))).toBe(true);
    expect(qs.some((q) => /쓰시겠어요\?|쓰겠어요\?/.test(q.text))).toBe(false);
  });
  it("가격 테마 + 축 결핍이면 price 질문에 caution", () => {
    const qs = gen.interviewQuestions(baseCtx({ priceAxisMissing: true }));
    const priceQ = qs.find((q) => q.type === "price");
    expect(priceQ).toBeDefined();
    expect(priceQ?.caution).toContain("소득");
  });
});

describe("survey / landingTests / validationPlan", () => {
  const gen = new HeuristicPrescriptionGenerator();
  it("설문에 free-text reason 문항이 있고, 가격 축 결핍 시 price 문항은 optional+caution", () => {
    const out = gen.survey(baseCtx({ priceAxisMissing: true }));
    expect(out.some((q) => q.kind === "reason")).toBe(true);
    const price = out.find((q) => q.kind === "price");
    expect(price?.optional).toBe(true);
    expect(price?.caution).toContain("소득");
  });
  it("랜딩 테스트는 기회 세그먼트를 타겟팅하고 caution을 가진다", () => {
    const tests = gen.landingTests(baseCtx());
    expect(tests.length).toBeGreaterThanOrEqual(1);
    expect(tests[0].targetSegment).toBe("연령=25~29세");
    expect(tests[0].caution).toContain("검토");
  });
  it("기회 세그먼트가 없어도 랜딩 테스트 폴백 1개", () => {
    const tests = gen.landingTests(baseCtx({ opportunitySegments: [] }));
    expect(tests.length).toBe(1);
    expect(tests[0].targetSegment).toContain("미확정");
  });
  it("검증 플랜은 Day 1~7을 덮는다", () => {
    const plan = gen.validationPlan(baseCtx());
    expect(plan.length).toBeGreaterThanOrEqual(5);
    expect(plan[0].day).toContain("Day 1");
    expect(plan[plan.length - 1].day).toContain("Day 7");
  });
});

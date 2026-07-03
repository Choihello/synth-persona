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

import { describe, expect, test } from "vitest";
import type { ReliabilityCard } from "../assess/reliability.js";
import { buildConfidenceCard, buildRiskyAssumptions } from "./confidence.js";

const base: ReliabilityCard = {
  composition: null,
  attributes: [{ dim: "연령", provenance: "matched", confidence: "high" }],
  responseConsistency: { status: "not-measured", reason: "키 필요(묶음 B)" },
  guardrails: ["synthetic panel response — 실제 예측 아님"],
  missingAxes: ["소득", "직업", "자녀"],
};

describe("confidence mapping", () => {
  test("fidelity 없으면(composition null) 구성 신뢰도 unknown (high 추정 금지)", () => {
    const cc = buildConfidenceCard(base);
    expect(cc.composition.label).toBe("unknown");
    expect(cc.composition.reason).toMatch(/검증 정보|미제공/);
  });

  test("composition 있으면 🟢→high", () => {
    const cc = buildConfidenceCard({
      ...base,
      composition: { signal: "🟢", mae: 0, tvd: 0 },
    });
    expect(cc.composition.label).toBe("high");
  });

  test("응답 신뢰도는 항상 unknown(미측정), 시장판단은 low(부정형)", () => {
    const cc = buildConfidenceCard(base);
    expect(cc.responseConsistency.label).toBe("unknown");
    expect(cc.marketJudgment.label).toBe("low");
    expect(cc.marketJudgment.whatThisDoesNotAllow).toMatch(/소득|가격/);
  });

  test("속성에 inferred 섞이면 attributes 신뢰도 low", () => {
    const cc = buildConfidenceCard({
      ...base,
      attributes: [
        { dim: "연령", provenance: "matched", confidence: "high" },
        { dim: "혼인", provenance: "inferred", confidence: "low" },
      ],
    });
    expect(cc.attributes.label).toBe("low");
  });

  test("가격 신호 + 소득축 결핍 → 가격 riskyAssumption 포함", () => {
    const ra = buildRiskyAssumptions(base, true, 0);
    expect(ra.some((a) => a.assumption.includes("가격"))).toBe(true);
  });

  test("low-n 세그먼트 있으면 표본 riskyAssumption 포함", () => {
    const ra = buildRiskyAssumptions(base, false, 3);
    expect(
      ra.some(
        (a) => a.assumption.includes("소표본") || a.whyRisky.includes("minN"),
      ),
    ).toBe(true);
  });

  test("LLM 실측 아님 riskyAssumption은 항상 포함", () => {
    const ra = buildRiskyAssumptions(base, false, 0);
    expect(ra.some((a) => a.assumption.includes("실제 사용자 반응"))).toBe(
      true,
    );
  });
});

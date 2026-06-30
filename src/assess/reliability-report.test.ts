import { describe, expect, test } from "vitest";
import { renderReliabilityCard } from "./reliability-report.js";
import type { ReliabilityCard } from "./reliability.js";

const card: ReliabilityCard = {
  composition: { signal: "🟢", mae: 0, tvd: 0 },
  attributes: [
    { dim: "연령", provenance: "matched", confidence: "high" },
    {
      dim: "가구원수",
      provenance: "conditioned",
      confidence: "medium",
      note: "bridge:householder_age_as_proxy",
    },
  ],
  responseConsistency: { status: "not-measured", reason: "키 필요(묶음 B)" },
  guardrails: [
    "이 숫자는 synthetic panel response입니다 — 실제 구매율/시장 예측이 아닙니다.",
  ],
  missingAxes: ["소득", "직업", "자녀"],
};

describe("renderReliabilityCard", () => {
  test("1·2·3층 + 가드레일 블록을 분리 렌더", () => {
    const md = renderReliabilityCard(card);
    expect(md).toContain("## 신뢰성 카드");
    expect(md).toContain("### 1층 · 구성 신뢰도");
    expect(md).toContain("### 2층 · 속성 신뢰도");
    expect(md).toContain("### 3층 · 응답 신뢰도");
    expect(md).toContain("⚠️ 가드레일");
  });

  test("2층 표에 provenance·신뢰도·bridge note 노출", () => {
    const md = renderReliabilityCard(card);
    expect(md).toContain("| 연령 | matched | 높음 |");
    expect(md).toContain("bridge:householder_age_as_proxy");
  });

  test("3층은 미측정 표기, 가드레일에 synthetic panel response 포함", () => {
    const md = renderReliabilityCard(card);
    expect(md).toContain("not-measured");
    expect(md).toContain("synthetic panel response");
  });

  test("composition null이면 미측정 표기", () => {
    const md = renderReliabilityCard({ ...card, composition: null });
    expect(md).toContain("측정 안 됨");
  });
});

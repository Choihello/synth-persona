import type { ReliabilityCard } from "../assess/reliability.js";
import type { Confidence, ConfidenceCard, RiskyAssumption } from "./types.js";

export function worstAttributeConfidence(card: ReliabilityCard): Confidence {
  const labels = card.attributes.map((a) => a.confidence);
  if (labels.includes("low")) return "low";
  if (labels.includes("unknown") || labels.length === 0) return "unknown";
  if (labels.includes("medium")) return "medium";
  return "high";
}

export function buildConfidenceCard(card: ReliabilityCard): ConfidenceCard {
  const composition = card.composition
    ? {
        label: (card.composition.signal === "🟢"
          ? "high"
          : "medium") as Confidence,
        reason: `통계청 재집계 MAE ${card.composition.mae.toFixed(4)} · TVD ${card.composition.tvd.toFixed(4)}`,
        whatThisAllows: "성·연령·권역 등 패널 구성의 대표성 참고",
        whatThisDoesNotAllow: "응답 내용의 정확성 보증",
      }
    : {
        label: "unknown" as Confidence,
        reason:
          "구성 신뢰도 검증 정보(fidelity)가 미제공되어 통계청 분포 적합도를 알 수 없음",
        whatThisAllows: "패널 구조 참고(주의)",
        whatThisDoesNotAllow: "통계청 분포 적합도 보증",
      };

  const attributes = {
    label: worstAttributeConfidence(card),
    reason:
      card.attributes.map((a) => `${a.dim}:${a.provenance}`).join(", ") ||
      "속성 정보 없음",
    whatThisAllows: "matched 속성 기반 세그먼트 해석",
    whatThisDoesNotAllow: "conditioned/inferred 속성에 기댄 결론의 확신",
  };

  const responseConsistency = {
    label: "unknown" as Confidence,
    reason: card.responseConsistency.reason,
    whatThisAllows: "구조·파이프라인 점검",
    whatThisDoesNotAllow: "LLM 응답 일관성(예스맨/평균회귀) 판단 — 미측정",
  };

  const marketJudgment = {
    label: "low" as Confidence,
    reason: card.guardrails.join(" "),
    whatThisAllows: "방향 가설 탐색 · 인터뷰 대상 좁히기",
    whatThisDoesNotAllow: card.missingAxes.length
      ? `${card.missingAxes.join("·")} 축 없음 — 가격·구매력·실제 구매율 판단`
      : "실측 전이라 의사결정 근거로 사용",
  };

  return { composition, attributes, responseConsistency, marketJudgment };
}

export function buildRiskyAssumptions(
  card: ReliabilityCard,
  hasPriceSignal: boolean,
  observedButHeldCount: number,
): RiskyAssumption[] {
  const out: RiskyAssumption[] = [];
  out.push({
    assumption: "LLM 응답이 실제 사용자 반응과 같다",
    whyRisky:
      "조건화된 가상 응답(synthetic panel)이라 실제 행동과 다를 수 있음",
    howToTest: "우선순위 세그먼트 대상 실제 고객 인터뷰",
  });
  if (hasPriceSignal && card.missingAxes.length) {
    out.push({
      assumption: "이 결과로 가격/구매력을 판단할 수 있다",
      whyRisky: `${card.missingAxes.join("·")} 축이 없어 지불의향 추정 불가`,
      howToTest: "소득 포함 설문 또는 지불의향 인터뷰",
    });
  }
  if (
    card.attributes.some(
      (a) => a.provenance === "conditioned" || a.provenance === "inferred",
    )
  ) {
    out.push({
      assumption:
        "추정(conditioned/inferred) 속성 기반 세그먼트 결론이 견고하다",
      whyRisky: "해당 속성은 연령 경유 조건부 추정이라 상관이 약함",
      howToTest: "해당 속성을 실제 응답자에게 직접 수집",
    });
  }
  if (observedButHeldCount > 0) {
    out.push({
      assumption: "소표본 세그먼트의 신호가 유효하다",
      whyRisky: `${observedButHeldCount}개 세그먼트가 minN 미만 — 우연일 수 있음`,
      howToTest: "표본 수(N)를 늘려 재확인",
    });
  }
  return out;
}

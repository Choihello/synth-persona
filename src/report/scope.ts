import type { FounderInsightReport } from "./types.js";

/**
 * 리포트가 "무엇을 알아냈는가"의 등급.
 *
 * - segmented    — 승격된 세그먼트가 있다(관련성 게이트로 강등된 것 포함). 정상 리포트.
 * - underpowered — 승격 0. 효과는 크지만(≥10%p) 표본이 작아 유의하지 않다(weakSignals)
 *                  또는 minN 미만이라 애초에 효과 크기를 계산조차 하지 못했다(observedButHeld).
 *                  두 경우 모두 표본을 키우면 갈릴 수 있다.
 * - no-effect    — 승격 0, 큰 효과도 없다. 인구 축에서 10%p 이상의 차이가 없다.
 * - unanimous    — 응답이 전부 같다. 인구 구성이 답에 기여한 바가 0이므로,
 *                  전체 비율은 인구 분포가 아니라 언어모델의 사전 판단이다.
 *
 * 순수 함수. 기존 필드만 읽고 아무것도 변형하지 않는다.
 */
export type ScopeVerdict =
  | "segmented"
  | "underpowered"
  | "no-effect"
  | "unanimous";

export function scopeVerdict(report: FounderInsightReport): ScopeVerdict {
  // 승격이 있으면 갈린 것이다.
  if (report.opportunitySegments.length + report.resistanceSegments.length > 0)
    return "segmented";
  // 게이트(10%p + z)를 통과했으나 관련성으로 강등된 것도 "갈렸다" — 없던 차이가 아니다.
  if (report.lowRelevance.length > 0) return "segmented";
  // 응답이 전부 같으면 표본을 키워도 갈릴 수 없다. underpowered보다 먼저 판정한다.
  const buckets = Object.values(report.overallSignal.distribution).filter(
    (v) => v > 0,
  );
  if (buckets.length <= 1) return "unanimous";
  // observedButHeld는 minN 미만이라 효과 크기를 "계산조차 하지 않은" 세그먼트다
  // (segments.ts가 early continue). weakSignals에 절대 들어오지 못하므로 함께 본다.
  // 표본이 실제로 원인인 경우다 — 표본을 키우면 갈릴 수 있다.
  if (report.weakSignals.length > 0 || report.observedButHeld.length > 0)
    return "underpowered";
  return "no-effect";
}

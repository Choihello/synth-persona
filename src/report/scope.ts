import type { FounderInsightReport } from "./types.js";

/**
 * 리포트가 "무엇을 알아냈는가"의 등급.
 *
 * - segmented    — 승격된 세그먼트가 있다. 정상 리포트.
 * - underpowered — 승격 0. 효과는 크지만(≥10%p) 표본이 작아 유의하지 않다. 표본을 키우면 갈릴 수 있다.
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
  // 방어적: 논리상 만장일치면 승격이 불가능하지만, 그런 입력이 와도 승격을 우선한다.
  if (report.opportunitySegments.length + report.resistanceSegments.length > 0)
    return "segmented";
  const buckets = Object.values(report.overallSignal.distribution).filter(
    (v) => v > 0,
  );
  if (buckets.length <= 1) return "unanimous";
  if (report.weakSignals.length > 0) return "underpowered";
  return "no-effect";
}

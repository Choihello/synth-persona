/** 표면(CLI·markdown 리포트·검증 리포트) 공통 표기 규칙 — 한 곳에서만 정의한다. */

/** 응답 분포를 "쓴다=14, 안쓴다=6" 형태로. */
export function formatDistribution(dist: Record<string, number>): string {
  return Object.entries(dist)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

/** 비율 → 퍼센트 문자열. 자릿수는 표면별로 다르게 쓴다 (CLI/검증 0, 리포트 1). */
export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** 신호 → 이모지 (split=🔴, 그 외=🟢). */
export function signalDot(signal: string): string {
  return signal === "split" ? "🔴" : "🟢";
}

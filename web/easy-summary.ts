/**
 * 쉬운 요약 카드 ("한눈에 보기") — 통계 문외한용 생활 언어 요약을
 * 구조화 리포트에서 결정적으로 생성한다 (LLM 없음, md 재파싱 없음).
 * 스펙: docs/superpowers/specs/2026-07-05-easy-summary-design.md
 */

const SEX_MAP: Record<string, string> = { 여자: "여성", 남자: "남성" };

/** "차원=값" 세그먼트 라벨 → 생활 언어. 모르는 차원은 원문 그대로. */
export function humanizeSegmentLabel(label: string): string {
  const eq = label.indexOf("=");
  if (eq < 0) return label;
  const dim = label.slice(0, eq);
  const val = label.slice(eq + 1);
  switch (dim) {
    case "연령":
    case "혼인":
      return val;
    case "지역":
      return `${val} 거주자`;
    case "성":
      return SEX_MAP[val] ?? val;
    case "가구원수": {
      const m = val.match(/(\d+)명/);
      return m ? `${m[1]}인 가구` : val;
    }
    default:
      return label;
  }
}

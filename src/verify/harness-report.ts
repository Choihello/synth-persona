export interface HarnessFindings {
  selfConsistency?: number;
  modeCollapse?: { meanDispersion: number; collapsed: boolean };
  paraphraseStable?: boolean;
  orderBiased?: boolean;
  drift?: { regressed: boolean; directionAccuracyDelta: number };
}

const mark = (ok: boolean) => (ok ? "✅" : "⚠️");

export function renderHarnessReport(title: string, f: HarnessFindings): string {
  const lines: string[] = [`# ${title}`, "", "## 검증 하네스 점검", ""];
  if (f.selfConsistency !== undefined) {
    lines.push(
      `- ${mark(f.selfConsistency >= 0.8)} 자기일관성: ${f.selfConsistency.toFixed(2)}`,
    );
  }
  if (f.modeCollapse) {
    lines.push(
      `- ${mark(!f.modeCollapse.collapsed)} 모드붕괴(평균회귀): 분산 ${f.modeCollapse.meanDispersion.toFixed(2)}${f.modeCollapse.collapsed ? " — ⚠️ 응답이 지나치게 균일(평균회귀 의심)" : ""}`,
    );
  }
  if (f.paraphraseStable !== undefined) {
    lines.push(
      `- ${mark(f.paraphraseStable)} 패러프레이즈 안정성: ${f.paraphraseStable ? "안정" : "⚠️ 표현 바꾸면 결과 흔들림"}`,
    );
  }
  if (f.orderBiased !== undefined) {
    lines.push(
      `- ${mark(!f.orderBiased)} 순서 편향: ${f.orderBiased ? "⚠️ 선택지 순서가 결과를 바꿈" : "없음"}`,
    );
  }
  if (f.drift) {
    lines.push(
      `- ${mark(!f.drift.regressed)} 드리프트: 방향정확도 Δ ${f.drift.directionAccuracyDelta.toFixed(2)}${f.drift.regressed ? " — ⚠️ fidelity 회귀" : ""}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

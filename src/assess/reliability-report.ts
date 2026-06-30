import type { Confidence, ReliabilityCard } from "./reliability.js";

const CONF_LABEL: Record<Confidence, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
  unknown: "알수없음",
};

export function renderReliabilityCard(card: ReliabilityCard): string {
  const lines: string[] = ["## 신뢰성 카드", ""];

  lines.push("### 1층 · 구성 신뢰도 (통계청 분포 적합)");
  if (card.composition) {
    lines.push(
      `- ${card.composition.signal} MAE ${card.composition.mae.toFixed(4)} · TVD ${card.composition.tvd.toFixed(4)}`,
    );
  } else {
    lines.push("- _측정 안 됨 (fidelity 미제공)_");
  }
  lines.push("");

  lines.push("### 2층 · 속성 신뢰도 (provenance)");
  lines.push("| 속성 | provenance | 신뢰도 | 비고 |");
  lines.push("|---|---|---|---|");
  for (const a of card.attributes) {
    lines.push(
      `| ${a.dim} | ${a.provenance} | ${CONF_LABEL[a.confidence]} | ${a.note ?? ""} |`,
    );
  }
  lines.push("");

  lines.push("### 3층 · 응답 신뢰도 (LLM 일관성)");
  lines.push(
    `- _${card.responseConsistency.status} — ${card.responseConsistency.reason}_`,
  );
  lines.push("");

  lines.push("### ⚠️ 가드레일 — 이 결과로 하지 말 것");
  for (const g of card.guardrails) lines.push(`- ${g}`);
  lines.push("");

  return lines.join("\n");
}

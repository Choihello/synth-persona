import type { BlockFidelity, FidelityReport } from "./fidelity.js";

const dot = (mae: number, tol = 0.01) => (mae <= tol ? "🟢" : "⚠️");

function row(b: BlockFidelity): string {
  return `| ${b.name} | ${b.provenance} | ${dot(b.mae)} | ${b.mae.toFixed(4)} | ${b.tvd.toFixed(4)} | ${b.maxError.key} (${b.maxError.actual.toFixed(3)} vs ${b.maxError.expected.toFixed(3)}) |`;
}

export function renderFidelityReport(title: string, r: FidelityReport): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    "## 1층 신뢰: 합성 인구 ↔ 통계청 원본",
    "",
  ];
  lines.push("| 블록 | provenance | 신호 | MAE | TVD | 최대오차 셀 |");
  lines.push("|---|---|---|---|---|---|");
  lines.push(row(r.core));
  for (const c of r.conditional) lines.push(row(c));
  lines.push("");
  lines.push(`- **matched(실측 joint)**: ${r.matched.join(", ")}`);
  lines.push(
    `- **conditioned/estimated(부착·추정)**: ${r.conditioned.join(", ")}`,
  );
  lines.push("");
  lines.push(
    "> core는 실측 joint를 가중 열거하므로 재집계 오차 ≈0이 정상(벗어나면 버그). conditional은 연령 앵커 조건부라 해당 변수 간 상관은 연령 경유만 — estimated로 해석할 것.",
  );
  return lines.join("\n");
}

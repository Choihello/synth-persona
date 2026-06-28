import type { StudyResult } from "../types.js";
import type { CalibrationReport } from "./calibrate.js";

export interface ReportInput {
  title: string;
  result?: StudyResult;
  calibration?: CalibrationReport;
}

const dot = (s: string) => (s === "split" ? "🔴" : "🟢");
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function renderResult(result: StudyResult): string {
  const lines: string[] = [];
  lines.push(`## 종합 신호`);
  lines.push("");
  lines.push(`- 전체: ${dot(result.signal)} **${result.signal}** (분산 ${result.dispersion.toFixed(2)})`);
  lines.push("");
  for (const [dim, segs] of Object.entries(result.bySegment)) {
    lines.push(`### ${dim}별`);
    lines.push("");
    lines.push("| 세그먼트 | 신호 | 분포 |");
    lines.push("|---|---|---|");
    for (const [val, s] of Object.entries(segs)) {
      const bd = Object.entries(s.breakdown).map(([k, v]) => `${k}=${v}`).join(", ");
      lines.push(`| ${val} | ${dot(s.signal)} ${s.signal} | ${bd} |`);
    }
    lines.push("");
  }
  const split = Object.entries(result.bySegment).flatMap(([dim, segs]) =>
    Object.entries(segs).filter(([, s]) => s.signal === "split").map(([val]) => `${dim}=${val}`),
  );
  if (split.length) {
    lines.push(`> 🔴 **여기 조사 권장:** ${split.join(", ")} — 의견이 갈리므로 진짜 조사를 조준하세요.`);
    lines.push("");
  }
  return lines.join("\n");
}

function renderCalibration(cal: CalibrationReport): string {
  const lines: string[] = [];
  lines.push(`## 캘리브레이션 (fidelity)`);
  lines.push("");
  lines.push(`- 평균 순위상관: **${cal.meanRankCorrelation.toFixed(2)}**`);
  lines.push(`- 점유 MAE: **${cal.shareMAE.toFixed(2)}**`);
  lines.push(`- 방향 정확도: **${pct(cal.directionAccuracy)}**`);
  lines.push("");
  if (cal.cases.length) {
    lines.push("| 사례 | 순위상관 | MAE | 방향적중 |");
    lines.push("|---|---|---|---|");
    for (const c of cal.cases) {
      lines.push(`| ${c.id} | ${c.rankCorrelation.toFixed(2)} | ${c.shareMAE.toFixed(2)} | ${c.directionHit ? "✅" : "❌"} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderMarkdownReport(input: ReportInput): string {
  const parts: string[] = [`# ${input.title}`, ""];
  if (input.result) parts.push(renderResult(input.result));
  if (input.calibration) parts.push(renderCalibration(input.calibration));
  if (!input.result && !input.calibration) parts.push("_표시할 결과가 없습니다._");
  return parts.join("\n");
}

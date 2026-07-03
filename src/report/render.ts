import type {
  ConfidenceLayer,
  FounderInsightReport,
  SegmentInsight,
} from "./types.js";

export const HELD_CAP = 10;

export const AI_DRAFT_BANNER =
  "> ⚠️ **AI 생성 초안 · 검토 필요** — 아래 항목은 heuristic으로 생성된 추정 초안입니다. 그대로 쓰지 말고 반드시 검토·수정하세요.";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function segmentLines(s: SegmentInsight): string[] {
  const dist = Object.entries(s.responseDistribution)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const lines = [
    `### ${s.segmentLabel}  (n=${s.sampleCount} · 긍정 ${pct(s.positiveRatio)} · 신뢰도 ${s.confidence})`,
    `- 분포: ${dist} · 인구 가중 비율 ≈ ${pct(s.sampleWeightShare)}`,
    `- 왜 중요한가: ${s.whyItMatters}`,
    `- 다음 질문: ${s.recommendedFollowUpQuestion}`,
  ];
  for (const c of s.caveats) lines.push(`- ⚠️ ${c}`);
  return lines;
}

function layerLines(name: string, l: ConfidenceLayer): string[] {
  return [
    `| ${name} | ${l.label} | ${l.reason} | ${l.whatThisAllows} | ${l.whatThisDoesNotAllow} |`,
  ];
}

export function renderFounderInsightReport(
  report: FounderInsightReport,
): string {
  const md: string[] = [];
  // ① 제목 + 상단 라벨
  md.push(`# ${report.title}`, "", `> ⚠️ ${report.disclaimer}`, "");
  // ② 한 줄 요약
  const es = report.executiveSummary;
  md.push("## 한 줄 요약", "", es.headline, "");
  if (es.topOpportunity) md.push(`- 최우선 기회: **${es.topOpportunity}**`);
  if (es.topResistance) md.push(`- 최대 저항: **${es.topResistance}**`);
  md.push(
    `- 아직 믿으면 안 되는 것: ${es.doNotTrustYet}`,
    `- 이번 주 행동: ${es.thisWeekAction}`,
    "",
  );
  // ③ 전체 신호
  const o = report.overallSignal;
  const dist = Object.entries(o.distribution)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  md.push(
    "## 전체 신호",
    "",
    `- ${o.signal === "split" ? "🔴 split(분열)" : "🟢 consensus(합의)"} · 응답 분포: ${dist}`,
    `- n=${o.n}${o.seed != null ? ` · seed=${o.seed}` : ""}${o.provider ? ` · provider=${o.provider}` : ""} · 누락률 ${pct(o.missingRate)}`,
    `- ${o.label}`,
    "",
  );
  // ④ 기회 세그먼트
  md.push("## 기회 세그먼트", "");
  if (report.opportunitySegments.length === 0)
    md.push("(minN을 넘는 기회 세그먼트 없음)", "");
  for (const s of report.opportunitySegments) md.push(...segmentLines(s), "");
  // ⑤ 저항 세그먼트 + 판단 보류 cap
  md.push("## 저항 세그먼트", "");
  if (report.resistanceSegments.length === 0)
    md.push("(minN을 넘는 저항 세그먼트 없음)", "");
  for (const s of report.resistanceSegments) md.push(...segmentLines(s), "");
  if (report.observedButHeld.length > 0) {
    md.push("### 판단 보류 (표본 부족)", "");
    for (const s of report.observedButHeld.slice(0, HELD_CAP)) {
      md.push(
        `- ${s.segmentLabel} (n=${s.sampleCount}) — 표본 부족으로 랭킹 제외`,
      );
    }
    const rest = report.observedButHeld.length - HELD_CAP;
    if (rest > 0) md.push(`- …외 ${rest}개 (판단 보류)`);
    md.push("");
  }
  // ⑥ 관심/거부 이유
  md.push("## 관심을 끄는 이유 / 거부 이유 (추정)", "", AI_DRAFT_BANNER, "");
  for (const d of report.keyDrivers)
    md.push(`- ✅ **${d.label}** — ${d.rationale} _(신뢰도 ${d.confidence})_`);
  for (const d of report.keyObjections)
    md.push(`- ❌ **${d.label}** — ${d.rationale} _(신뢰도 ${d.confidence})_`);
  md.push("");
  // ⑦ 위험한 가정
  md.push("## 위험한 가정", "");
  for (const a of report.riskyAssumptions) {
    md.push(
      `- **${a.assumption}**`,
      `  - 왜 위험한가: ${a.whyRisky}`,
      `  - 검증 방법: ${a.howToTest}`,
    );
  }
  md.push("");
  // ⑧ 신뢰도 카드
  md.push(
    "## 신뢰도 카드",
    "",
    "| 층 | 신뢰도 | 근거 | 허용되는 사용 | 허용 안 되는 사용 |",
    "|---|---|---|---|---|",
    ...layerLines("1층 · 패널 구성", report.confidenceCard.composition),
    ...layerLines("2층 · 속성 출처", report.confidenceCard.attributes),
    ...layerLines(
      "3층 · 응답 일관성",
      report.confidenceCard.responseConsistency,
    ),
    ...layerLines("4층 · 시장 판단", report.confidenceCard.marketJudgment),
    "",
  );
  // ⑨~⑬ 처방 섹션은 Task 6에서 추가
  md.push(`> ⚠️ ${report.disclaimer}`); // ⑬ 하단 라벨 (처방 섹션은 이 앞에 삽입됨)
  return md.join("\n");
}

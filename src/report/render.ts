import { formatDistribution, pct as pctBase, signalDot } from "../format.js";
import type {
  ConfidenceLayer,
  FounderInsightReport,
  SegmentInsight,
} from "./types.js";

export const HELD_CAP = 10;

export const AI_DRAFT_BANNER =
  "> ⚠️ **AI 생성 초안 · 검토 필요** — 아래 항목은 heuristic으로 생성된 추정 초안입니다. 그대로 쓰지 말고 반드시 검토·수정하세요.";

const pct = (x: number) => pctBase(x, 1); // 리포트는 소수 1자리

function segmentLines(s: SegmentInsight): string[] {
  const dist = formatDistribution(s.responseDistribution);
  const lines = [
    `### ${s.segmentLabel}  (n=${s.sampleCount} · 페르소나 ${s.personaCount}명 · 긍정 ${pct(s.positiveRatio)} · 신뢰도 ${s.confidence})`,
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
  const dist = formatDistribution(o.distribution);
  md.push(
    "## 전체 신호",
    "",
    `- ${signalDot(o.signal)} ${o.signal === "split" ? "split(분열)" : "consensus(합의)"} · 응답 분포: ${dist}`,
    `- ${o.panelSize != null ? `표본 ${o.panelSize}명 · 각 3회 응답(총 ${o.n})` : `n=${o.n}`}${o.seed != null ? ` · seed=${o.seed}` : ""}${o.provider ? ` · provider=${o.provider}` : ""} · 누락률 ${pct(o.missingRate)}`,
    `- ${o.label}`,
    "",
  );
  // ⑥ 관심/거부 이유 (알맹이 — 세그먼트보다 위로)
  md.push("## 관심을 끄는 이유 / 거부 이유 (추정)", "", AI_DRAFT_BANNER, "");
  for (const d of report.keyDrivers)
    md.push(`- ✅ **${d.label}** — ${d.rationale} _(신뢰도 ${d.confidence})_`);
  for (const d of report.keyObjections)
    md.push(`- ❌ **${d.label}** — ${d.rationale} _(신뢰도 ${d.confidence})_`);
  md.push("");
  // ④ 기회 세그먼트
  md.push("## 기회 세그먼트", "");
  // 게이트 통과분도 다중비교 보정은 없다 — 과신 방지 고지 (승격이 있을 때만)
  if (
    report.opportunitySegments.length > 0 ||
    report.resistanceSegments.length > 0
  )
    md.push(
      "_순위에 오른 차이도 가설입니다 — 여러 세그먼트를 동시에 비교하므로(다중비교 무보정) 일부는 우연일 수 있습니다._",
      "",
    );
  if (report.opportunitySegments.length === 0)
    md.push(
      "이 규모(표본 소수)에선 세그먼트별 차이가 통계적으로 뚜렷하지 않았어요 — 전체 방향(위)이 핵심 신호입니다. 세그먼트로 쪼개 보려면 표본을 키우세요.",
      "",
    );
  for (const s of report.opportunitySegments) md.push(...segmentLines(s), "");
  // ⑤ 저항 세그먼트 + 판단 보류 cap
  md.push("## 저항 세그먼트", "");
  if (report.resistanceSegments.length === 0)
    md.push(
      "이 규모(표본 소수)에선 세그먼트별 차이가 통계적으로 뚜렷하지 않았어요 — 전체 방향(위)이 핵심 신호입니다. 세그먼트로 쪼개 보려면 표본을 키우세요.",
      "",
    );
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
  // 참고 — 순위에 올리지 않은 차이 (관련성 낮음 + 약한 신호 + 우연 범위)
  if (
    report.lowRelevance.length > 0 ||
    report.weakSignals.length > 0 ||
    report.withinNoise.length > 0
  ) {
    md.push(
      "## 확실한 것만 추렸습니다",
      "",
      "_아래는 표본 대비 작아 순위·가설에서 보류한 차이입니다._",
      "",
    );
    for (const s of report.lowRelevance) {
      const why =
        s.caveats.find((c) => c.includes("관련성이 낮아")) ??
        "질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단)";
      md.push(
        `- ${s.segmentLabel} (긍정 ${pct(s.positiveRatio)} · 페르소나 ${s.personaCount}명) — ${why}`,
      );
    }
    for (const s of report.weakSignals.slice(0, 5)) {
      md.push(
        `- ${s.segmentLabel} (긍정 ${pct(s.positiveRatio)} · 페르소나 ${s.personaCount}명) — 표본이 작아 우연일 수 있음`,
      );
    }
    if (report.withinNoise.length > 0) {
      md.push(
        `- 그 외 ${report.withinNoise.length}개 차이는 우연 범위(±10%p 미만) — 표본 대비 작아 판단 보류`,
      );
    }
    md.push("");
  }
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
  // ⑨ 추천 인터뷰
  md.push("## 추천 인터뷰 대상", "", AI_DRAFT_BANNER, "");
  for (const t of report.recommendedInterviews) {
    md.push(
      `### ${t.targetLabel}`,
      `- 왜: ${t.whyInterview}`,
      `- 검증할 것: ${t.whatToValidate}`,
      `- 모집 스크리너: ${t.suggestedRecruitingScreener}`,
      `- 권장 인원: ${t.sampleSizeRecommendation}`,
      "",
    );
  }
  // ⑩ 인터뷰 질문
  md.push("## 인터뷰 질문 초안", "", AI_DRAFT_BANNER, "");
  report.interviewQuestions.forEach((q, i) => {
    md.push(
      `${i + 1}. ${q.text} _(${q.type})_${q.caution ? ` — ⚠️ ${q.caution}` : ""}`,
    );
  });
  md.push("");
  // ⑪ 설문 초안
  md.push("## 설문 문항 초안", "", AI_DRAFT_BANNER, "");
  report.surveyDraft.forEach((q, i) => {
    md.push(
      `${i + 1}. ${q.text} _(${q.kind}${q.optional ? " · optional" : ""})_${q.caution ? ` — ⚠️ ${q.caution}` : ""}`,
    );
  });
  md.push("");
  // ⑫ 랜딩 메시지 테스트
  md.push("## 랜딩 메시지 테스트", "", AI_DRAFT_BANNER, "");
  for (const t of report.landingPageMessageTests) {
    md.push(
      `### ${t.headline}`,
      `- 서브카피: ${t.subcopy}`,
      `- 타겟: ${t.targetSegment}`,
      `- 가설: ${t.hypothesis}`,
      `- 성공 지표: ${t.successMetric}`,
      `- ⚠️ ${t.caution}`,
      "",
    );
  }
  // ⑬ 다음 7일
  md.push("## 다음 7일", "");
  for (const a of report.nextValidationPlan)
    md.push(`- **${a.day}**: ${a.action}`);
  md.push("");
  // ⑧ 신뢰도 카드 (부록 — 출처 직전)
  md.push(
    "## 기술 상세 — 신뢰도 4층",
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
  // ⑭ 출처 표기 (해당 시) — 데이터 근거(census)와 서사(Nemotron) 저작자표시를 계층화
  const dataSource = report.appendix.caveats.filter((c) =>
    c.startsWith("데이터 근거:"),
  );
  const narrativeSource = report.appendix.caveats.filter((c) =>
    c.startsWith("페르소나 서사:"),
  );
  if (dataSource.length > 0 || narrativeSource.length > 0) {
    md.push("## 출처", "");
    for (const a of dataSource) md.push(`- ${a}`);
    for (const a of narrativeSource) md.push(`- ${a}`);
    md.push("");
  }
  md.push(`> ⚠️ ${report.disclaimer}`); // 하단 라벨
  return md.join("\n");
}

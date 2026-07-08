import { formatDistribution, pct as pctBase, signalDot } from "../format.js";
import { type ScopeVerdict, scopeVerdict } from "./scope.js";
import type {
  ConfidenceLayer,
  FounderInsightReport,
  SegmentInsight,
} from "./types.js";

export const HELD_CAP = 10;

export const AI_DRAFT_BANNER =
  "> 📝 **규칙 기반으로 파생된 초안입니다(LLM 아님).** 검증 설계의 출발점으로 쓰고, 실제 고객의 문장으로 교체하세요.";

export const LLM_SUMMARY_BANNER =
  "> 💡 **실제 응답 이유를 종합한 AI 요약** — 패널의 실제 응답 이유를 묶은 것입니다. 참고로 쓰고 실제 고객으로 검증하세요.";

export const LLM_QUESTION_BANNER =
  "> 💬 **패널이 실제로 답한 이유에서 도출된 질문입니다.** 그대로 물어보기 전에 실제 고객으로 검증하세요.";

export const OUT_OF_SCOPE_BANNER_UNANIMOUS =
  "> ⚠️ **이 질문은 이 도구의 범위 밖입니다.** 표본 전원이 매번 같은 선택을 했습니다 — 인구 구성이 답을 전혀 바꾸지 못했습니다. 따라서 아래 비율은 통계청 인구 분포가 아니라 **언어모델의 사전 판단**입니다.";

export const OUT_OF_SCOPE_BANNER_NO_EFFECT =
  "> ⚠️ **인구 축에서 갈리지 않았습니다.** 검정할 수 있었던 인구 축(연령·성·지역·가구원수·혼인) 어디에서도 10%p 이상의 차이가 없었습니다 — 이 질문의 답은 인구 구성보다 다른 요인에 달려 있을 가능성이 큽니다.";

/** 표본이 작아 유의하지 않았을 뿐, 효과는 관측된 경우 — 표본을 키우면 갈릴 수 있다. */
export const NO_SEGMENT_UNDERPOWERED =
  "이 규모(표본 소수)에선 세그먼트별 차이가 통계적으로 뚜렷하지 않았어요 — 전체 방향(위)이 핵심 신호입니다. 세그먼트로 쪼개 보려면 표본을 키우세요.";

/**
 * 인구 축에서 의사결정에 쓸 만한 크기(10%p)의 차이 자체가 없는 경우.
 * 10%p는 의사결정 임계이지 진실의 경계가 아니므로 "안 갈린다"고 단언하지 않는다.
 */
export const NO_SEGMENT_NO_EFFECT =
  "검정할 수 있었던 인구 축(연령·성·지역·가구원수·혼인)에서 10%p 이상 벌어지는 차이가 없었습니다. 표본을 키워도 이 축들로는 갈리지 않을 가능성이 큽니다 — 전체 비율을 세그먼트 근거로 쓰지 마세요.";

/** 승격이 어딘가 있는데 이 방향만 비었을 때. 전 축에 대한 주장을 하면 안 된다. */
export const NO_SEGMENT_DIRECTIONAL =
  "이 방향에서는 순위에 올릴 만큼 뚜렷한 세그먼트가 없었습니다. 반대 방향은 다른 섹션을 보세요.";

function noSegmentLine(scope: ScopeVerdict): string {
  if (scope === "segmented") return NO_SEGMENT_DIRECTIONAL;
  if (scope === "underpowered") return NO_SEGMENT_UNDERPOWERED;
  return NO_SEGMENT_NO_EFFECT;
}

/**
 * unanimous 전용 헤드라인.
 * generate.ts:182의 headline은 result.signal에서 파생되는데, signal은 분산이 낮으면
 * (완전한 무변별을 포함해) 늘 "consensus"다. generate.ts는 그 값을 "합의된 반응"이라고
 * 적지만, 표본 전원이 매번 같은 답을 한 것과 "시장이 합의했다"는 서로 다른 주장이다 —
 * 이 리포트는 인구 구성이 답에 전혀 기여하지 않았다는 것만 보여줄 뿐, 실제 시장의
 * 의견 일치 여부는 알 수 없다. 이 혼동을 막으려고 이 브랜치가 존재한다.
 */
const UNANIMOUS_HEADLINE =
  "표본 전원이 같은 선택을 했습니다. 이 결과로는 시장이 합의했는지 알 수 없습니다.";

/**
 * generate.ts:208의 thisWeekAction 폴백("표본이 큰 세그먼트부터 인터뷰 설계")은
 * 승격된 세그먼트가 없을 때 쓰이는데, unanimous/no-effect에서는 인구 축 자체가
 * 답을 가르지 못했으므로 표본을 더 모아도 이 축들로는 갈리지 않을 가능성이 크다.
 * 원문은 지우지 않고(정직성 신호 보존) 뒤에 보정만 덧붙인다.
 */
const THIS_WEEK_ACTION_CORRECTION =
  " — 단, 표본을 키워도 이 인구 축들로는 갈리지 않을 가능성이 큽니다. 인구 축 밖의 변수(사용 맥락·가격·대체재)로 질문을 다시 세우세요.";

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

/**
 * 액션의 대상 라벨을 승격 세그먼트와 조인해 근거 수치를 끌어온다.
 * 조인 실패 시 undefined — 없는 근거를 지어내지 않는다.
 */
function segmentAnchor(
  report: FounderInsightReport,
  label: string,
): string | undefined {
  const hit = (list: SegmentInsight[], kind: string) => {
    const s = list.find((x) => x.segmentLabel === label);
    return s
      ? `- ← ${kind}: 긍정 ${pct(s.positiveRatio)} · 신뢰도 ${s.confidence}`
      : undefined;
  };
  return (
    hit(report.opportunitySegments, "기회 세그먼트") ??
    hit(report.resistanceSegments, "저항 세그먼트")
  );
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
  const scope: ScopeVerdict = scopeVerdict(report);
  // ① 제목 + 상단 라벨
  md.push(`# ${report.title}`, "", `> ⚠️ ${report.disclaimer}`, "");
  // ② 한 줄 요약
  const es = report.executiveSummary;
  md.push("## 한 줄 요약", "");
  if (scope === "unanimous") md.push(OUT_OF_SCOPE_BANNER_UNANIMOUS, "");
  else if (scope === "no-effect") md.push(OUT_OF_SCOPE_BANNER_NO_EFFECT, "");
  md.push(scope === "unanimous" ? UNANIMOUS_HEADLINE : es.headline, "");
  if (es.topOpportunity) md.push(`- 최우선 기회: **${es.topOpportunity}**`);
  if (es.topResistance) md.push(`- 최대 저항: **${es.topResistance}**`);
  // 정직성 신호는 "못 하는 말"만 두지 않는다 — 부록 신뢰도 4층의 허용 범위를 짝지어 올린다.
  // 단 세그먼트가 갈리지 않았으면 "인터뷰 대상 좁히기"는 거짓이므로 보정한다(원 문자열은 보존).
  const mj = report.confidenceCard.marketJudgment;
  const allowsSuffix =
    scope === "segmented"
      ? ""
      : " — 단, 이 질문에선 세그먼트가 갈리지 않아 인터뷰 대상을 좁힐 수 없습니다.";
  md.push(
    `- 이 리포트로 할 수 있는 것: ${mj.whatThisAllows}${allowsSuffix}`,
    `- 아직 믿으면 안 되는 것: ${es.doNotTrustYet}`,
    `- 이번 주 행동: ${es.thisWeekAction}${scope === "unanimous" || scope === "no-effect" ? THIS_WEEK_ACTION_CORRECTION : ""}`,
    "",
  );
  // ③ 전체 신호
  const o = report.overallSignal;
  const dist = formatDistribution(o.distribution);
  // 반복 응답 수는 하드코딩하지 않고 응답수/표본으로 유도한다(데모·CLI의 repeats≠3도 정확).
  const repeats =
    o.panelSize && o.panelSize > 0 ? Math.round(o.n / o.panelSize) : 0;
  const sampleLabel =
    o.panelSize != null
      ? repeats >= 2
        ? `표본 ${o.panelSize}명 · 각 ${repeats}회 응답(총 ${o.n})`
        : `표본 ${o.panelSize}명`
      : `n=${o.n}`;
  // unanimous면 "합의"가 아니라 "무변별"이다 — signal 필드는 건드리지 않고 표시만 바꾼다.
  const signalLabel =
    scope === "unanimous"
      ? "⚪ 응답 전부 동일"
      : `${signalDot(o.signal)} ${o.signal === "split" ? "split(분열)" : "consensus(합의)"}`;
  md.push(
    "## 전체 신호",
    "",
    `- ${signalLabel} · 응답 분포: ${dist}`,
    `- ${sampleLabel}${o.seed != null ? ` · seed=${o.seed}` : ""}${o.provider ? ` · provider=${o.provider}` : ""} · 누락률 ${pct(o.missingRate)}`,
    `- ${o.label}`,
    "",
  );
  // ⑥ 관심/거부 이유 (알맹이 — 세그먼트보다 위로)
  const reasonsAreLLM = [...report.keyDrivers, ...report.keyObjections].some(
    (d) => d.basis === "llm",
  );
  md.push(
    "## 관심을 끄는 이유 / 거부 이유 (추정)",
    "",
    reasonsAreLLM ? LLM_SUMMARY_BANNER : AI_DRAFT_BANNER,
    "",
  );
  for (const d of report.keyDrivers)
    md.push(`- ✅ **${d.label}** — ${d.rationale} _(신뢰도 ${d.confidence})_`);
  for (const d of report.keyObjections)
    md.push(`- ❌ **${d.label}** — ${d.rationale} _(신뢰도 ${d.confidence})_`);
  md.push("");
  // ④ 기회 세그먼트
  md.push("## 기회 세그먼트", "");
  // 조용한 소실 금지 — 버킷은 안 만들었지만 제외했다는 사실은 밝힌다.
  const skippedDims = report.appendix.skippedDims;
  if (skippedDims && skippedDims.length > 0)
    md.push(
      `_비교에서 제외된 축: ${skippedDims.join(" · ")} — 이 패널에서 값이 하나뿐이라 대조군이 없습니다._`,
      "",
    );
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
    md.push(noSegmentLine(scope), "");
  for (const s of report.opportunitySegments) md.push(...segmentLines(s), "");
  // ⑤ 저항 세그먼트 + 판단 보류 cap
  md.push("## 저항 세그먼트", "");
  if (report.resistanceSegments.length === 0) md.push(noSegmentLine(scope), "");
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
    md.push(`### ${t.targetLabel}`);
    const anchor = segmentAnchor(report, t.targetLabel);
    if (anchor) md.push(anchor);
    md.push(
      `- 왜: ${t.whyInterview}`,
      `- 검증할 것: ${t.whatToValidate}`,
      `- 모집 스크리너: ${t.suggestedRecruitingScreener}`,
      `- 권장 인원: ${t.sampleSizeRecommendation}`,
      "",
    );
  }
  // ⑩ 인터뷰 질문 — basis가 전부 llm이면 실측 도출 배너 (llm-prescriptions가 생성)
  const questionsAreLLM =
    report.interviewQuestions.length > 0 &&
    report.interviewQuestions.every((q) => q.basis === "llm");
  md.push(
    "## 인터뷰 질문 초안",
    "",
    questionsAreLLM ? LLM_QUESTION_BANNER : AI_DRAFT_BANNER,
    "",
  );
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
    md.push(`### ${t.headline}`);
    const anchor = segmentAnchor(report, t.targetSegment);
    if (anchor) md.push(anchor);
    md.push(
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
    "> 용어: matched(실측 일치) · conditioned/inferred(추정) · unknown(측정 안 됨) · fidelity(원본 분포 재현도)",
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

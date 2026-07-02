import { assessReliability } from "../assess/reliability.js";
import type { StudyResult } from "../types.js";
import type { FidelityReport } from "../verify/fidelity.js";
import { buildConfidenceCard, buildRiskyAssumptions } from "./confidence.js";
import { rankSegments } from "./segments.js";
import type {
  FounderInsightReport,
  FounderReportOptions,
  OverallSignalSection,
  ReportAppendix,
  SegmentInsight,
} from "./types.js";

export const DISCLAIMER =
  "이 리포트의 모든 수치는 synthetic panel response(가상 패널 응답)이며, 실제 시장 반응·구매율이 아닙니다. 실제 인터뷰·설문으로 검증해야 합니다.";
export const DEFAULT_MIN_N = 8;

const PRICE_SIGNAL = /원|월|구독|가격|₩|price/i;

function overallSection(
  result: StudyResult,
  options: FounderReportOptions,
): OverallSignalSection {
  const distribution: Record<string, number> = {};
  for (const r of result.responses) {
    const k = r.choice ?? r.answer;
    distribution[k] = (distribution[k] ?? 0) + 1;
  }
  const missing = result.missing?.length ?? 0;
  const total = result.responses.length + missing;
  return {
    signal: result.signal,
    distribution,
    missingRate: total > 0 ? missing / total : 0,
    n: options.run?.n ?? result.responses.length,
    seed: options.run?.seed,
    provider: options.run?.provider,
    label: "가상 패널 응답 기준 · 실제 시장 반응 아님 · 탐색 신호",
  };
}

export function generateFounderInsightReport(
  result: StudyResult,
  options: FounderReportOptions,
  ctx?: { fidelity?: FidelityReport; bridges?: Record<string, string> },
): FounderInsightReport {
  const { choices } = options;
  if (choices.length < 2) {
    throw new Error(
      "choices는 최소 2개여야 합니다 (기회/저항 방향을 정의할 수 없음).",
    );
  }
  const positiveChoice = options.positiveChoice ?? choices[0];
  if (!choices.includes(positiveChoice)) {
    throw new Error(
      `positiveChoice "${positiveChoice}"가 choices에 없습니다: [${choices.join(", ")}]`,
    );
  }

  const caveats: string[] = [];
  if (options.positiveChoice == null) {
    caveats.push(
      `positiveChoice assumed from choices[0]: "${positiveChoice}" — 의도한 긍정 방향이 맞는지 확인하세요.`,
    );
  }
  if (choices.length > 2) {
    caveats.push(
      `3지선다 이상: positive("${positiveChoice}") 1개 vs 나머지로 접힙니다. "잘 모르겠다" 같은 중립 응답이 negative로 합쳐질 수 있습니다.`,
    );
  }

  const minN = options.minN ?? DEFAULT_MIN_N;
  const { opportunity, resistance, observedButHeld } = rankSegments(
    result,
    positiveChoice,
    minN,
  );

  // 신뢰성 카드 (assessReliability 재사용). fidelity 없으면 composition은 unknown 유지.
  const card = assessReliability(result, {
    fidelity: ctx?.fidelity,
    bridges: ctx?.bridges,
  });
  const confidenceCard = buildConfidenceCard(card);

  const hasPriceSignal = PRICE_SIGNAL.test(
    `${options.question} ${positiveChoice}`,
  );
  const priceUnsafe = hasPriceSignal && card.missingAxes.length > 0;

  // dim별 provenance 신뢰도를 세그먼트에 반영 + 가격 저신뢰 caveat
  const confByDim = new Map(card.attributes.map((a) => [a.dim, a.confidence]));
  const applyConfidence = (s: SegmentInsight): SegmentInsight => {
    const dim = s.segmentLabel.split("=")[0];
    const conf = confByDim.get(dim) ?? "unknown";
    const extra = priceUnsafe
      ? [
          ...s.caveats,
          "가격/구매력 판단은 저신뢰(소득 축 없음) — 인터뷰로 확인",
        ]
      : s.caveats;
    return { ...s, confidence: conf, caveats: extra };
  };
  const opportunitySegments = opportunity.map(applyConfidence);
  const resistanceSegments = resistance.map(applyConfidence);

  const riskyAssumptions = buildRiskyAssumptions(
    card,
    hasPriceSignal,
    observedButHeld.length,
  );

  const topOpportunity = opportunitySegments[0]?.segmentLabel;
  const topResistance = resistanceSegments[0]?.segmentLabel;

  const headline =
    result.signal === "split"
      ? `전체 반응은 갈렸지만, ${topOpportunity ?? "일부 세그먼트"}에서 상대적으로 긍정 신호가 강합니다. 어느 방향을 더 확인해야 하는지 아래를 보세요.`
      : `전체적으로 비교적 합의된 반응입니다${topOpportunity ? ` (${topOpportunity} 특히)` : ""}. 다만 실제 조사로 검증이 필요합니다.`;

  const appendix: ReportAppendix = {
    generatedAt: new Date().toISOString(),
    options,
    caveats,
    observedButHeldCount: observedButHeld.length,
    reliabilityCardRaw: card,
  };

  return {
    title: `${options.concept?.productName ?? "컨셉"} — 0차 시장검증 리포트`,
    disclaimer: DISCLAIMER,
    executiveSummary: {
      headline,
      topOpportunity,
      topResistance,
      doNotTrustYet: confidenceCard.marketJudgment.whatThisDoesNotAllow,
      thisWeekAction: topOpportunity
        ? `${topOpportunity} 세그먼트부터 인터뷰 대상 좁히기`
        : "표본이 큰 세그먼트부터 인터뷰 설계",
    },
    overallSignal: overallSection(result, options),
    opportunitySegments,
    resistanceSegments,
    observedButHeld,
    keyDrivers: [],
    keyObjections: [],
    riskyAssumptions,
    confidenceCard,
    recommendedInterviews: [],
    interviewQuestions: [],
    surveyDraft: [],
    landingPageMessageTests: [],
    nextValidationPlan: [],
    appendix,
  };
}

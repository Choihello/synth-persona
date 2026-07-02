import type { StudyResult } from "../types.js";
import type { FidelityReport } from "../verify/fidelity.js";
import type {
  FounderInsightReport,
  FounderReportOptions,
  OverallSignalSection,
  ReportAppendix,
} from "./types.js";

export const DISCLAIMER =
  "이 리포트의 모든 수치는 synthetic panel response(가상 패널 응답)이며, 실제 시장 반응·구매율이 아닙니다. 실제 인터뷰·설문으로 검증해야 합니다.";
export const DEFAULT_MIN_N = 8;

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
  _ctx?: { fidelity?: FidelityReport; bridges?: Record<string, string> },
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

  const appendix: ReportAppendix = {
    generatedAt: new Date().toISOString(),
    options,
    caveats,
    observedButHeldCount: 0,
  };

  return {
    title: `${options.concept?.productName ?? "컨셉"} — 0차 시장검증 리포트`,
    disclaimer: DISCLAIMER,
    executiveSummary: {
      headline: "",
      doNotTrustYet: "",
      thisWeekAction: "",
    },
    overallSignal: overallSection(result, options),
    opportunitySegments: [],
    resistanceSegments: [],
    observedButHeld: [],
    keyDrivers: [],
    keyObjections: [],
    riskyAssumptions: [],
    confidenceCard: {
      composition: {
        label: "unknown",
        reason: "",
        whatThisAllows: "",
        whatThisDoesNotAllow: "",
      },
      attributes: {
        label: "unknown",
        reason: "",
        whatThisAllows: "",
        whatThisDoesNotAllow: "",
      },
      responseConsistency: {
        label: "unknown",
        reason: "",
        whatThisAllows: "",
        whatThisDoesNotAllow: "",
      },
      marketJudgment: {
        label: "low",
        reason: "",
        whatThisAllows: "",
        whatThisDoesNotAllow: "",
      },
    },
    recommendedInterviews: [],
    interviewQuestions: [],
    surveyDraft: [],
    landingPageMessageTests: [],
    nextValidationPlan: [],
    appendix,
  };
}

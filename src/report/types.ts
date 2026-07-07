import type { ReliabilityCard } from "../assess/reliability.js";

export type Confidence = "high" | "medium" | "low" | "unknown";
export type Basis = "measured" | "heuristic" | "llm";
export type FounderGoal =
  | "targeting"
  | "pricing"
  | "message"
  | "problem-validation"
  | "feature-priority";

export interface ConceptMeta {
  productName?: string;
  conceptDescription?: string;
  targetCustomerHypothesis?: string;
  price?: string;
  channel?: string;
  alternatives?: string[];
}

export interface FounderReportOptions {
  question: string;
  choices: string[];
  positiveChoice?: string;
  minN?: number;
  concept?: ConceptMeta;
  founderGoal?: FounderGoal;
  run?: { seed?: number; provider?: string; n?: number; narrative?: boolean };
}

export interface ExecutiveSummary {
  headline: string;
  topOpportunity?: string;
  topResistance?: string;
  doNotTrustYet: string;
  thisWeekAction: string;
}

export interface OverallSignalSection {
  signal: "consensus" | "split";
  distribution: Record<string, number>;
  missingRate: number;
  n: number;
  seed?: number;
  provider?: string;
  label: string;
  /** 고유 페르소나 수 (표본 크기). 구 데이터·CLI는 미설정. */
  panelSize?: number;
  /** 과반투표 긍정 페르소나 수. */
  panelPositive?: number;
}

export interface SegmentInsight {
  segmentLabel: string;
  segmentDefinition: string;
  sampleCount: number;
  sampleWeightShare: number;
  personaCount: number;
  responseDistribution: Record<string, number>;
  positiveRatio: number;
  signal: "consensus" | "split";
  whyItMatters: string;
  likelyReasoning: string;
  confidence: Confidence;
  caveats: string[];
  recommendedFollowUpQuestion: string;
}

export interface DriverInsight {
  label: string;
  rationale: string;
  provenance: "inferred";
  basis: Basis;
  confidence: Confidence;
}

export interface RiskyAssumption {
  assumption: string;
  whyRisky: string;
  howToTest: string;
}

export interface ConfidenceLayer {
  label: Confidence;
  reason: string;
  whatThisAllows: string;
  whatThisDoesNotAllow: string;
}
export interface ConfidenceCard {
  composition: ConfidenceLayer;
  attributes: ConfidenceLayer;
  responseConsistency: ConfidenceLayer;
  marketJudgment: ConfidenceLayer;
}

export interface InterviewTarget {
  targetLabel: string;
  whyInterview: string;
  whatToValidate: string;
  suggestedRecruitingScreener: string;
  sampleSizeRecommendation: string;
  provenance: "inferred";
  basis: Basis;
}
export interface InterviewQuestion {
  text: string;
  type:
    | "problem-discovery"
    | "current-alternative"
    | "frequency"
    | "trust-barrier"
    | "willingness"
    | "message-test"
    | "price";
  provenance: "inferred";
  basis: Basis;
  caution?: string;
}
export interface SurveyQuestion {
  text: string;
  kind:
    | "segmentation"
    | "problem-frequency"
    | "alternative"
    | "concept-reaction"
    | "reason"
    | "price";
  optional?: boolean;
  caution?: string;
  provenance: "inferred";
  basis: Basis;
}
export interface MessageTest {
  headline: string;
  subcopy: string;
  targetSegment: string;
  hypothesis: string;
  successMetric: string;
  caution: string;
  provenance: "inferred";
  basis: Basis;
}
export interface ValidationAction {
  day: string;
  action: string;
}

export interface ReportAppendix {
  generatedAt: string;
  options: FounderReportOptions;
  caveats: string[];
  observedButHeldCount: number;
  reliabilityCardRaw?: ReliabilityCard;
}

export interface FounderInsightReport {
  title: string;
  disclaimer: string;
  executiveSummary: ExecutiveSummary;
  overallSignal: OverallSignalSection;
  opportunitySegments: SegmentInsight[];
  resistanceSegments: SegmentInsight[];
  weakSignals: SegmentInsight[];
  withinNoise: SegmentInsight[];
  observedButHeld: SegmentInsight[];
  /** 통계는 유의했지만 질문과 관련성이 낮다고 AI가 판단해 순위에서 제외한 세그먼트 */
  lowRelevance: SegmentInsight[];
  keyDrivers: DriverInsight[];
  keyObjections: DriverInsight[];
  riskyAssumptions: RiskyAssumption[];
  confidenceCard: ConfidenceCard;
  recommendedInterviews: InterviewTarget[];
  interviewQuestions: InterviewQuestion[];
  surveyDraft: SurveyQuestion[];
  landingPageMessageTests: MessageTest[];
  nextValidationPlan: ValidationAction[];
  appendix: ReportAppendix;
}

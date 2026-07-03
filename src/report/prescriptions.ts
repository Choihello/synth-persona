import type {
  ConfidenceCard,
  DriverInsight,
  FounderReportOptions,
  InterviewQuestion,
  InterviewTarget,
  MessageTest,
  SegmentInsight,
  SurveyQuestion,
  ValidationAction,
} from "./types.js";

export interface PrescriptionContext {
  options: FounderReportOptions;
  positiveChoice: string;
  opportunitySegments: SegmentInsight[];
  resistanceSegments: SegmentInsight[];
  confidenceCard: ConfidenceCard;
  hasPriceSignal: boolean;
  /** 가격 판단에 필요한 축(소득·직업·자녀)이 데이터에 없는가 (card.missingAxes 기반) */
  priceAxisMissing: boolean;
}

export interface PrescriptionGenerator {
  drivers(ctx: PrescriptionContext): {
    drivers: DriverInsight[];
    objections: DriverInsight[];
  };
  interviews(ctx: PrescriptionContext): InterviewTarget[];
  interviewQuestions(ctx: PrescriptionContext): InterviewQuestion[];
  survey(ctx: PrescriptionContext): SurveyQuestion[];
  landingTests(ctx: PrescriptionContext): MessageTest[];
  validationPlan(ctx: PrescriptionContext): ValidationAction[];
}

export type Theme = "price" | "subscription" | "trust" | "generic";

const THEME_PATTERNS: Array<{ theme: Theme; pattern: RegExp }> = [
  { theme: "price", pattern: /원|₩|가격|비용|유료|price/i },
  { theme: "subscription", pattern: /구독|정기|멤버십|월\s?\d/i },
  { theme: "trust", pattern: /신뢰|안전|보안|개인정보|위생/i },
];

export function detectThemes(question: string): Theme[] {
  const hits = THEME_PATTERNS.filter((t) => t.pattern.test(question)).map(
    (t) => t.theme,
  );
  return hits.length ? hits : ["generic"];
}

// 처방 공통 라벨: 전부 추정(heuristic 초안). LLM v2(issue #4)가 같은 인터페이스로 교체.
const INF = { provenance: "inferred", basis: "heuristic" } as const;
const LOW = { ...INF, confidence: "low" } as const;

const DRIVER_TEMPLATES: Record<
  Theme,
  { driver: DriverInsight; objection: DriverInsight }
> = {
  price: {
    driver: {
      label: "가격 대비 효용 기대",
      rationale:
        "질문에 가격 신호 — 효용>비용으로 인식한 응답자가 긍정했을 가능성 (추정, 인터뷰로 확인)",
      ...LOW,
    },
    objection: {
      label: "가격 부담 · 대체재 대비 비쌈",
      rationale:
        "가격이 명시된 질문에서 거부의 1순위 후보는 지불 저항 (추정, 인터뷰로 확인)",
      ...LOW,
    },
  },
  subscription: {
    driver: {
      label: "반복 필요의 자동화(습관화) 기대",
      rationale:
        "구독형 질문 — 반복 소비를 자동화하려는 동기가 긍정을 이끌었을 가능성 (추정, 인터뷰로 확인)",
      ...LOW,
    },
    objection: {
      label: "구독 피로 · 해지 번거로움",
      rationale:
        "구독형 질문에서 흔한 거부 요인은 구독 누적 피로와 락인 우려 (추정, 인터뷰로 확인)",
      ...LOW,
    },
  },
  trust: {
    driver: {
      label: "신뢰·안전이 확보되면 쓰겠다는 조건부 긍정",
      rationale:
        "신뢰/안전 키워드 — 품질 보증이 충족될 때만 긍정으로 전환되는 조건부 수요 가능성 (추정, 인터뷰로 확인)",
      ...LOW,
    },
    objection: {
      label: "신뢰·안전 우려(품질/보안/개인정보)",
      rationale:
        "신뢰 관련 질문에서 거부는 대개 검증 안 된 공급자에 대한 불안 (추정, 인터뷰로 확인)",
      ...LOW,
    },
  },
  generic: {
    driver: {
      label: "문제 해결 기대 (구체 이유 미상)",
      rationale:
        "질문에서 도메인 신호를 찾지 못함 — free-text 이유 미수집 상태이므로 실제 끌림 이유는 인터뷰로 확인 필요",
      ...LOW,
    },
    objection: {
      label: "현상 유지 · 대체재 관성",
      rationale:
        "구체 신호 없음 — 가장 흔한 기본 거부 요인은 '지금 방식으로 충분함'. 실제 이유는 인터뷰로 확인 필요",
      ...LOW,
    },
  },
};

export class HeuristicPrescriptionGenerator implements PrescriptionGenerator {
  drivers(ctx: PrescriptionContext): {
    drivers: DriverInsight[];
    objections: DriverInsight[];
  } {
    const themes = detectThemes(ctx.options.question);
    return {
      drivers: themes.map((t) => DRIVER_TEMPLATES[t].driver),
      objections: themes.map((t) => DRIVER_TEMPLATES[t].objection),
    };
  }
  // interviews/interviewQuestions/survey/landingTests/validationPlan은 Task 2~3에서 구현
  interviews(_ctx: PrescriptionContext): InterviewTarget[] {
    throw new Error("not implemented — Task 2");
  }
  interviewQuestions(_ctx: PrescriptionContext): InterviewQuestion[] {
    throw new Error("not implemented — Task 2");
  }
  survey(_ctx: PrescriptionContext): SurveyQuestion[] {
    throw new Error("not implemented — Task 3");
  }
  landingTests(_ctx: PrescriptionContext): MessageTest[] {
    throw new Error("not implemented — Task 3");
  }
  validationPlan(_ctx: PrescriptionContext): ValidationAction[] {
    throw new Error("not implemented — Task 3");
  }
}

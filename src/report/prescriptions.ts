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
  /** generate가 1회 계산해 전달하는 질문 테마. 없으면 각 메서드가 detectThemes로 폴백. */
  themes?: Theme[];
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
  // "원"은 통화 표기(숫자+단위 뒤)만 — 직원·병원 같은 단어 속 "원" 오탐 방지
  {
    theme: "price",
    pattern: /\d[\d,.]*\s*(?:십|백|천|만|억)*\s*원|₩|가격|비용|유료|price/i,
  },
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
    const themes = ctx.themes ?? detectThemes(ctx.options.question);
    return {
      drivers: themes.map((t) => DRIVER_TEMPLATES[t].driver),
      objections: themes.map((t) => DRIVER_TEMPLATES[t].objection),
    };
  }
  interviews(ctx: PrescriptionContext): InterviewTarget[] {
    const targets: InterviewTarget[] = [];
    for (const s of ctx.opportunitySegments.slice(0, 2)) {
      targets.push({
        targetLabel: s.segmentLabel,
        whyInterview: "긍정 신호가 전체 평균보다 강함 — 끌리는 실제 이유 확인",
        whatToValidate: `"${ctx.positiveChoice}" 반응의 실제 동기와 사용/지불 맥락`,
        suggestedRecruitingScreener: `${s.segmentDefinition} 조건으로 스크리닝`,
        sampleSizeRecommendation: "5~8명 (질적 포화 최소선)",
        ...INF,
      });
    }
    for (const s of ctx.resistanceSegments.slice(0, 2)) {
      targets.push({
        targetLabel: s.segmentLabel,
        whyInterview: "저항이 전체 평균보다 강함 — 거부 이유·병목 확인",
        whatToValidate: "거부의 실제 이유(가격·신뢰·습관·대체재 중 무엇인지)",
        suggestedRecruitingScreener: `${s.segmentDefinition} 조건으로 스크리닝`,
        sampleSizeRecommendation: "5~8명 (질적 포화 최소선)",
        ...INF,
      });
    }
    if (targets.length < 3) {
      targets.push({
        targetLabel: "표본 최다 세그먼트 (탐색 보강)",
        whyInterview:
          "minN을 넘는 기회/저항 세그먼트가 3개 미만이라 랭킹이 부족함 — 표본이 큰 집단부터 이유 수집",
        whatToValidate: "반응 방향과 그 이유 (탐색적)",
        suggestedRecruitingScreener: "핵심 인구 축(연령/가구) 기준 광범위 모집",
        sampleSizeRecommendation: "5~8명 (질적 포화 최소선)",
        ...INF,
      });
    }
    return targets.slice(0, 5);
  }

  interviewQuestions(ctx: PrescriptionContext): InterviewQuestion[] {
    const themes = ctx.themes ?? detectThemes(ctx.options.question);
    const qs: InterviewQuestion[] = [
      {
        text: "최근 한 달 동안 이 질문의 상황과 관련해 가장 불편했던 순간을 구체적으로 말씀해 주세요.",
        type: "problem-discovery",
        ...INF,
      },
      {
        text: "지금은 그 문제를 어떻게 해결하고 계세요? 최근에 실제로 쓴 방법 기준으로요.",
        type: "current-alternative",
        ...INF,
      },
      {
        text: "그 상황이 최근 한 달에 몇 번쯤 있었나요?",
        type: "frequency",
        ...INF,
      },
      {
        text: "지금 방식에 돈이나 시간을 실제로 얼마나 쓰고 계세요?",
        type: "current-alternative",
        ...INF,
      },
      {
        text: "그 문제를 해결하려고 마지막으로 시도했다가 그만둔 것이 있다면, 무엇이었고 왜 그만두셨나요?",
        type: "problem-discovery",
        ...INF,
      },
      {
        text: "비슷한 서비스나 제품에 실제로 돈을 내 본 적이 있나요? 언제, 왜였나요?",
        type: "willingness",
        caution: "가정형('쓰실 건가요?') 대신 과거 지불 행동으로 확인",
        ...INF,
      },
      {
        text: "새로운 서비스를 쓰기 전에 가장 걱정되는 점은 보통 무엇인가요?",
        type: "trust-barrier",
        ...INF,
      },
      {
        text: "이 컨셉 설명을 들었을 때 가장 와닿는 부분과 가장 걸리는 부분은 어디인가요?",
        type: "message-test",
        ...INF,
      },
    ];
    if (themes.includes("price")) {
      qs.push({
        text: "가장 최근에 '비싸서 포기한' 비슷한 지출은 무엇이었나요?",
        type: "price",
        caution: ctx.priceAxisMissing
          ? "소득·직업 축 없음 — 지불의향은 참고만, 단정 금지"
          : undefined,
        ...INF,
      });
    }
    if (themes.includes("subscription")) {
      qs.push({
        text: "지금 유지 중인 구독과 최근 6개월 안에 해지한 구독은 무엇이고, 해지한 이유는요?",
        type: "current-alternative",
        ...INF,
      });
    }
    if (themes.includes("trust")) {
      qs.push({
        text: "믿고 쓰게 된 서비스가 하나 있다면, 무엇이 그 신뢰를 만들었나요?",
        type: "trust-barrier",
        ...INF,
      });
    }
    return qs.slice(0, 12);
  }
  survey(ctx: PrescriptionContext): SurveyQuestion[] {
    const out: SurveyQuestion[] = [
      { text: "연령대를 선택해 주세요.", kind: "segmentation", ...INF },
      {
        text: "이 질문의 상황을 한 달에 몇 번쯤 겪으시나요?",
        kind: "problem-frequency",
        ...INF,
      },
      {
        text: "지금은 주로 어떻게 해결하시나요? (복수 선택)",
        kind: "alternative",
        ...INF,
      },
      {
        text: `이 컨셉을 보고 어느 쪽에 가깝나요? (${ctx.options.choices.join(" / ")})`,
        kind: "concept-reaction",
        ...INF,
      },
      {
        text: "그렇게 답한 가장 큰 이유를 자유롭게 적어 주세요.",
        kind: "reason",
        caution:
          "synthetic panel에는 없는 free-text 이유 — 실측에서 반드시 수집",
        ...INF,
      },
    ];
    if (ctx.hasPriceSignal) {
      out.push({
        text: "제시된 가격은 어떻게 느껴지나요? (너무 싸다/적당하다/비싸지만 살 만하다/너무 비싸다)",
        kind: "price",
        optional: true,
        caution: ctx.priceAxisMissing
          ? "소득 축 없는 상태의 가격 반응은 참고용 — 단정 금지"
          : undefined,
        ...INF,
      });
    }
    return out;
  }

  landingTests(ctx: PrescriptionContext): MessageTest[] {
    const name = ctx.options.concept?.productName ?? "이 컨셉";
    const tops = ctx.opportunitySegments.slice(0, 2);
    if (tops.length === 0) {
      return [
        {
          headline: `${name} — 핵심 효용 한 줄 (초안)`,
          subcopy: "대상 세그먼트 미확정 — 광범위 카피로 세그먼트별 반응 수집",
          targetSegment: "전체 (세그먼트 미확정)",
          hypothesis: "특정 세그먼트에서 전환이 상대적으로 높게 나타날 것",
          successMetric: "방문→이메일 등록 전환율 (세그먼트별 비교)",
          caution: "AI 생성 초안 — 실제 카피는 검토·수정 필요",
          ...INF,
        },
      ];
    }
    return tops.map((s) => ({
      headline: `${name}, ${s.segmentLabel.split("=")[1]}을(를) 위한 핵심 효용 한 줄 (초안)`,
      subcopy: `"${ctx.positiveChoice}" 반응이 강했던 세그먼트용 카피 초안 — 실제 효용 문구로 교체할 것`,
      targetSegment: s.segmentLabel,
      hypothesis:
        "이 세그먼트 유입에서 등록 전환율이 다른 세그먼트보다 높을 것",
      successMetric: "방문→이메일 등록 전환율 (세그먼트 간 상대 비교)",
      caution: "AI 생성 초안 — 카피·타겟팅 모두 검토 필요",
      ...INF,
    }));
  }

  validationPlan(ctx: PrescriptionContext): ValidationAction[] {
    const top = ctx.opportunitySegments[0]?.segmentLabel;
    return [
      {
        day: "Day 1",
        action: `인터뷰 대상 확정(${top ?? "표본 최다 세그먼트"}) + 리크루팅 스크리너 작성`,
      },
      {
        day: "Day 2~3",
        action: "5~8명 리크루팅 (지인 제외, 스크리너 통과자만)",
      },
      {
        day: "Day 4~5",
        action: "인터뷰 실행 — 과거 행동 중심, 가정형 질문 금지",
      },
      {
        day: "Day 6",
        action: "응답 태깅 — 끌림/거부 이유와 병목(가격·신뢰·습관·대체재) 분류",
      },
      {
        day: "Day 7",
        action: "다음 단계 결정 — 설문/랜딩 테스트 진행 또는 컨셉 수정(피벗)",
      },
    ];
  }
}

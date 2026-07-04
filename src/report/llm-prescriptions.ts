import type { LLMProvider } from "../llm/provider.js";
import type { Response, StudyResult } from "../types.js";
import {
  HeuristicPrescriptionGenerator,
  type PrescriptionContext,
  type PrescriptionGenerator,
} from "./prescriptions.js";
import type {
  DriverInsight,
  FounderReportOptions,
  InterviewQuestion,
} from "./types.js";

/** mulberry32 — population/sampleForSimulation과 같은 계열의 시드 결정적 RNG. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 실측 reason 텍스트를 LLM 처방 근거로 층화 추출한다.
 * askChoice 구조화 경로에서 Response.answer = reason. answer가 choice 문구와
 * 동일하면 reason 미수집(폴백 경로)이므로 제외한다.
 */
export function sampleReasons(
  responses: Response[],
  positiveChoice: string,
  opts?: { maxPerSide?: number; seed?: number },
): { positive: string[]; negative: string[] } {
  const maxPerSide = opts?.maxPerSide ?? 20;
  const rng = makeRng(opts?.seed ?? 1);

  const pick = (side: Response[]): string[] => {
    const withReason = side
      .filter((r) => r.answer.trim() !== (r.choice ?? "").trim())
      .map((r) => r.answer.trim().slice(0, 200));
    const unique = [...new Set(withReason)];
    return shuffled(unique, rng).slice(0, maxPerSide);
  };

  const positive = pick(responses.filter((r) => r.choice === positiveChoice));
  const negative = pick(responses.filter((r) => r.choice !== positiveChoice));
  return { positive, negative };
}

interface LLMPrescriptionsJson {
  drivers: Array<{ label: string; rationale: string }>;
  objections: Array<{ label: string; rationale: string }>;
  interviewQuestions: Array<{ text: string; type: string }>;
}

function isValidJson(v: unknown): v is LLMPrescriptionsJson {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const okItems = (arr: unknown, keys: string[]): boolean =>
    Array.isArray(arr) &&
    arr.length > 0 &&
    arr.every(
      (x) =>
        typeof x === "object" &&
        x !== null &&
        keys.every(
          (k) => typeof (x as Record<string, unknown>)[k] === "string",
        ),
    );
  return (
    okItems(o.drivers, ["label", "rationale"]) &&
    okItems(o.objections, ["label", "rationale"]) &&
    okItems(o.interviewQuestions, ["text", "type"])
  );
}

const PRESCRIPTIONS_SCHEMA = {
  name: "prescriptions",
  schema: {
    type: "object",
    properties: {
      drivers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            rationale: { type: "string" },
          },
          required: ["label", "rationale"],
          additionalProperties: false,
        },
      },
      objections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description:
                "거부 이유. 반드시 [가격]/[신뢰]/[습관]/[대체재] 중 하나의 병목 태그로 시작",
            },
            rationale: { type: "string" },
          },
          required: ["label", "rationale"],
          additionalProperties: false,
        },
      },
      interviewQuestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "과거 행동을 묻는 질문 (가정형 '쓰시겠어요?' 금지)",
            },
            type: { type: "string" },
          },
          required: ["text", "type"],
          additionalProperties: false,
        },
      },
    },
    required: ["drivers", "objections", "interviewQuestions"],
    additionalProperties: false,
  },
} as const;

const SYSTEM_PROMPT = [
  "당신은 초기 창업자를 돕는 시장조사 분석가다.",
  "아래 synthetic panel(가상 패널) 응답의 실제 이유 텍스트를 종합해,",
  "끌림 이유(drivers) 2~4개, 거부 이유(objections) 2~4개, 인터뷰 질문 4~8개를 만든다.",
  "규칙: 이유에 실제로 나타난 근거만 사용(추측 금지) · objections label은 [가격]/[신뢰]/[습관]/[대체재] 병목 태그로 시작 ·",
  "인터뷰 질문은 과거 행동형(가정형 금지) · 모두 한국어.",
].join("\n");

/**
 * 실측 reason에 근거한 LLM 처방 generator를 만든다. provider가 generateJson을
 * 지원하지 않거나 호출/검증이 실패하면 null — 호출자가 heuristic으로 폴백하고
 * 그 사실을 기록할 책임을 진다.
 */
export async function buildLLMPrescriptions(opts: {
  provider: LLMProvider;
  result: StudyResult;
  options: FounderReportOptions;
  seed?: number;
}): Promise<PrescriptionGenerator | null> {
  const { provider, result, options } = opts;
  if (!provider.generateJson) return null;

  const positiveChoice = options.positiveChoice ?? options.choices[0];
  const { positive, negative } = sampleReasons(
    result.responses,
    positiveChoice,
    {
      seed: opts.seed,
    },
  );
  const reasonCount = positive.length + negative.length;

  const user = [
    `질문: ${options.question}`,
    `선택지: ${options.choices.join(" / ")} (긍정 방향: ${positiveChoice})`,
    "",
    `[긍정("${positiveChoice}") 응답의 실제 이유 ${positive.length}건]`,
    ...positive.map((t) => `- ${t}`),
    "",
    `[부정 응답의 실제 이유 ${negative.length}건]`,
    ...negative.map((t) => `- ${t}`),
  ].join("\n");

  let raw: unknown;
  try {
    raw = await provider.generateJson(
      SYSTEM_PROMPT,
      user,
      PRESCRIPTIONS_SCHEMA,
    );
  } catch {
    return null;
  }
  if (!isValidJson(raw)) return null;

  const confidence = reasonCount >= 20 ? ("medium" as const) : ("low" as const);
  const label = { provenance: "inferred", basis: "llm", confidence } as const;
  const ground = (rationale: string): string =>
    `${rationale} (응답 이유 ${reasonCount}건 기반)`;

  const drivers: DriverInsight[] = raw.drivers.map((d) => ({
    label: d.label,
    rationale: ground(d.rationale),
    ...label,
  }));
  const objections: DriverInsight[] = raw.objections.map((d) => ({
    label: d.label,
    rationale: ground(d.rationale),
    ...label,
  }));
  const interviewQuestions: InterviewQuestion[] = raw.interviewQuestions.map(
    (q) => ({
      text: q.text,
      type: q.type as InterviewQuestion["type"],
      provenance: "inferred",
      basis: "llm",
    }),
  );

  const fallback = new HeuristicPrescriptionGenerator();
  return {
    drivers: () => ({ drivers, objections }),
    interviewQuestions: () => interviewQuestions,
    interviews: (ctx: PrescriptionContext) => fallback.interviews(ctx),
    survey: (ctx: PrescriptionContext) => fallback.survey(ctx),
    landingTests: (ctx: PrescriptionContext) => fallback.landingTests(ctx),
    validationPlan: (ctx: PrescriptionContext) => fallback.validationPlan(ctx),
  };
}

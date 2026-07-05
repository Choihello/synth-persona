import type { LLMProvider } from "../llm/provider.js";

/** 질문↔인구 차원 관련성 판정 (AI). low는 확신 시에만 — 잘못 제외 > 잘못 포함. */
export interface RelevanceVerdict {
  /** 차원 → 관련성. 판정 누락 차원은 소비자가 high로 취급한다. */
  relevant: Record<string, "high" | "low">;
  /** low 차원의 한 줄 이유 (렌더 caveat용) */
  reasons: Record<string, string>;
  basis: "llm";
}

const SYSTEM_PROMPT = [
  "너는 설문 문항과 인구통계 차원의 관련성을 판정하는 리서치 방법론 심사자다.",
  "질문에 대한 응답 성향이 해당 차원에 따라 달라질 타당한 인과·상관 경로가 있으면 high.",
  "확실히 무관할 때만 low. 불확실하면 반드시 high로 판정한다.",
  "모든 차원에 한 줄 reason을 붙인다 (high도 짧게).",
].join("\n");

export const RELEVANCE_SCHEMA = {
  name: "dimension_relevance",
  schema: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension: { type: "string" },
            relevance: { type: "string", enum: ["high", "low"] },
            reason: { type: "string" },
          },
          required: ["dimension", "relevance", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["verdicts"],
    additionalProperties: false,
  },
};

interface RawVerdict {
  dimension: string;
  relevance: "high" | "low";
  reason?: string;
}

function isVerdicts(raw: unknown): raw is { verdicts: RawVerdict[] } {
  if (typeof raw !== "object" || raw === null) return false;
  const v = (raw as { verdicts?: unknown }).verdicts;
  if (!Array.isArray(v)) return false;
  return v.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const it = item as { dimension?: unknown; relevance?: unknown };
    return (
      typeof it.dimension === "string" &&
      (it.relevance === "high" || it.relevance === "low")
    );
  });
}

/**
 * 질문↔차원 관련성을 LLM 1콜로 판정한다. provider가 generateJson을 지원하지
 * 않거나 호출/검증이 실패하면 null — 호출자는 게이트를 적용하지 않는다
 * (llm-prescriptions와 동일한 조용한 폴백 계약).
 */
export async function judgeDimensionRelevance(opts: {
  provider: LLMProvider;
  question: string;
  dimensions: string[];
}): Promise<RelevanceVerdict | null> {
  const { provider, question, dimensions } = opts;
  if (!provider.generateJson || dimensions.length === 0) return null;

  const user = [
    `질문: ${question}`,
    `인구 차원: ${dimensions.join(", ")}`,
    "각 차원에 대해 relevance(high|low)를, low인 경우 reason을 JSON으로 답하라.",
  ].join("\n");

  let raw: unknown;
  try {
    raw = await provider.generateJson(SYSTEM_PROMPT, user, RELEVANCE_SCHEMA);
  } catch {
    return null;
  }
  if (!isVerdicts(raw)) return null;

  const relevant: Record<string, "high" | "low"> = {};
  const reasons: Record<string, string> = {};
  for (const v of raw.verdicts) {
    if (!dimensions.includes(v.dimension)) continue;
    relevant[v.dimension] = v.relevance;
    if (v.relevance === "low" && typeof v.reason === "string" && v.reason)
      reasons[v.dimension] = v.reason;
  }
  return { relevant, reasons, basis: "llm" };
}

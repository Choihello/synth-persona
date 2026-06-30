import type { Provenance, StudyResult } from "../types.js";
import type { FidelityReport } from "../verify/fidelity.js";

export type Confidence = "high" | "medium" | "low" | "unknown";

export interface AttributeReliability {
  dim: string;
  provenance: Provenance | "unknown";
  confidence: Confidence;
  note?: string;
}

export interface ReliabilityCard {
  composition: { signal: "🟢" | "🔴"; mae: number; tvd: number } | null;
  attributes: AttributeReliability[];
  responseConsistency: { status: "not-measured"; reason: string };
  guardrails: string[];
  missingAxes: string[];
}

const CONFIDENCE_BY_PROVENANCE: Record<Provenance, Confidence> = {
  matched: "high",
  conditioned: "medium",
  inferred: "low",
  llm_generated: "low",
};

// 한 dim 안에 여러 provenance가 섞이면 가장 보수적인(낮은 신뢰) 값으로 집계 — 과신 방지.
// 우선순위: inferred > conditioned > llm_generated > matched > unknown
const PROVENANCE_SEVERITY: Provenance[] = [
  "inferred",
  "conditioned",
  "llm_generated",
  "matched",
];
function worstProvenance(seen: Set<Provenance>): Provenance | "unknown" {
  for (const p of PROVENANCE_SEVERITY) if (seen.has(p)) return p;
  return "unknown";
}

const DEFAULT_PRICE_CRITICAL_AXES = ["소득", "직업", "자녀"];
const COMPOSITION_MAE_THRESHOLD = 0.05;

export function assessReliability(
  result: StudyResult,
  ctx?: {
    fidelity?: FidelityReport;
    bridges?: Record<string, string>;
    priceCriticalAxes?: string[];
  },
): ReliabilityCard {
  const dims = Object.keys(result.bySegment);
  const bridges = ctx?.bridges ?? {};

  const attributes: AttributeReliability[] = dims.map((dim) => {
    // dim에 등장한 모든 provenance를 모아 가장 보수적인 값으로 판정 (첫 샘플에 끌리지 않게)
    const seen = new Set<Provenance>();
    for (const r of result.responses) {
      const p = r.persona.provenance?.[dim];
      if (p) seen.add(p);
    }
    const provenance: Provenance | "unknown" = worstProvenance(seen);
    const confidence: Confidence =
      provenance === "unknown"
        ? "unknown"
        : CONFIDENCE_BY_PROVENANCE[provenance];
    const note = bridges[dim] ? `bridge:${bridges[dim]}` : undefined;
    return { dim, provenance, confidence, note };
  });

  const composition = ctx?.fidelity
    ? {
        signal: (ctx.fidelity.core.mae <= COMPOSITION_MAE_THRESHOLD
          ? "🟢"
          : "🔴") as "🟢" | "🔴",
        mae: ctx.fidelity.core.mae,
        tvd: ctx.fidelity.core.tvd,
      }
    : null;

  const priceAxes = ctx?.priceCriticalAxes ?? DEFAULT_PRICE_CRITICAL_AXES;
  const missingAxes = priceAxes.filter((a) => !dims.includes(a));

  const guardrails: string[] = [];
  guardrails.push(
    "이 숫자는 synthetic panel response입니다 — 실제 구매율/시장 예측이 아니며, 실제 인터뷰·설문으로 검증해야 합니다.",
  );
  if (missingAxes.length) {
    guardrails.push(
      `가격·구매력 판단 부적합: ${missingAxes.join("·")} 축이 없습니다. 방향 가설 탐색엔 사용 가능하나, 가격 결론은 인터뷰로 확인하세요.`,
    );
  }
  const lowDims = attributes
    .filter((a) => a.confidence === "low")
    .map((a) => a.dim);
  if (lowDims.length) {
    guardrails.push(
      `저확신 속성(${lowDims.join("·")})에서 나온 세그먼트 결론은 추정(inferred)이므로 의사결정에 쓰지 마세요.`,
    );
  }
  if (
    attributes.length &&
    attributes.every((a) => a.provenance === "unknown")
  ) {
    guardrails.push(
      "이 페르소나 소스에는 provenance 정보가 없습니다(통계청 합성 인구가 아님) — 속성 신뢰도를 평가할 수 없습니다.",
    );
  }

  return {
    composition,
    attributes,
    responseConsistency: { status: "not-measured", reason: "키 필요(묶음 B)" },
    guardrails,
    missingAxes,
  };
}

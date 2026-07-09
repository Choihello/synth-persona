import {
  CENSUS_AGE_LABELS,
  type PanelScreener,
} from "../src/population/screen.js";

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * 구조화 스크리너 검증 + census 라벨 범위 확장. 없는 축(직업·소득 등)·잘못된
 * 라벨·역순 범위는 던진다(API가 400으로 잡는다). 셋 다 없으면 undefined = 스크리너 없음.
 */
function parseScreener(raw: unknown): PanelScreener | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "object")
    throw new Error("스크리너 형식이 올바르지 않습니다.");
  const s = raw as Record<string, unknown>;
  const allowed = new Set(["ageMin", "ageMax", "region"]);
  for (const k of Object.keys(s)) {
    if (!allowed.has(k))
      throw new Error(`스크리너에 없는 축입니다: ${k} (연령·지역만 지원)`);
  }

  const out: PanelScreener = {};

  if (s.region != null && s.region !== "") {
    if (s.region !== "수도권" && s.region !== "비수도권")
      throw new Error("지역은 수도권 또는 비수도권이어야 합니다.");
    out.지역 = s.region as "수도권" | "비수도권";
  }

  const hasMin = s.ageMin != null && s.ageMin !== "";
  const hasMax = s.ageMax != null && s.ageMax !== "";
  if (hasMin !== hasMax)
    throw new Error("연령 범위는 시작과 끝을 모두 지정해야 합니다.");
  if (hasMin && hasMax) {
    const lo = CENSUS_AGE_LABELS.indexOf(String(s.ageMin));
    const hi = CENSUS_AGE_LABELS.indexOf(String(s.ageMax));
    if (lo < 0)
      throw new Error(`연령 라벨이 올바르지 않습니다: ${String(s.ageMin)}`);
    if (hi < 0)
      throw new Error(`연령 라벨이 올바르지 않습니다: ${String(s.ageMax)}`);
    if (lo > hi) throw new Error("연령 시작이 끝보다 큽니다.");
    out.연령 = CENSUS_AGE_LABELS.slice(lo, hi + 1);
  }

  return out.연령 == null && out.지역 == null ? undefined : out;
}

/** 웹 입력 검증 + XSS 이스케이프. Next API 라우트가 사용한다. */
export function validateReportInput(body: unknown): {
  question: string;
  choices: string[];
  screener?: PanelScreener;
} {
  const b = (body ?? {}) as {
    question?: unknown;
    choices?: unknown;
    screener?: unknown;
  };
  const question = typeof b.question === "string" ? b.question.trim() : "";
  if (!question) throw new Error("question이 필요합니다.");
  if (question.length > 200) throw new Error("질문은 200자 이내여야 합니다.");
  const choices = Array.isArray(b.choices)
    ? b.choices.map((c) => String(c).trim()).filter(Boolean)
    : [];
  if (choices.length < 2 || choices.length > 4)
    throw new Error("선택지는 2~4개여야 합니다.");
  if (choices.some((c) => c.length > 20))
    throw new Error("선택지는 각 20자 이내여야 합니다.");
  const screener = parseScreener(b.screener);
  return {
    question: escapeHtml(question),
    choices: choices.map(escapeHtml),
    ...(screener ? { screener } : {}),
  };
}

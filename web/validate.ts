export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** 웹 입력 검증 + XSS 이스케이프. Next API 라우트가 사용한다. */
export function validateReportInput(body: unknown): {
  question: string;
  choices: string[];
} {
  const b = (body ?? {}) as { question?: unknown; choices?: unknown };
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
  return { question: escapeHtml(question), choices: choices.map(escapeHtml) };
}

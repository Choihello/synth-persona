import type { LLMProvider } from "../llm/provider.js";
import type { Persona, Response } from "../types.js";

export interface Question {
  prompt: string;
  choices?: string[];
}

export function matchChoice(
  answer: string,
  choices: string[],
): string | undefined {
  // 답변에 나타나는 선택지 중 가장 긴(가장 구체적인) 것을 고른다.
  // 한 선택지가 다른 선택지의 부분문자열일 때(예: "쓴다" ⊂ "안쓴다")
  // 단순 first-match가 오매칭하는 것을 방지. 길이가 같으면 선언 순서를 유지.
  let best: string | undefined;
  for (const c of choices) {
    if (answer.includes(c) && (best === undefined || c.length > best.length)) {
      best = c;
    }
  }
  return best;
}

export async function simulate(
  personas: Persona[],
  question: Question,
  provider: LLMProvider,
): Promise<{
  responses: Response[];
  missing: { personaId: string; reason: string }[];
}> {
  const responses: Response[] = [];
  const missing: { personaId: string; reason: string }[] = [];
  for (const persona of personas) {
    try {
      const answer = await provider.ask(persona, question.prompt);
      const choice = question.choices
        ? matchChoice(answer, question.choices)
        : undefined;
      responses.push({ persona, answer, choice });
    } catch (e) {
      missing.push({
        personaId: persona.id,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { responses, missing };
}

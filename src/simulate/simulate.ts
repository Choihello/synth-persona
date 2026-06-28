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
  return choices.find((c) => answer.includes(c));
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

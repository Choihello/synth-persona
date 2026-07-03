import type { LLMProvider } from "../llm/provider.js";
import type { Persona, Response } from "../types.js";

export interface Question {
  prompt: string;
  choices?: string[];
}

export function buildPrompt(question: Question): string {
  if (!question.choices || question.choices.length === 0)
    return question.prompt;
  const list = question.choices.map((c) => `- ${c}`).join("\n");
  return [
    question.prompt,
    "",
    "아래 선택지 중 정확히 하나만 고르고, 그 선택지 문구를 그대로 답에 포함하세요:",
    list,
  ].join("\n");
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

export interface SimulateOpts {
  /** 동시 LLM 호출 수. 기본 1 = 기존 순차 동작과 동일(결정성 보존). */
  concurrency?: number;
  /** simulate 레벨 재시도 횟수. SDK 자체 재시도(429/5xx, 2회) 위의 보조 레이어. 기본 0 = 기존 순차 동작과 동일(재호출 없음). */
  retries?: number;
  /** 지수 백오프 기본 간격(ms). 테스트에서 0으로 주입. 기본 500. */
  backoffMs?: number;
  onProgress?: (done: number, total: number) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  backoffMs: number,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastErr;
}

export async function simulate(
  personas: Persona[],
  question: Question,
  provider: LLMProvider,
  opts?: SimulateOpts,
): Promise<{
  responses: Response[];
  missing: { personaId: string; reason: string }[];
}> {
  const prompt = buildPrompt(question);
  const concurrency = Math.max(1, opts?.concurrency ?? 1);
  const retries = opts?.retries ?? 0;
  const backoffMs = opts?.backoffMs ?? 500;

  type Slot =
    | { ok: true; res: Response }
    | { ok: false; miss: { personaId: string; reason: string } };
  const slots: Slot[] = new Array(personas.length);
  let next = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= personas.length) return;
      const persona = personas[i];
      try {
        if (question.choices && provider.askChoice) {
          const choices = question.choices;
          const askChoice = provider.askChoice;
          const reply = await withRetry(
            () => askChoice(persona, prompt, choices),
            retries,
            backoffMs,
          );
          if (!choices.includes(reply.choice)) {
            throw new Error(
              `구조화 응답의 choice "${reply.choice}"가 choices에 없습니다: [${choices.join(", ")}]`,
            );
          }
          slots[i] = {
            ok: true,
            res: {
              persona,
              answer: reply.reason ?? reply.choice,
              choice: reply.choice,
            },
          };
        } else {
          const answer = await withRetry(
            () => provider.ask(persona, prompt),
            retries,
            backoffMs,
          );
          const choice = question.choices
            ? matchChoice(answer, question.choices)
            : undefined;
          slots[i] = { ok: true, res: { persona, answer, choice } };
        }
      } catch (e) {
        slots[i] = {
          ok: false,
          miss: {
            personaId: persona.id,
            reason: e instanceof Error ? e.message : String(e),
          },
        };
      }
      done++;
      opts?.onProgress?.(done, personas.length);
    }
  };

  const workers = Math.min(concurrency, Math.max(personas.length, 1));
  await Promise.all(Array.from({ length: workers }, worker));

  const responses: Response[] = [];
  const missing: { personaId: string; reason: string }[] = [];
  for (const s of slots) {
    if (s.ok) responses.push(s.res);
    else missing.push(s.miss);
  }
  return { responses, missing };
}

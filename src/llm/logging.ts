import { createHash } from "node:crypto";
import type { Persona } from "../types.js";
import type { ChoiceReply, LLMProvider, ProviderUsage } from "./provider.js";

export interface LlmCallLog {
  runId: string;
  model: string;
  personaId: string;
  attrs: Record<string, string>;
  promptHash: string;
  rawResponse?: string;
  latencyMs: number;
  error?: string;
}

function promptHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 12);
}

/**
 * 임의의 LLMProvider를 감싸 호출마다 구조화 로그를 남긴다 (키 불필요·결정적 mock로 검증).
 * 묶음 B에서 ClaudeProvider 실측 시 raw 응답·latency·error를 그대로 기록하기 위한 준비.
 * 파싱된 choice / missing 여부는 simulate 단계(StudyResult)에서 personaId로 결합한다.
 */
export class LoggingProvider implements LLMProvider {
  readonly logs: LlmCallLog[] = [];
  /**
   * inner가 askChoice를 구현할 때만 노출 — simulate는 askChoice 존재 여부로
   * 구조화/폴백 경로를 고르므로, 없는데 노출하면 폴백 판정이 깨진다.
   */
  askChoice?: (
    persona: Persona,
    prompt: string,
    choices: string[],
  ) => Promise<ChoiceReply>;

  constructor(
    private inner: LLMProvider,
    private opts: { runId: string; model: string },
  ) {
    if (inner.askChoice) {
      const forward = inner.askChoice.bind(inner);
      this.askChoice = (persona, prompt, choices) =>
        this.logged(persona, prompt, async () => {
          const reply = await forward(persona, prompt, choices);
          return { result: reply, raw: JSON.stringify(reply) };
        });
    }
  }

  /** inner의 누적 사용량을 그대로 노출 (래핑해도 토큰 집계 유지). */
  get usage(): ProviderUsage | undefined {
    return this.inner.usage;
  }

  private async logged<T>(
    persona: Persona,
    prompt: string,
    run: () => Promise<{ result: T; raw: string }>,
  ): Promise<T> {
    const start = Date.now();
    const base = {
      runId: this.opts.runId,
      model: this.opts.model,
      personaId: persona.id,
      attrs: persona.attrs,
      promptHash: promptHash(prompt),
    };
    try {
      const { result, raw } = await run();
      this.logs.push({
        ...base,
        rawResponse: raw,
        latencyMs: Date.now() - start,
      });
      return result;
    } catch (e) {
      this.logs.push({
        ...base,
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  async ask(persona: Persona, prompt: string): Promise<string> {
    return this.logged(persona, prompt, async () => {
      const raw = await this.inner.ask(persona, prompt);
      return { result: raw, raw };
    });
  }

  /** 에러로 끝난 호출 수 (전원 실패/한도 모니터링용). */
  errorCount(): number {
    return this.logs.filter((l) => l.error !== undefined).length;
  }
}

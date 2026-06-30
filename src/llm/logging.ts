import { createHash } from "node:crypto";
import type { Persona } from "../types.js";
import type { LLMProvider } from "./provider.js";

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
  constructor(
    private inner: LLMProvider,
    private opts: { runId: string; model: string },
  ) {}

  async ask(persona: Persona, prompt: string): Promise<string> {
    const start = Date.now();
    const base = {
      runId: this.opts.runId,
      model: this.opts.model,
      personaId: persona.id,
      attrs: persona.attrs,
      promptHash: promptHash(prompt),
    };
    try {
      const rawResponse = await this.inner.ask(persona, prompt);
      this.logs.push({
        ...base,
        rawResponse,
        latencyMs: Date.now() - start,
      });
      return rawResponse;
    } catch (e) {
      this.logs.push({
        ...base,
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  /** 에러로 끝난 호출 수 (전원 실패/한도 모니터링용). */
  errorCount(): number {
    return this.logs.filter((l) => l.error !== undefined).length;
  }
}

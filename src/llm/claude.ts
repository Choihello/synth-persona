import Anthropic from "@anthropic-ai/sdk";
import type { Persona } from "../types.js";
import type { LLMProvider } from "./provider.js";

// 정확한 모델 ID는 claude-api 레퍼런스로 확정 — 기본값은 비용 우선
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export function personaSystemPrompt(persona: Persona): string {
  const lines = Object.entries(persona.attrs).map(([k, v]) => `- ${k}: ${v}`);
  return [
    "당신은 아래 인구통계 속성을 가진 한국의 한 사람입니다. 그 사람으로서 답하세요.",
    ...lines,
    "교과서적 평균이 아니라 이 속성을 가진 실제 개인처럼, 간결하고 솔직하게 답하세요.",
  ].join("\n");
}

interface MessagesClient {
  messages: { create: (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }> };
}

export class ClaudeProvider implements LLMProvider {
  private client: MessagesClient;
  private model: string;
  constructor(opts?: { apiKey?: string; model?: string; client?: MessagesClient }) {
    this.model = opts?.model ?? DEFAULT_MODEL;
    this.client = opts?.client ?? (new Anthropic({ apiKey: opts?.apiKey ?? process.env.ANTHROPIC_API_KEY }) as unknown as MessagesClient);
  }
  async ask(persona: Persona, prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: personaSystemPrompt(persona),
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    return text.trim();
  }
}

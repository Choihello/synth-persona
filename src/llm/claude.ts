import Anthropic from "@anthropic-ai/sdk";
import type { Persona } from "../types.js";
import type { LLMProvider } from "./provider.js";

// 정확한 모델 ID는 claude-api 레퍼런스로 확정 — 기본값은 비용 우선
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export function personaSystemPrompt(persona: Persona): string {
  const attrLines = Object.entries(persona.attrs).map(([k, v]) => {
    const prov = persona.provenance?.[k];
    return prov ? `- ${k}: ${v} (출처: ${prov})` : `- ${k}: ${v}`;
  });
  const lines = [
    "당신은 통계청 인구총조사 분포로 구성된 가상 패널 응답자(synthetic panel respondent)입니다.",
    "실제 개인이 아니며, 사람 대상 실측 전에 가설을 탐색하기 위한 것입니다.",
    "아래 속성을 가진 사람이라면 어떻게 답할지, 그 사람의 입장에서 간결하고 솔직하게 답하세요 (교과서적 평균이 아니라 이 속성 조합의 개인처럼).",
    "",
    ...attrLines,
  ];
  const bridge = (persona.flags ?? []).find((f) => f.startsWith("bridge:"));
  if (bridge) {
    lines.push(`- 참고: 일부 속성은 가구주 연령 기반 추정입니다 (${bridge}).`);
  }
  lines.push(
    "",
    "출처가 conditioned/inferred인 속성은 추정값이니 과신하지 마세요.",
  );
  return lines.join("\n");
}

interface MessagesClient {
  messages: {
    create: (
      args: unknown,
    ) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export class ClaudeProvider implements LLMProvider {
  private client: MessagesClient;
  private model: string;
  constructor(opts?: {
    apiKey?: string;
    model?: string;
    client?: MessagesClient;
  }) {
    this.model = opts?.model ?? DEFAULT_MODEL;
    this.client =
      opts?.client ??
      (new Anthropic({
        apiKey: opts?.apiKey ?? process.env.ANTHROPIC_API_KEY,
      }) as unknown as MessagesClient);
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

import Anthropic from "@anthropic-ai/sdk";
import type { Persona } from "../types.js";
import type { ChoiceReply, LLMProvider, ProviderUsage } from "./provider.js";

export type { ProviderUsage } from "./provider.js";

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
  if (persona.narrative) {
    lines.push(
      "",
      "배경 서사 (참고용 — 아래 속성과 상충하면 속성이 우선):",
      persona.narrative,
    );
  }
  lines.push(
    "",
    "출처가 conditioned/inferred인 속성은 추정값이니 과신하지 마세요.",
  );
  return lines.join("\n");
}

interface MessagesClient {
  messages: {
    create: (args: unknown) => Promise<{
      content: Array<{ type: string; text?: string; input?: unknown }>;
      usage?: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export class ClaudeProvider implements LLMProvider {
  private client: MessagesClient;
  private model: string;
  /** 누적 토큰 사용량. Haiku 4.5 기준 단가: 입력 $1/M · 출력 $5/M (2026-06). */
  readonly usage: ProviderUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };

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

  private track(res: {
    usage?: { input_tokens: number; output_tokens: number };
  }): void {
    this.usage.calls++;
    this.usage.inputTokens += res.usage?.input_tokens ?? 0;
    this.usage.outputTokens += res.usage?.output_tokens ?? 0;
  }

  async ask(persona: Persona, prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: personaSystemPrompt(persona),
      messages: [{ role: "user", content: prompt }],
    });
    this.track(res);
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    return text.trim();
  }

  /**
   * tool use로 선택지를 강제한다: strict + enum + tool_choice.
   * reason도 함께 받아 Response.answer로 보존 → B3(처방 근거)에서 활용.
   */
  async askChoice(
    persona: Persona,
    prompt: string,
    choices: string[],
  ): Promise<ChoiceReply> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 256,
      system: personaSystemPrompt(persona),
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "answer",
          description:
            "제시된 선택지 중 정확히 하나를 고르고, 이 속성 조합의 개인 입장에서 그 이유를 한두 문장으로 남긴다.",
          strict: true,
          input_schema: {
            type: "object",
            properties: {
              choice: { type: "string", enum: choices },
              reason: {
                type: "string",
                description:
                  "이 선택을 한 이유 (한두 문장, 이 사람의 입장에서)",
              },
            },
            required: ["choice", "reason"],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: { type: "tool", name: "answer" },
    });
    this.track(res);
    const tu = res.content.find((c) => c.type === "tool_use");
    const input = tu?.input as { choice?: string; reason?: string } | undefined;
    if (!input?.choice) {
      throw new Error(
        "구조화 응답에 tool_use 블록/choice가 없습니다 — 모델 응답 형식을 확인하세요.",
      );
    }
    return { choice: input.choice, reason: input.reason };
  }

  async generateJson(
    system: string,
    user: string,
    schema: { name: string; schema: Record<string, unknown> },
  ): Promise<unknown> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
      tools: [
        {
          name: schema.name,
          description: "요청된 스키마에 맞는 구조화 결과를 반환한다.",
          strict: true,
          input_schema: schema.schema,
        },
      ],
      tool_choice: { type: "tool", name: schema.name },
    });
    this.track(res);
    const tu = res.content.find((c) => c.type === "tool_use");
    if (!tu) throw new Error("구조화 응답에 tool_use 블록이 없습니다");
    return tu.input;
  }
}

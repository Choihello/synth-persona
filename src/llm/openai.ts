import type { Persona } from "../types.js";
import { personaSystemPrompt } from "./claude.js";
import type { ChoiceReply, LLMProvider, ProviderUsage } from "./provider.js";

// 비용 우선 기본값 (2026-07 기준 입력 $0.15/M · 출력 $0.60/M)
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * OpenAI Chat Completions 기반 LLMProvider. 런타임 의존성 없이 내장 fetch만 쓴다.
 * askChoice는 structured outputs(json_schema + strict + enum)로 선택지를 강제해
 * ClaudeProvider의 tool use 강제 경로와 같은 보증을 제공한다.
 */
export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;
  readonly usage: ProviderUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };

  constructor(opts?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    fetchFn?: typeof fetch;
  }) {
    this.apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model = opts?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    this.baseUrl = opts?.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = opts?.fetchFn ?? fetch;
  }

  private async chat(
    body: Record<string, unknown>,
  ): Promise<ChatCompletionResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, ...body }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as ChatCompletionResponse;
    this.usage.calls += 1;
    this.usage.inputTokens += json.usage?.prompt_tokens ?? 0;
    this.usage.outputTokens += json.usage?.completion_tokens ?? 0;
    return json;
  }

  async ask(persona: Persona, prompt: string): Promise<string> {
    const res = await this.chat({
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: personaSystemPrompt(persona) },
        { role: "user", content: prompt },
      ],
    });
    return (res.choices?.[0]?.message?.content ?? "").trim();
  }

  async askChoice(
    persona: Persona,
    prompt: string,
    choices: string[],
  ): Promise<ChoiceReply> {
    const res = await this.chat({
      max_completion_tokens: 256,
      messages: [
        { role: "system", content: personaSystemPrompt(persona) },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "answer",
          strict: true,
          schema: {
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
      },
    });
    const content = res.choices?.[0]?.message?.content ?? "";
    let parsed: { choice?: string; reason?: string };
    try {
      parsed = JSON.parse(content) as { choice?: string; reason?: string };
    } catch {
      throw new Error(`구조화 응답 JSON 파싱 실패: ${content.slice(0, 120)}`);
    }
    if (!parsed.choice) {
      throw new Error(
        `구조화 응답에 choice가 없습니다: ${content.slice(0, 120)}`,
      );
    }
    return { choice: parsed.choice, reason: parsed.reason };
  }

  async generateJson(
    system: string,
    user: string,
    schema: { name: string; schema: Record<string, unknown> },
  ): Promise<unknown> {
    const res = await this.chat({
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schema.name, strict: true, schema: schema.schema },
      },
    });
    const content = res.choices?.[0]?.message?.content ?? "";
    try {
      return JSON.parse(content);
    } catch {
      throw new Error(`구조화 JSON 파싱 실패: ${content.slice(0, 120)}`);
    }
  }
}

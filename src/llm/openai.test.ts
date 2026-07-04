import { describe, expect, test } from "vitest";
import type { Persona } from "../types.js";
import { OpenAIProvider } from "./openai.js";

const persona: Persona = { id: "p1", attrs: { 연령: "25~29세" }, weight: 1 };

type FetchArgs = { url: string; body: Record<string, unknown> };

function fakeFetch(
  responder: (args: FetchArgs) => {
    status?: number;
    json: Record<string, unknown>;
  },
): { fetchFn: typeof fetch; calls: FetchArgs[] } {
  const calls: FetchArgs[] = [];
  const fetchFn = (async (url: unknown, init?: { body?: string }) => {
    const args = {
      url: String(url),
      body: JSON.parse(init?.body ?? "{}") as Record<string, unknown>,
    };
    calls.push(args);
    const r = responder(args);
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      text: async () => JSON.stringify(r.json),
      json: async () => r.json,
    };
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

function chatResponse(content: string, usage = { in: 100, out: 20 }) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: usage.in, completion_tokens: usage.out },
  };
}

describe("OpenAIProvider.ask", () => {
  test("chat/completions에 system(페르소나)+user를 보내고 텍스트를 반환한다", async () => {
    const { fetchFn, calls } = fakeFetch(() => ({
      json: chatResponse("  쓴다  "),
    }));
    const p = new OpenAIProvider({
      apiKey: "sk-test",
      model: "test-model",
      fetchFn,
    });
    const out = await p.ask(persona, "쓸 의향?");
    expect(out).toBe("쓴다");
    expect(calls[0].url).toContain("/chat/completions");
    const msgs = calls[0].body.messages as Array<{
      role: string;
      content: string;
    }>;
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("25~29세"); // personaSystemPrompt 재사용
    expect(msgs[1]).toEqual({ role: "user", content: "쓸 의향?" });
  });

  test("HTTP 에러는 status와 본문을 담아 throw한다", async () => {
    const { fetchFn } = fakeFetch(() => ({
      status: 401,
      json: { error: { message: "Incorrect API key" } },
    }));
    const p = new OpenAIProvider({ apiKey: "bad", fetchFn });
    await expect(p.ask(persona, "q?")).rejects.toThrow(/401.*Incorrect/);
  });
});

describe("OpenAIProvider.askChoice", () => {
  test("strict json_schema(enum 강제)로 요청하고 구조화 응답을 파싱한다", async () => {
    const { fetchFn, calls } = fakeFetch(() => ({
      json: chatResponse(JSON.stringify({ choice: "쓴다", reason: "필요함" })),
    }));
    const p = new OpenAIProvider({ apiKey: "sk-test", fetchFn });
    const reply = await p.askChoice(persona, "쓸 의향?", ["쓴다", "안쓴다"]);
    expect(reply).toEqual({ choice: "쓴다", reason: "필요함" });
    const rf = calls[0].body.response_format as {
      type: string;
      json_schema: {
        strict: boolean;
        schema: {
          properties: { choice: { enum: string[] } };
          additionalProperties: boolean;
        };
      };
    };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema.properties.choice.enum).toEqual([
      "쓴다",
      "안쓴다",
    ]);
    expect(rf.json_schema.schema.additionalProperties).toBe(false);
  });

  test("choice 없는 응답은 throw한다 (missing 처리 경로)", async () => {
    const { fetchFn } = fakeFetch(() => ({
      json: chatResponse(JSON.stringify({ reason: "몰라" })),
    }));
    const p = new OpenAIProvider({ apiKey: "sk-test", fetchFn });
    await expect(
      p.askChoice(persona, "q?", ["쓴다", "안쓴다"]),
    ).rejects.toThrow(/choice/);
  });

  test("usage를 ask/askChoice에 걸쳐 누적한다", async () => {
    const { fetchFn } = fakeFetch(() => ({
      json: chatResponse(JSON.stringify({ choice: "쓴다", reason: "r" })),
    }));
    const p = new OpenAIProvider({ apiKey: "sk-test", fetchFn });
    await p.askChoice(persona, "q?", ["쓴다", "안쓴다"]);
    await p.askChoice(persona, "q?", ["쓴다", "안쓴다"]);
    expect(p.usage).toEqual({ calls: 2, inputTokens: 200, outputTokens: 40 });
  });
});

describe("OpenAIProvider.generateJson", () => {
  test("json_schema strict로 요청하고 파싱된 객체를 반환하며 usage를 누적한다", async () => {
    const { fetchFn, calls } = fakeFetch(() => ({
      json: chatResponse(JSON.stringify({ drivers: [{ label: "x" }] })),
    }));
    const p = new OpenAIProvider({ apiKey: "sk-test", fetchFn });
    const out = await p.generateJson("시스템", "유저 입력", {
      name: "prescriptions",
      schema: { type: "object", additionalProperties: false },
    });
    expect(out).toEqual({ drivers: [{ label: "x" }] });
    const body = calls[0].body as {
      messages: Array<{ role: string; content: string }>;
      response_format: {
        type: string;
        json_schema: { name: string; strict: boolean };
      };
    };
    expect(body.messages[0]).toEqual({ role: "system", content: "시스템" });
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("prescriptions");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(p.usage.calls).toBe(1);
  });

  test("JSON 파싱 실패는 throw", async () => {
    const { fetchFn } = fakeFetch(() => ({ json: chatResponse("not-json") }));
    const p = new OpenAIProvider({ apiKey: "sk-test", fetchFn });
    await expect(
      p.generateJson("s", "u", { name: "x", schema: {} }),
    ).rejects.toThrow(/JSON/);
  });
});

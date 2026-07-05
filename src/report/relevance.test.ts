import { describe, expect, test } from "vitest";
import type { LLMProvider } from "../llm/provider.js";
import { RELEVANCE_SCHEMA, judgeDimensionRelevance } from "./relevance.js";

const jsonProvider = (raw: unknown): LLMProvider => ({
  ask: async () => "",
  generateJson: async () => raw,
});

describe("judgeDimensionRelevance", () => {
  const dims = ["연령", "혼인"];

  test("정상 판정: high/low와 low 이유를 파싱한다", async () => {
    const v = await judgeDimensionRelevance({
      provider: jsonProvider({
        verdicts: [
          { dimension: "연령", relevance: "high" },
          { dimension: "혼인", relevance: "low", reason: "보안 수요와 무관" },
        ],
      }),
      question: "보안솔루션을 구독하시겠습니까?",
      dimensions: dims,
    });
    expect(v).toEqual({
      relevant: { 연령: "high", 혼인: "low" },
      reasons: { 혼인: "보안 수요와 무관" },
      basis: "llm",
    });
  });

  test("generateJson 미구현 provider는 null", async () => {
    const v = await judgeDimensionRelevance({
      provider: { ask: async () => "" },
      question: "q",
      dimensions: dims,
    });
    expect(v).toBeNull();
  });

  test("호출이 throw하면 null (조용한 폴백)", async () => {
    const provider: LLMProvider = {
      ask: async () => "",
      generateJson: async () => {
        throw new Error("boom");
      },
    };
    expect(
      await judgeDimensionRelevance({
        provider,
        question: "q",
        dimensions: dims,
      }),
    ).toBeNull();
  });

  test("스키마 위반(relevance 오타 값)은 null", async () => {
    const v = await judgeDimensionRelevance({
      provider: jsonProvider({
        verdicts: [{ dimension: "연령", relevance: "maybe" }],
      }),
      question: "q",
      dimensions: dims,
    });
    expect(v).toBeNull();
  });

  test("dimensions 밖 항목은 무시, 누락 차원은 relevant에 없음(호출자 high 취급)", async () => {
    const v = await judgeDimensionRelevance({
      provider: jsonProvider({
        verdicts: [
          { dimension: "직업", relevance: "low", reason: "x" },
          { dimension: "연령", relevance: "high" },
        ],
      }),
      question: "q",
      dimensions: dims,
    });
    expect(v).toEqual({
      relevant: { 연령: "high" },
      reasons: {},
      basis: "llm",
    });
  });

  test("dimensions가 비면 null (콜 낭비 방지)", async () => {
    const v = await judgeDimensionRelevance({
      provider: jsonProvider({ verdicts: [] }),
      question: "q",
      dimensions: [],
    });
    expect(v).toBeNull();
  });

  test("RELEVANCE_SCHEMA는 OpenAI strict 모드 호환 — 모든 object의 required가 properties 전체를 포함", () => {
    const checkStrict = (node: unknown): void => {
      if (typeof node !== "object" || node === null) return;
      const n = node as Record<string, unknown>;
      if (
        n.type === "object" &&
        typeof n.properties === "object" &&
        n.properties
      ) {
        const props = Object.keys(n.properties as Record<string, unknown>);
        expect(
          n.required,
          `object node missing required for [${props.join(",")}]`,
        ).toEqual(expect.arrayContaining(props));
      }
      for (const v of Object.values(n)) checkStrict(v);
    };
    checkStrict(RELEVANCE_SCHEMA.schema);
  });
});

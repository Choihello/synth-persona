import { describe, expect, it, test } from "vitest";
import {
  censusAwareDemoMock,
  formatResult,
  parseIntArg,
  parseN,
  USAGE,
  parseSeed,
  resolveCounterbalance,
  resolveProvider,
} from "../cli/main.js";
import { ClaudeProvider } from "./llm/claude.js";
import { MockProvider } from "./llm/mock.js";
import { OpenAIProvider } from "./llm/openai.js";
import type { Persona, StudyResult } from "./types.js";

const result: StudyResult = {
  responses: [],
  signal: "split",
  dispersion: 0.9,
  bySegment: {
    age: {
      "20대": { signal: "consensus", breakdown: { A안: 10 } },
      "40대": { signal: "consensus", breakdown: { B안: 10 } },
    },
  },
};

describe("formatResult", () => {
  test("전체 신호와 세그먼트를 사람이 읽는 형태로 출력", () => {
    const text = formatResult(result);
    expect(text).toContain("🔴"); // split
    expect(text).toContain("age");
    expect(text).toContain("20대");
  });

  test("일부 실패(missing)는 출력에 누락 건수 + missing rate로 표시된다", () => {
    const text = formatResult({
      ...result,
      responses: [
        {
          persona: { id: "x", attrs: {}, weight: 1 },
          answer: "A안",
          choice: "A안",
        },
      ],
      missing: [{ personaId: "1", reason: "rate limit" }],
    });
    expect(text).toContain("누락");
    expect(text).toContain("1건");
    expect(text).toContain("missing rate 50.0%"); // 1 실패 / (1 응답 + 1 실패)
  });

  test("출력에 synthetic panel response 라벨 배너가 포함된다", () => {
    const text = formatResult(result);
    expect(text).toContain("synthetic panel response");
    expect(text).toContain("실제 시장 반응 아님");
  });
});

describe("parseN", () => {
  test("유효한 양의 정수는 통과", () => {
    expect(parseN("50")).toBe(50);
    expect(parseN("1")).toBe(1);
  });

  test.each(["0", "-1", "abc", "2.5", "", "Infinity"])(
    "잘못된 --n=%s 는 throw (조용히 빈 결과로 흘러가지 않음)",
    (bad) => {
      expect(() => parseN(bad)).toThrow(/--n/);
    },
  );
});

describe("censusAwareDemoMock", () => {
  const p = (attrs: Record<string, string>): Persona => ({
    id: "1",
    attrs,
    weight: 1,
  });

  test("census 연령(20~39대)은 첫 선택지, 그 외는 둘째", () => {
    const fn = censusAwareDemoMock(["쓴다", "안쓴다"]);
    expect(fn(p({ 연령: "25~29세" }))).toBe("쓴다");
    expect(fn(p({ 연령: "60~64세" }))).toBe("안쓴다");
  });

  test("기존 sample 소스(age '20대'/'40대')와도 호환된다", () => {
    const fn = censusAwareDemoMock(["쓴다", "안쓴다"]);
    expect(fn(p({ age: "20대" }))).toBe("쓴다");
    expect(fn(p({ age: "40대" }))).toBe("안쓴다");
  });
});

describe("parseSeed", () => {
  it("정수를 파싱한다", () => {
    expect(parseSeed("7")).toBe(7);
  });
  it("숫자가 아니면 명확히 실패한다 (NaN 조용히 통과 금지)", () => {
    expect(() => parseSeed("abc")).toThrow(/--seed/);
    expect(() => parseSeed("1.5")).toThrow(/--seed/);
  });
});

describe("resolveProvider", () => {
  it("--mock이면 프로바이더 지정과 무관하게 MockProvider", () => {
    const p = resolveProvider({ mock: true, provider: "openai" });
    expect(p).toBeInstanceOf(MockProvider);
  });
  it("openai(기본)/anthropic을 선택할 수 있다", () => {
    expect(resolveProvider({ mock: false })).toBeInstanceOf(OpenAIProvider);
    expect(
      resolveProvider({ mock: false, provider: "anthropic" }),
    ).toBeInstanceOf(ClaudeProvider);
  });
  it("지원하지 않는 값은 --provider를 지목하며 throw", () => {
    expect(() => resolveProvider({ mock: false, provider: "gemini" })).toThrow(
      /--provider/,
    );
  });
});

describe("USAGE", () => {
  it("모든 플래그가 도움말에 설명된다", () => {
    for (const flag of [
      "--question",
      "--choices",
      "--n",
      "--seed",
      "--source",
      "--mock",
      "--provider",
      "--concurrency",
      "--repeats",
      "--no-counterbalance",
      "--help",
    ]) {
      expect(USAGE).toContain(flag);
    }
    expect(USAGE).toContain("OPENAI_API_KEY");
  });
});

describe("resolveCounterbalance", () => {
  it("라이브 경로는 기본 on (B2 실측: 순서 편향 상쇄)", () => {
    expect(resolveCounterbalance({ mock: false })).toBe(true);
  });
  it("--no-counterbalance로 끌 수 있다", () => {
    expect(resolveCounterbalance({ mock: false, noCounterbalance: true })).toBe(
      false,
    );
  });
  it("mock은 기본 off (결정성·기존 데모 출력 보존), 명시하면 on", () => {
    expect(resolveCounterbalance({ mock: true })).toBe(false);
    expect(resolveCounterbalance({ mock: true, counterbalance: true })).toBe(
      true,
    );
  });
});

describe("parseIntArg", () => {
  it("에러 메시지가 전달받은 플래그 이름을 지목한다 (--n 아님)", () => {
    expect(() => parseIntArg("0", "--concurrency", { min: 1 })).toThrow(
      /--concurrency/,
    );
    expect(() => parseIntArg("2.5", "--concurrency", { min: 1 })).toThrow(
      /--concurrency/,
    );
  });
  it("min 미지정 시 음수 정수도 허용한다 (seed 용도)", () => {
    expect(parseIntArg("-3", "--seed")).toBe(-3);
  });
});

describe("formatResult — 소표본 세그먼트", () => {
  it("n<minN 세그먼트는 ⚪ + n 표기로 판단 보류 처리", () => {
    const result = {
      responses: [
        {
          persona: { id: "p1", attrs: { 연령: "20대" }, weight: 1 },
          answer: "쓴다",
          choice: "쓴다",
        },
        {
          persona: { id: "p2", attrs: { 연령: "20대" }, weight: 1 },
          answer: "쓴다",
          choice: "쓴다",
        },
      ],
      signal: "consensus" as const,
      dispersion: 0,
      bySegment: {
        연령: {
          "20대": { signal: "consensus" as const, breakdown: { 쓴다: 2 } },
        },
      },
    };
    const out = formatResult(result, { minN: 8 });
    expect(out).toContain("⚪");
    expect(out).toContain("(n=2)");
    expect(out).toContain("판단 보류");
  });
});

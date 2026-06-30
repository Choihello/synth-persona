import { describe, expect, test } from "vitest";
import { censusAwareDemoMock, formatResult, parseN } from "../cli/main.js";
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

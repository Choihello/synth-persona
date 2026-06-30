import { describe, expect, test } from "vitest";
import { formatResult, parseN } from "../cli/main.js";
import type { StudyResult } from "./types.js";

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

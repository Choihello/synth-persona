import { describe, expect, test } from "vitest";
import type { StudyResult } from "./types.js";
import { formatResult } from "../cli/main.js";

const result: StudyResult = {
  responses: [],
  signal: "split",
  dispersion: 0.9,
  bySegment: { age: { "20대": { signal: "consensus", breakdown: { A안: 10 } }, "40대": { signal: "consensus", breakdown: { B안: 10 } } } },
};

describe("formatResult", () => {
  test("전체 신호와 세그먼트를 사람이 읽는 형태로 출력", () => {
    const text = formatResult(result);
    expect(text).toContain("🔴"); // split
    expect(text).toContain("age");
    expect(text).toContain("20대");
  });
});

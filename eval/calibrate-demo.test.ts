import { describe, expect, test } from "vitest";
import { loadCases, runDemo } from "./calibrate-demo.js";

describe("calibrate-demo", () => {
  test("loadCases는 cases 배열을 파싱한다", () => {
    const cs = loadCases({
      cases: [
        {
          id: "x",
          question: "q",
          choices: ["A", "B"],
          actualShare: { A: 0.5, B: 0.5 },
        },
      ],
    });
    expect(cs).toHaveLength(1);
    expect(cs[0].id).toBe("x");
  });
  test("runDemo는 마크다운 성적표 문자열을 만든다(키 불필요)", async () => {
    const md = await runDemo();
    expect(md).toContain("# ");
    expect(md).toContain("캘리브레이션");
  });
});

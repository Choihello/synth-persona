import { describe, expect, test } from "vitest";
import { runFidelityDemo } from "./fidelity-demo.js";

describe("fidelity-demo", () => {
  test("실제 스냅샷으로 fidelity 리포트를 만든다(키 불필요)", () => {
    const md = runFidelityDemo();
    expect(md).toContain("# ");
    expect(md).toContain("1층 신뢰");
    expect(md).toContain("matched");
  });
});

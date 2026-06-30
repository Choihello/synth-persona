import { describe, expect, test } from "vitest";
import { runReliabilityDemo } from "./reliability-demo.js";

describe("reliability-demo", () => {
  test("census 합성인구로 신뢰성 카드를 렌더한다 (키 불필요·결정적)", async () => {
    const md = await runReliabilityDemo();
    expect(md).toContain("## 신뢰성 카드");
    expect(md).toContain("synthetic panel response");
    // 2층: matched(성/연령/지역) + conditioned(혼인/가구원수) 노출
    expect(md).toContain("matched");
    expect(md).toContain("conditioned");
    // householder bridge note
    expect(md).toContain("householder_age_as_proxy");
  });
});

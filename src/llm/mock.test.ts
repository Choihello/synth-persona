import { describe, expect, test } from "vitest";
import { MockProvider } from "./mock.js";

describe("MockProvider", () => {
  test("주입 함수의 응답을 반환한다", async () => {
    const p = new MockProvider((persona) =>
      persona.attrs.age === "20대" ? "A" : "B",
    );
    expect(
      await p.ask({ id: "1", attrs: { age: "20대" }, weight: 1 }, "q"),
    ).toBe("A");
    expect(
      await p.ask({ id: "2", attrs: { age: "40대" }, weight: 1 }, "q"),
    ).toBe("B");
  });
});

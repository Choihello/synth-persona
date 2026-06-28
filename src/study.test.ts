import { describe, expect, test } from "vitest";
import { SampleSource } from "./data/sample-source.js";
import { MockProvider } from "./llm/mock.js";
import { runStudy } from "./study.js";

describe("runStudy (end-to-end, mock)", () => {
  test("샘플 분포 + mock LLM로 StudyResult를 만든다", async () => {
    // 연령으로 갈리는 mock: 20/30대는 A, 40/50대는 B
    const provider = new MockProvider((p) => (["20대", "30대"].includes(p.attrs.age) ? "A안" : "B안"));
    const result = await runStudy({
      source: new SampleSource(),
      provider,
      question: { prompt: "A안 vs B안?", choices: ["A안", "B안"] },
      n: 80,
      seed: 42,
    });
    expect(result.responses.length).toBeGreaterThan(0);
    expect(result.bySegment.age).toBeDefined();
    // 같은 시드는 같은 결과(결정적)
    const again = await runStudy({
      source: new SampleSource(),
      provider,
      question: { prompt: "A안 vs B안?", choices: ["A안", "B안"] },
      n: 80,
      seed: 42,
    });
    expect(again.responses.map((r) => r.choice)).toEqual(result.responses.map((r) => r.choice));
  });
});

import { describe, expect, test } from "vitest";
import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import { SampleSource } from "./data/sample-source.js";
import { MockProvider } from "./llm/mock.js";
import type { Snapshot } from "./population/schema.js";
import { CensusPopulation } from "./population/source.js";
import { censusShareRunner, runCensusStudy, runStudy } from "./study.js";
import { orderBias } from "./verify/robustness.js";

describe("runStudy (end-to-end, mock)", () => {
  test("샘플 분포 + mock LLM로 StudyResult를 만든다", async () => {
    // 연령으로 갈리는 mock: 20/30대는 A, 40/50대는 B
    const provider = new MockProvider((p) =>
      ["20대", "30대"].includes(p.attrs.age) ? "A안" : "B안",
    );
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
    expect(again.responses.map((r) => r.choice)).toEqual(
      result.responses.map((r) => r.choice),
    );
  });

  test("모든 응답이 실패하면 runStudy가 throw (false consensus 방지)", async () => {
    const provider = new MockProvider(() => {
      throw new Error("rate limit");
    });
    await expect(
      runStudy({
        source: new SampleSource(),
        provider,
        question: { prompt: "q", choices: ["A안", "B안"] },
        n: 10,
        seed: 1,
      }),
    ).rejects.toThrow(/응답/);
  });
});

describe("runCensusStudy (key-free, census 합성인구)", () => {
  const population = new CensusPopulation(snapshotJson as unknown as Snapshot);
  const young = new Set(["20~24세", "25~29세", "30~34세"]);
  const mock = new MockProvider((p) =>
    young.has(p.attrs.연령) ? "쓴다" : "안쓴다",
  );
  const question = {
    prompt: "월 9900원에 쓸 의향?",
    choices: ["쓴다", "안쓴다"],
  };

  test("census 합성인구 + mock으로 StudyResult 생성 (provenance 세그먼트 포함·결정적)", async () => {
    const result = await runCensusStudy({
      population,
      provider: mock,
      question,
      n: 100,
      seed: 7,
    });
    expect(result.responses.length).toBe(100);
    expect(result.bySegment.연령).toBeDefined();
    expect(result.bySegment.가구원수).toBeDefined();
    // 추출된 페르소나는 provenance를 보존한다(통계청 합성 인구)
    expect(result.responses[0].persona.provenance?.연령).toBe("matched");
    // 같은 시드는 같은 결과
    const again = await runCensusStudy({
      population,
      provider: mock,
      question,
      n: 100,
      seed: 7,
    });
    expect(again.responses.map((r) => r.choice)).toEqual(
      result.responses.map((r) => r.choice),
    );
  });

  test("censusShareRunner는 provider abstraction 위에서 robustness(orderBias)를 구동한다", async () => {
    const runner = censusShareRunner(population, mock, { n: 80, seed: 3 });
    const tally = await runner(question.prompt, question.choices);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(80);
    const ob = await orderBias(runner, question.prompt, question.choices);
    expect(typeof ob.biased).toBe("boolean");
  });
});

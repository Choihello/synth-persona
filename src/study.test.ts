import { describe, expect, test } from "vitest";
import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import { SampleSource } from "./data/sample-source.js";
import { MockProvider } from "./llm/mock.js";
import type { LLMProvider } from "./llm/provider.js";
import type { NarrativePool } from "./personas/narrative.js";
import type { Snapshot } from "./population/schema.js";
import { CensusPopulation } from "./population/source.js";
import { censusShareRunner, runCensusStudy, runStudy } from "./study.js";
import type { Persona } from "./types.js";
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
        simulate: { backoffMs: 0 },
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

  test("전원 실패 시 첫 실패 사유가 에러에 포함된다 (키/크레딧 진단 가능)", async () => {
    const failing = {
      async ask(): Promise<string> {
        throw new Error("401 Incorrect API key provided");
      },
    };
    await expect(
      runCensusStudy({
        population,
        provider: failing,
        question,
        n: 5,
        seed: 7,
      }),
    ).rejects.toThrow(/Incorrect API key/);
  });

  test("repeats: k회 실행 응답을 풀링해 집계한다 (n×k 응답)", async () => {
    let calls = 0;
    const countingMock = {
      async ask(p: Persona) {
        calls++;
        return young.has(p.attrs.연령) ? "쓴다" : "안쓴다";
      },
    };
    const result = await runCensusStudy({
      population,
      provider: countingMock,
      question,
      n: 20,
      seed: 7,
      repeats: 3,
    });
    expect(calls).toBe(60); // 20 × 3
    expect(result.responses.length).toBe(60); // 풀링된 전체 응답
  });

  test("narrativePool을 주면 표본 페르소나에 서사가 붙는다 (미지정 시 기존과 동일)", async () => {
    const seen: string[] = [];
    const provider: LLMProvider = {
      ask: async (persona) => {
        seen.push(persona.narrative ?? "");
        return "쓴다";
      },
    };
    const narrativePopulation = {
      population: async () => [
        {
          id: "c1",
          attrs: {
            연령: "45~49세",
            성: "남자",
            지역: "수도권",
            혼인: "유배우",
          },
          weight: 1,
        },
      ],
    };
    const pool: NarrativePool = {
      meta: {
        source: "s",
        license: "CC BY 4.0",
        generatedAt: "d",
        rowsScanned: 1,
        strataFilled: 1,
        strataTotal: 168,
      },
      strata: {
        "45~49세|남자|수도권|유배우": [
          { n: "서사입니다.", job: "j", edu: "e", hh: "unknown" },
        ],
      },
    };
    await runCensusStudy({
      population: narrativePopulation,
      provider,
      question: { prompt: "q?", choices: ["쓴다", "안쓴다"] },
      n: 1,
      seed: 1,
      narrativePool: pool,
    });
    expect(seen.some((s) => s.includes("서사입니다."))).toBe(true);
  });

  test("censusShareRunner는 provider abstraction 위에서 robustness(orderBias)를 구동한다", async () => {
    const runner = censusShareRunner(population, mock, { n: 80, seed: 3 });
    const tally = await runner(question.prompt, question.choices);
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(80);
    const ob = await orderBias(runner, question.prompt, question.choices);
    expect(typeof ob.biased).toBe("boolean");
  });
});

describe("runCensusStudy — 패널 스크리너", () => {
  const source = {
    async population() {
      return [
        { id: "a", attrs: { 연령: "20~24세", 지역: "수도권" }, weight: 1 },
        { id: "b", attrs: { 연령: "30~34세", 지역: "비수도권" }, weight: 1 },
        { id: "c", attrs: { 연령: "70~74세", 지역: "수도권" }, weight: 1 },
      ];
    },
  };
  const question = { prompt: "q?", choices: ["쓴다", "안쓴다"] };

  test("스크리너를 주면 조건 밖 페르소나가 표본에 없다", async () => {
    const r = await runCensusStudy({
      population: source,
      provider: new MockProvider(() => "쓴다"),
      question,
      n: 12,
      seed: 1,
      screener: { 지역: "수도권" },
    });
    expect(r.responses.length).toBeGreaterThan(0);
    expect(r.responses.every((x) => x.persona.attrs.지역 === "수도권")).toBe(
      true,
    );
  });

  test("스크리너가 없으면 전 인구에서 뽑는다", async () => {
    const r = await runCensusStudy({
      population: source,
      provider: new MockProvider(() => "쓴다"),
      question,
      n: 30,
      seed: 1,
    });
    const regions = new Set(r.responses.map((x) => x.persona.attrs.지역));
    expect(regions.size).toBe(2);
  });

  test("조건에 맞는 인구가 없으면 명확한 에러를 던진다", async () => {
    await expect(
      runCensusStudy({
        population: source,
        provider: new MockProvider(() => "쓴다"),
        question,
        n: 5,
        seed: 1,
        screener: { 연령: ["85세이상"] },
      }),
    ).rejects.toThrow("스크리너 조건에 맞는 인구가 없습니다");
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import { personaSystemPrompt } from "../src/llm/claude.js";
import { MockProvider } from "../src/llm/mock.js";
import { makeReportRunner } from "./pipeline.js";

describe("makeReportRunner (키 없는 mock 경로)", () => {
  test("리포트 md 생성 + 진행이 반복(repeats)에 걸쳐 누적 보고된다", async () => {
    const provider = new MockProvider((p) =>
      (p.attrs.연령 ?? "").startsWith("2") ? "쓴다" : "안쓴다",
    );
    const runner = makeReportRunner(provider, {
      n: 10,
      repeats: 3,
      concurrency: 1,
    });
    const seen: Array<[number, number]> = [];
    const md = await runner(
      "월 9900원에 쓸 의향?",
      ["쓴다", "안쓴다"],
      (d, t) => seen.push([d, t]),
    );
    expect(md).toContain("## 한 줄 요약");
    // 쉬운 요약 카드가 "## 한 줄 요약" 앞(제목 아래)에 주입된다
    expect(md).toContain('<section class="easy-summary"');
    expect(md.indexOf('<section class="easy-summary"')).toBeLessThan(
      md.indexOf("## 한 줄 요약"),
    );
    expect(md.indexOf('<section class="easy-summary"')).toBeGreaterThan(
      md.indexOf("# "),
    );
    expect(md).toContain("synthetic panel response");
    expect(md).toContain("전체 응답 분포"); // 분포 스택바 SVG
    // 누적: 마지막 진행은 30/30 (10×3), 중간에 리셋(감소) 없음
    const dones = seen.map(([d]) => d);
    expect(Math.max(...dones)).toBe(30);
    expect(seen[seen.length - 1][1]).toBe(30);
    for (let i = 1; i < dones.length; i++) {
      expect(dones[i]).toBeGreaterThanOrEqual(dones[i - 1]);
    }
  });

  test("관련성 low 차원은 승격에서 제외되고 참고 섹션에 남는다", async () => {
    // pipeline.ts는 매 실행마다 Math.random()으로 seed를 뽑아 표본을 바꾼다.
    // 표본에 따라 low로 마킹한 차원이 rankSegments 승격 게이트를 못 넘을 수 있어
    // lowRelevance가 비어 참고 섹션 자체가 안 나오는 flaky 실패가 있었다 (~30%).
    // seed를 고정해 표본을 결정적으로 만든다.
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const provider = new MockProvider((p) =>
      (p.attrs.연령 ?? "").startsWith("2") ? "쓴다" : "안쓴다",
    ) as MockProvider & {
      generateJson?: (
        s: string,
        u: string,
        schema: { name: string },
      ) => Promise<unknown>;
    };
    // 모든 차원을 low로 마킹 — 고정 seed에서 무엇이 승격되든(mock 응답자는
    // 연령 기반이라 연령 세그먼트가 항상 승격됨) 전부 lowRelevance로 이동해
    // 참고 섹션과 제외 라인이 항상 보장된다.
    provider.generateJson = async (_s, _u, schema) =>
      schema.name === "dimension_relevance"
        ? {
            verdicts: [
              { dimension: "연령", relevance: "low", reason: "테스트 사유" },
              { dimension: "성", relevance: "low", reason: "테스트 사유" },
              { dimension: "지역", relevance: "low", reason: "테스트 사유" },
              {
                dimension: "가구원수",
                relevance: "low",
                reason: "테스트 사유",
              },
              { dimension: "혼인", relevance: "low", reason: "테스트 사유" },
            ],
          }
        : {}; // 처방 스키마에는 무효 JSON → llm 처방은 heuristic 폴백
    const runner = makeReportRunner(provider, {
      n: 30,
      repeats: 1,
      concurrency: 1,
    });
    const md = await runner("질문?", ["쓴다", "안쓴다"], () => {});
    expect(md).toContain("## 확실한 것만 추렸습니다");
    expect(md).toContain(
      "질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: 테스트 사유)",
    );
  });

  test("NARRATIVE 미설정이면 서사가 붙는다 (기본 ON)", async () => {
    const prompts: string[] = [];
    const provider = new MockProvider((p) =>
      (p.attrs.연령 ?? "").startsWith("2") ? "쓴다" : "안쓴다",
    );
    const origAsk = provider.ask.bind(provider);
    provider.ask = async (persona, prompt) => {
      prompts.push(personaSystemPrompt(persona));
      return origAsk(persona, prompt);
    };
    const runner = makeReportRunner(provider, {
      n: 10,
      repeats: 1,
      concurrency: 1,
    });
    const md = await runner("질문?", ["쓴다", "안쓴다"], () => {});
    expect(prompts.some((s) => s.includes("배경 서사"))).toBe(true);
    expect(md).toContain(
      "페르소나 서사: NVIDIA Nemotron-Personas-Korea (CC BY 4.0)",
    );
  });

  test("NARRATIVE=off면 붙지 않는다", async () => {
    process.env.NARRATIVE = "off";
    try {
      const prompts: string[] = [];
      const provider = new MockProvider(() => "쓴다");
      const origAsk = provider.ask.bind(provider);
      provider.ask = async (persona, prompt) => {
        prompts.push(personaSystemPrompt(persona));
        return origAsk(persona, prompt);
      };
      const runner = makeReportRunner(provider, {
        n: 5,
        repeats: 1,
        concurrency: 1,
      });
      const md = await runner("질문?", ["쓴다", "안쓴다"], () => {});
      expect(prompts.every((s) => !s.includes("배경 서사"))).toBe(true);
      expect(md).not.toContain("Nemotron");
    } finally {
      process.env.NARRATIVE = undefined;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

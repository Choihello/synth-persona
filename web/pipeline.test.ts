import { describe, expect, test } from "vitest";
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
    const provider = new MockProvider((p) =>
      (p.attrs.연령 ?? "").startsWith("2") ? "쓴다" : "안쓴다",
    ) as MockProvider & {
      generateJson?: (
        s: string,
        u: string,
        schema: { name: string },
      ) => Promise<unknown>;
    };
    provider.generateJson = async (_s, _u, schema) =>
      schema.name === "dimension_relevance"
        ? {
            verdicts: [
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
    expect(md).toContain("## 참고 — 순위에 올리지 않은 차이");
    expect(md).toContain(
      "질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: 테스트 사유)",
    );
  });
});

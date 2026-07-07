import { describe, expect, it } from "vitest";
import type { StudyResult } from "../types.js";
import { generateFounderInsightReport } from "./generate.js";
import { HELD_CAP, renderFounderInsightReport } from "./render.js";

// 세그먼트 다수를 가진 StudyResult 픽스처 (판단 보류 cap 테스트용)
function bigResult(): StudyResult {
  const responses = [];
  // 연령 15구간 × 2명(소표본) → observedButHeld 15개 생성
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 2; j++) {
      responses.push({
        persona: {
          id: `p${i}-${j}`,
          attrs: { 연령: `구간${i}` },
          weight: 1,
        },
        answer: "쓴다",
        choice: "쓴다",
      });
    }
  }
  return {
    responses,
    signal: "consensus" as const,
    dispersion: 0,
    bySegment: { 연령: {} },
  };
}

describe("renderFounderInsightReport — 코어 섹션", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
    choices: ["쓴다", "안쓴다"],
  });
  const md = renderFounderInsightReport(report);

  it("상단과 하단에 synthetic panel disclaimer가 있다", () => {
    const first = md.indexOf("synthetic panel");
    const last = md.lastIndexOf("synthetic panel");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(last).toBeGreaterThan(first);
  });
  it("코어 섹션 헤더가 존재한다", () => {
    for (const h of [
      "## 한 줄 요약",
      "## 전체 신호",
      "## 기회 세그먼트",
      "## 저항 세그먼트",
      "## 관심을 끄는 이유 / 거부 이유 (추정)",
      "## 위험한 가정",
      "## 신뢰도 카드",
    ]) {
      expect(md).toContain(h);
    }
  });
  it("판단 보류 세그먼트는 HELD_CAP개까지만 렌더하고 '외 N개'로 요약한다", () => {
    expect(report.observedButHeld.length).toBe(15);
    expect(md).toContain(`외 ${15 - HELD_CAP}개 (판단 보류)`);
  });
  it("전체 신호가 페르소나 수(표본)로 표기된다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain("표본 30명");
    expect(md).toContain("각 3회 응답");
  });
});

describe("renderFounderInsightReport — 참고 섹션 (약한 신호 / 우연 범위)", () => {
  function baseReport() {
    return generateFounderInsightReport(bigResult(), {
      question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
      choices: ["쓴다", "안쓴다"],
    });
  }

  it("weakSignals가 있으면 참고 섹션을 그리고 withinNoise는 한 줄로 나열한다", () => {
    const rep = baseReport();
    const template =
      rep.opportunitySegments[0] ??
      rep.resistanceSegments[0] ??
      rep.observedButHeld[0];
    rep.weakSignals = [
      {
        ...template,
        segmentLabel: "혼인=사별·이혼",
        positiveRatio: 1,
        personaCount: 3,
        caveats: ["표본이 작아 우연일 수 있음 (페르소나 3명 기준)"],
      },
    ];
    rep.withinNoise = [
      { ...template, segmentLabel: "성=여자" },
      { ...template, segmentLabel: "지역=수도권" },
    ];
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("## 참고 — 순위에 올리지 않은 차이");
    expect(md).toContain(
      "- 혼인=사별·이혼 (긍정 100.0% · 페르소나 3명) — 표본이 작아 우연일 수 있음",
    );
    expect(md).toContain("- 우연 범위 내(±10%p 미만): 성=여자, 지역=수도권");
  });

  it("weakSignals·withinNoise 모두 비면 참고 섹션이 없다", () => {
    const md = renderFounderInsightReport(baseReport());
    expect(md).not.toContain("## 참고 — 순위에 올리지 않은 차이");
  });

  it("lowRelevance 항목은 참고 섹션 맨 앞에 AI 판단 사유와 함께 나온다", () => {
    const rep = baseReport();
    const template =
      rep.opportunitySegments[0] ??
      rep.resistanceSegments[0] ??
      rep.observedButHeld[0];
    rep.lowRelevance = [
      {
        ...template,
        segmentLabel: "혼인=유배우",
        positiveRatio: 0.2,
        personaCount: 12,
        caveats: [
          "질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: 보안 수요와 무관)",
        ],
      },
    ];
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("## 참고 — 순위에 올리지 않은 차이");
    expect(md).toContain(
      "- 혼인=유배우 (긍정 20.0% · 페르소나 12명) — 질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: 보안 수요와 무관)",
    );
  });

  it("기회 세그먼트 0개면 유의성 문구로 안내한다", () => {
    const rep = baseReport();
    rep.opportunitySegments = [];
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("유의한 기회 세그먼트 없음");
  });

  it("세그먼트 헤더에 페르소나 수 각주가 붙는다", () => {
    // 실제로 유의한 기회 세그먼트가 생기는 결과 (minN 충족 + 전체 평균과 유의한 차이)
    const responses = [];
    for (let i = 0; i < 20; i++) {
      responses.push({
        persona: { id: `young-${i}`, attrs: { 연령: "20대" }, weight: 1 },
        answer: "쓴다",
        choice: "쓴다",
      });
    }
    for (let i = 0; i < 20; i++) {
      responses.push({
        persona: { id: `old-${i}`, attrs: { 연령: "60대" }, weight: 1 },
        answer: "안쓴다",
        choice: "안쓴다",
      });
    }
    const result: StudyResult = {
      responses,
      signal: "split",
      dispersion: 0.9,
      bySegment: { 연령: {} },
    };
    const rep = generateFounderInsightReport(result, {
      question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
      choices: ["쓴다", "안쓴다"],
    });
    expect(rep.opportunitySegments.length).toBeGreaterThan(0);
    const md = renderFounderInsightReport(rep);
    expect(md).toMatch(/### .+\(n=\d+ · 페르소나 \d+명 · 긍정/);
  });
});

describe("renderFounderInsightReport — 처방 섹션", () => {
  const report = generateFounderInsightReport(bigResult(), {
    question: "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?",
    choices: ["쓴다", "안쓴다"],
  });
  const md = renderFounderInsightReport(report);

  it("처방 섹션 헤더가 모두 존재한다", () => {
    for (const h of [
      "## 추천 인터뷰 대상",
      "## 인터뷰 질문 초안",
      "## 설문 문항 초안",
      "## 랜딩 메시지 테스트",
      "## 다음 7일",
    ]) {
      expect(md).toContain(h);
    }
  });
  it("AI 생성 초안 배너가 처방 섹션들에 나타난다", () => {
    const count = md.split("AI 생성 초안").length - 1;
    expect(count).toBeGreaterThanOrEqual(3); // ⑥ + 인터뷰/설문/랜딩 등
  });
});

describe("renderFounderInsightReport — 게이트 고지", () => {
  it("승격 세그먼트가 있으면 다중비교 무보정 고지가 렌더된다", () => {
    const responses = [];
    for (let i = 0; i < 15; i++)
      responses.push({
        persona: { id: `a${i}`, attrs: { 연령: "30대" }, weight: 1 },
        answer: "쓴다",
        choice: "쓴다",
      });
    for (let i = 0; i < 15; i++)
      responses.push({
        persona: { id: `b${i}`, attrs: { 연령: "60대" }, weight: 1 },
        answer: i < 3 ? "쓴다" : "안쓴다",
        choice: i < 3 ? "쓴다" : "안쓴다",
      });
    const report = generateFounderInsightReport(
      { responses, signal: "split", dispersion: 1, bySegment: { 연령: {} } },
      { question: "구독 의향?", choices: ["쓴다", "안쓴다"] },
    );
    expect(report.opportunitySegments.length).toBeGreaterThan(0);
    const md = renderFounderInsightReport(report);
    expect(md).toContain("다중비교 무보정");
  });

  it("승격 세그먼트가 없으면 다중비교 고지도 없다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    expect(renderFounderInsightReport(report)).not.toContain("다중비교");
  });
});

describe("renderFounderInsightReport — 출처 계층화", () => {
  it("출처에 통계청 census 근거와 Nemotron 서사가 계층화되어 나온다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain("## 출처");
    expect(md).toContain("통계청 인구총조사 2024");
    expect(md).toContain("DT_1IN1509");
    expect(md).toContain("데이터 근거");
  });
});

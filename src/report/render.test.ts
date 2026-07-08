import { describe, expect, it } from "vitest";
import { pct } from "../format.js";
import type { StudyResult } from "../types.js";
import { generateFounderInsightReport } from "./generate.js";
import { HELD_CAP, renderFounderInsightReport } from "./render.js";
import { bigResult } from "./test-fixtures.js";

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
      "## 기술 상세 — 신뢰도 4층",
    ]) {
      expect(md).toContain(h);
    }
  });
  it("판단 보류 세그먼트는 HELD_CAP개까지만 렌더하고 '외 N개'로 요약한다", () => {
    expect(report.observedButHeld.length).toBe(15);
    expect(md).toContain(`외 ${15 - HELD_CAP}개 (판단 보류)`);
  });
  it("전체 신호가 페르소나 수(표본)로 표기된다 (repeats=1이면 각 N회 생략)", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain("표본 30명");
    expect(md).not.toContain("각 3회 응답");
    expect(md).not.toContain("각 1회 응답");
  });
  it("반복 응답이 있으면 각 N회 응답(총 M)을 유도해 표기한다", () => {
    // 페르소나 3명 × 3응답 = repeats 3, panelSize 3, n 9
    const responses = [];
    for (let p = 0; p < 3; p++)
      for (let k = 0; k < 3; k++)
        responses.push({
          persona: { id: `p${p}`, attrs: { 연령: "30대" }, weight: 1 },
          answer: "쓴다",
          choice: "쓴다",
        });
    const report = generateFounderInsightReport(
      { responses, signal: "consensus" as const, dispersion: 0, bySegment: {} },
      { question: "q?", choices: ["쓴다", "안쓴다"] },
    );
    const md = renderFounderInsightReport(report);
    expect(md).toContain("표본 3명 · 각 3회 응답(총 9)");
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
    expect(md).toContain("## 확실한 것만 추렸습니다");
    expect(md).toContain(
      "- 혼인=사별·이혼 (긍정 100.0% · 페르소나 3명) — 표본이 작아 우연일 수 있음",
    );
    expect(md).toContain(
      "- 그 외 2개 차이는 우연 범위(±10%p 미만) — 표본 대비 작아 판단 보류",
    );
  });

  it("weakSignals·withinNoise 모두 비면 참고 섹션이 없다", () => {
    const md = renderFounderInsightReport(baseReport());
    expect(md).not.toContain("## 확실한 것만 추렸습니다");
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
    expect(md).toContain("## 확실한 것만 추렸습니다");
    expect(md).toContain(
      "- 혼인=유배우 (긍정 20.0% · 페르소나 12명) — 질문과 관련성이 낮아 보여 순위에서 제외 (AI 판단: 보안 수요와 무관)",
    );
  });

  it("기회 세그먼트 0개면 유의성 문구로 안내한다", () => {
    const rep = baseReport();
    rep.opportunitySegments = [];
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("세그먼트로 쪼개 보려면 표본을 키우세요");
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
  it("초안 배너가 정체·용도·경고를 모두 담고 처방 섹션들에 나타난다", () => {
    const count = md.split("규칙 기반으로 파생된 초안").length - 1;
    expect(count).toBeGreaterThanOrEqual(3); // 관심/거부 + 인터뷰/설문/랜딩 등
    // 정체(LLM 아님) · 용도(출발점) · 경고(교체하세요)를 모두 유지한다
    expect(md).toContain("LLM 아님");
    expect(md).toContain("출발점");
    expect(md).toContain("실제 고객의 문장으로 교체하세요");
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

describe("renderFounderInsightReport — v2 재배치·리프레이밍", () => {
  it("관심/거부 이유가 기회 세그먼트보다 위에 온다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "구독?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md.indexOf("## 관심을 끄는 이유")).toBeLessThan(
      md.indexOf("## 기회 세그먼트"),
    );
  });
  it("세그먼트 없음은 표본 키우기 안내로 리프레이밍된다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain("세그먼트로 쪼개 보려면 표본을 키우세요");
    expect(md).not.toContain("유의한 기회 세그먼트 없음");
  });
  it("신뢰도 카드는 출처 직전(부록)에 온다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md.indexOf("신뢰도 4층")).toBeGreaterThan(md.indexOf("## 다음 7일"));
  });

  it("한 줄 요약에서 '할 수 있는 것'이 '못 하는 것'보다 먼저 온다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    const can = md.indexOf("이 리포트로 할 수 있는 것:");
    const cannot = md.indexOf("아직 못 하는 것:");
    expect(can).toBeGreaterThanOrEqual(0);
    expect(cannot).toBeGreaterThan(can);
    // marketJudgment 실제 값이 그대로 실린다
    expect(md).toContain(report.confidenceCard.marketJudgment.whatThisAllows);
    expect(md).toContain(
      report.confidenceCard.marketJudgment.whatThisDoesNotAllow,
    );
  });

  it("승격해도 정직성 신호(doNotTrustYet)와 부록 신뢰도 표는 남는다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain("아직 믿으면 안 되는 것:");
    expect(md).toContain(report.executiveSummary.doNotTrustYet);
    expect(md).toContain("## 기술 상세 — 신뢰도 4층");
  });
});

describe("renderFounderInsightReport — 배너 basis 구분 + 신뢰도 평이화", () => {
  it("drivers가 llm 기반이면 실측 요약 배너, heuristic이면 초안 배너", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    // heuristic 기본
    expect(renderFounderInsightReport(base)).toContain(
      "규칙 기반으로 파생된 초안",
    );
    // llm으로 바꾼 사본
    const llm = {
      ...base,
      keyDrivers: base.keyDrivers.map((d) => ({ ...d, basis: "llm" as const })),
    };
    const md = renderFounderInsightReport(llm);
    expect(md).toContain("실제 응답 이유를 종합한 AI 요약");
  });
  it("신뢰도 4층 표에 생활 언어가 병기된다", () => {
    const md = renderFounderInsightReport(
      generateFounderInsightReport(bigResult(), {
        question: "q?",
        choices: ["쓴다", "안쓴다"],
      }),
    );
    expect(md).toContain("실측 일치"); // matched 병기 예시 — 실제 표 위 범례에 등장
  });

  it("인터뷰 질문이 llm 기반이면 실측 도출 배너, heuristic이면 초안 배너", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    expect(base.interviewQuestions.length).toBeGreaterThan(0);

    // heuristic 기본
    const heuristicMd = renderFounderInsightReport(base);
    expect(heuristicMd).not.toContain("패널이 실제로 답한 이유에서 도출");

    // 전부 llm이면 실측 배너
    const llm = {
      ...base,
      interviewQuestions: base.interviewQuestions.map((q) => ({
        ...q,
        basis: "llm" as const,
      })),
    };
    expect(renderFounderInsightReport(llm)).toContain(
      "패널이 실제로 답한 이유에서 도출",
    );
  });

  it("인터뷰 질문이 하나라도 heuristic이면 초안 배너를 유지한다", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const mixed = {
      ...base,
      interviewQuestions: base.interviewQuestions.map((q, i) => ({
        ...q,
        basis: i === 0 ? ("heuristic" as const) : ("llm" as const),
      })),
    };
    expect(renderFounderInsightReport(mixed)).not.toContain(
      "패널이 실제로 답한 이유에서 도출",
    );
  });

  it("설문·랜딩·추천 인터뷰는 basis와 무관하게 초안 배너를 유지한다", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const allLlm = {
      ...base,
      recommendedInterviews: base.recommendedInterviews.map((t) => ({
        ...t,
        basis: "llm" as const,
      })),
      surveyDraft: base.surveyDraft.map((q) => ({
        ...q,
        basis: "llm" as const,
      })),
      landingPageMessageTests: base.landingPageMessageTests.map((t) => ({
        ...t,
        basis: "llm" as const,
      })),
    };
    const md = renderFounderInsightReport(allLlm);
    // 세 섹션 모두 초안 배너 유지 (실제로 heuristic 생성물이므로)
    const count = md.split("규칙 기반으로 파생된 초안").length - 1;
    expect(count).toBeGreaterThanOrEqual(3);
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

describe("renderFounderInsightReport — 근거 앵커", () => {
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
    {
      responses,
      signal: "split" as const,
      dispersion: 0.5,
      bySegment: { 연령: {} },
    },
    { question: "q?", choices: ["쓴다", "안쓴다"] },
  );
  const md = renderFounderInsightReport(report);

  it("추천 인터뷰에 근거 앵커(긍정률·신뢰도)가 붙는다", () => {
    // prescriptions.ts:149 `targetLabel: s.segmentLabel` — 조인은 반드시 성립한다.
    // ⚠️ 조건부 단언(if (anchored) {...})을 쓰지 말 것: 조인이 깨지면 테스트가 조용히 통과한다.
    expect(report.opportunitySegments.length).toBeGreaterThan(0);
    const seg = report.opportunitySegments[0];
    expect(
      report.recommendedInterviews.some(
        (t) => t.targetLabel === seg.segmentLabel,
      ),
    ).toBe(true);
    expect(md).toContain(
      `- ← 기회 세그먼트: 긍정 ${pct(seg.positiveRatio, 1)} · 신뢰도 ${seg.confidence}`,
    );
  });

  it("조인되지 않는 대상엔 앵커를 붙이지 않는다 (없는 근거 금지)", () => {
    const fake = {
      ...report,
      recommendedInterviews: report.recommendedInterviews.map((t) => ({
        ...t,
        targetLabel: "존재하지 않는 세그먼트",
      })),
      landingPageMessageTests: report.landingPageMessageTests.map((t) => ({
        ...t,
        targetSegment: "존재하지 않는 세그먼트",
      })),
    };
    const fakeMd = renderFounderInsightReport(fake);
    expect(fakeMd).not.toContain("← 기회 세그먼트:");
    expect(fakeMd).not.toContain("← 저항 세그먼트:");
  });

  it("인터뷰 질문·설문 섹션엔 앵커가 없다", () => {
    const qIdx = md.indexOf("## 인터뷰 질문 초안");
    const sEnd = md.indexOf("## 랜딩 메시지 테스트");
    const between = md.slice(qIdx, sEnd);
    expect(between).not.toContain("← 기회 세그먼트:");
    expect(between).not.toContain("← 저항 세그먼트:");
  });
});

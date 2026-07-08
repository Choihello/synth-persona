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

  it("unanimous면 세그먼트 0개 문구가 '인구 축에서 차이 없음'으로 바뀐다", () => {
    const rep = baseReport(); // bigResult() → unanimous
    rep.opportunitySegments = [];
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("10%p 이상 벌어지는 차이가 없었습니다");
    expect(md).toContain("전체 비율을 세그먼트 근거로 쓰지 마세요");
    // 거짓 문장 제거 확인
    expect(md).not.toContain("전체 방향(위)이 핵심 신호입니다");
    expect(md).not.toContain("세그먼트로 쪼개 보려면 표본을 키우세요");
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
  it("세그먼트 없음은 범위 밖 안내로 리프레이밍된다 (표본 탓으로 돌리지 않음)", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain("10%p 이상 벌어지는 차이가 없었습니다");
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

  it("한 줄 요약에서 '할 수 있는 것'이 '믿으면 안 되는 것'보다 먼저 오고, 중복 줄은 없다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    const can = md.indexOf("이 리포트로 할 수 있는 것:");
    const cannot = md.indexOf("아직 믿으면 안 되는 것:");
    expect(can).toBeGreaterThanOrEqual(0);
    expect(cannot).toBeGreaterThan(can);
    // marketJudgment 실제 값이 그대로 실린다
    expect(md).toContain(report.confidenceCard.marketJudgment.whatThisAllows);
    // 회귀 가드: whatThisDoesNotAllow와 doNotTrustYet은 같은 문자열이므로
    // 별도 "아직 못 하는 것:" 줄로 중복 렌더링되어서는 안 된다
    expect(md).not.toContain("아직 못 하는 것:");
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

describe("renderFounderInsightReport — 범위 밖 배너", () => {
  it("unanimous면 범위 밖 배너가 한 줄 요약 위에 온다", () => {
    // bigResult()는 30명 전원 "쓴다" → 단일 버킷 → unanimous
    const md = renderFounderInsightReport(
      generateFounderInsightReport(bigResult(), {
        question: "q?",
        choices: ["쓴다", "안쓴다"],
      }),
    );
    expect(md).toContain("이 질문은 이 도구의 범위 밖입니다");
    expect(md).toContain("언어모델의 사전 판단");
    const banner = md.indexOf("이 질문은 이 도구의 범위 밖입니다");
    const summary = md.indexOf("## 한 줄 요약");
    expect(banner).toBeGreaterThan(summary);
    expect(banner).toBeLessThan(md.indexOf("## 전체 신호"));
  });

  it("segmented면 배너가 없다", () => {
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
    expect(report.opportunitySegments.length).toBeGreaterThan(0);
    const md = renderFounderInsightReport(report);
    expect(md).not.toContain("이 질문은 이 도구의 범위 밖입니다");
    expect(md).not.toContain("인구 축에서 갈리지 않았습니다");
  });

  it("segmented가 아니면 '할 수 있는 것'에 보정 문구가 붙는다", () => {
    const md = renderFounderInsightReport(
      generateFounderInsightReport(bigResult(), {
        question: "q?",
        choices: ["쓴다", "안쓴다"],
      }),
    );
    expect(md).toContain(
      "이 리포트로 할 수 있는 것: 방향 가설 탐색 · 인터뷰 대상 좁히기 — 단, 이 질문에선 세그먼트가 갈리지 않아 인터뷰 대상을 좁힐 수 없습니다.",
    );
  });

  it("정직성 신호는 배너와 무관하게 남는다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain("아직 믿으면 안 되는 것:");
    expect(md).toContain(report.executiveSummary.doNotTrustYet);
    expect(md).toContain("## 기술 상세 — 신뢰도 4층");
  });

  it("no-effect면 '인구 축에서 갈리지 않았습니다' 배너가 온다", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    // 승격 0 · weakSignals 0 · lowRelevance 0 · observedButHeld 0(!) · 버킷 2개 → no-effect
    // observedButHeld를 base(bigResult, 전량 minN 미만이라 15개 보류)에서 물려받으면
    // "검정조차 못 한 세그먼트가 있다" = underpowered가 정답이 된다 — 그 상태는 다른
    // 테스트(§C1 회귀: '세그먼트로 쪼개 보려면 표본을 키우세요')가 커버한다. 여기서는
    // no-effect를 만들기 위해 observedButHeld도 명시적으로 비운다.
    const rep = {
      ...base,
      opportunitySegments: [],
      resistanceSegments: [],
      weakSignals: [],
      observedButHeld: [],
      lowRelevance: [],
      overallSignal: {
        ...base.overallSignal,
        distribution: { 쓴다: 20, 안쓴다: 10 },
      },
    };
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("인구 축에서 갈리지 않았습니다");
    expect(md).toContain("10%p 이상의 차이가 없었습니다");
    expect(md).not.toContain("이 질문은 이 도구의 범위 밖입니다");
  });

  it("unanimous면 전체 신호 라벨이 '응답 전부 동일'로 바뀐다 (signal 필드는 무수정)", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    expect(report.overallSignal.signal).toBe("consensus"); // 필드는 그대로
    const md = renderFounderInsightReport(report);
    expect(md).toContain("⚪ 응답 전부 동일");
    expect(md).not.toContain("🟢 consensus(합의)");
    // og-stats 파서 소스는 보존
    expect(md).toMatch(/^- .*?· 응답 분포: /m);
  });

  it("unanimous가 아니면 기존 consensus/split 라벨을 유지한다", () => {
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
    const md = renderFounderInsightReport(
      generateFounderInsightReport(
        {
          responses,
          signal: "split" as const,
          dispersion: 0.5,
          bySegment: { 연령: {} },
        },
        { question: "q?", choices: ["쓴다", "안쓴다"] },
      ),
    );
    expect(md).not.toContain("응답 전부 동일");
    expect(md).toMatch(/- (🟢 consensus\(합의\)|🔴 split\(분열\))/);
  });

  it("unanimous면 헤드라인이 '합의' 대신 '표본 전원이 같은 선택'으로 바뀐다", () => {
    const md = renderFounderInsightReport(
      generateFounderInsightReport(bigResult(), {
        question: "q?",
        choices: ["쓴다", "안쓴다"],
      }),
    );
    expect(md).toContain("표본 전원이 같은 선택을 했습니다");
    expect(md).not.toContain("전체적으로 비교적 합의된 반응입니다");
  });

  it("unanimous면 '이번 주 행동' 바닥글에 원문 + 보정 문구가 함께 붙는다", () => {
    const report = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const md = renderFounderInsightReport(report);
    expect(md).toContain(report.executiveSummary.thisWeekAction);
    expect(md).toContain("인구 축 밖의 변수");
  });

  it("segmented면 헤드라인이 원문 그대로고 '이번 주 행동'에 보정 문구가 없다", () => {
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
    expect(report.opportunitySegments.length).toBeGreaterThan(0);
    const md = renderFounderInsightReport(report);
    expect(md).toContain(report.executiveSummary.headline);
    expect(md).not.toContain("인구 축 밖의 변수");
  });

  it("underpowered면 '이번 주 행동'에 보정 문구가 없다 (표본을 키우면 갈릴 수 있음)", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const rep = {
      ...base,
      opportunitySegments: [],
      resistanceSegments: [],
      weakSignals: [base.observedButHeld[0] ?? ({} as never)],
      overallSignal: {
        ...base.overallSignal,
        distribution: { 쓴다: 20, 안쓴다: 10 },
      },
    };
    const md = renderFounderInsightReport(rep);
    expect(md).toContain(rep.executiveSummary.thisWeekAction);
    expect(md).not.toContain("인구 축 밖의 변수");
  });
});

describe("renderFounderInsightReport — 제외된 축", () => {
  it("skippedDims가 있으면 제외 사실과 이유를 밝힌다", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    const rep = {
      ...base,
      appendix: { ...base.appendix, skippedDims: ["지역"] },
    };
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("비교에서 제외된 축: 지역");
    expect(md).toContain("이 패널에서 값이 하나뿐이라 대조군이 없습니다");
  });

  it("skippedDims가 비면 그 문구가 없다", () => {
    const md = renderFounderInsightReport(
      generateFounderInsightReport(bigResult(), {
        question: "q?",
        choices: ["쓴다", "안쓴다"],
      }),
    );
    expect(md).not.toContain("비교에서 제외된 축");
  });
});

describe("renderFounderInsightReport — underpowered는 표본 문구를 유지한다", () => {
  it("weakSignals가 있고 승격이 0이면 기존 표본 안내가 그대로 나온다", () => {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    // 승격 0 · weakSignals 1 · 응답은 갈림 → underpowered
    const rep = {
      ...base,
      opportunitySegments: [],
      resistanceSegments: [],
      weakSignals: [base.observedButHeld[0] ?? ({} as never)],
      overallSignal: {
        ...base.overallSignal,
        distribution: { 쓴다: 20, 안쓴다: 10 },
      },
    };
    const md = renderFounderInsightReport(rep);
    expect(md).toContain("세그먼트로 쪼개 보려면 표본을 키우세요");
    expect(md).not.toContain("이 질문은 이 도구의 범위 밖입니다");
    expect(md).not.toContain("인구 축에서 갈리지 않았습니다");
  });
});

describe("renderFounderInsightReport — 최종 리뷰 회귀 (C1/C2/C3)", () => {
  it("C1: 100%p로 갈리지만 양쪽 다 minN 미만이면 no-effect가 아니라 underpowered다", () => {
    // 실제 파이프라인으로 재현: 연령=20대 5명 전원 긍정, 연령=60대 5명 전원 부정.
    // 두 버킷 모두 total=5 < DEFAULT_MIN_N(8)이라 z-검정 이전에 early continue —
    // weakSignals에는 절대 못 들어가고 observedButHeld로만 보존된다.
    const responses = [];
    for (let i = 0; i < 5; i++)
      responses.push({
        persona: { id: `y${i}`, attrs: { 연령: "20대" }, weight: 1 },
        answer: "쓴다",
        choice: "쓴다",
      });
    for (let i = 0; i < 5; i++)
      responses.push({
        persona: { id: `o${i}`, attrs: { 연령: "60대" }, weight: 1 },
        answer: "안쓴다",
        choice: "안쓴다",
      });
    const report = generateFounderInsightReport(
      {
        responses,
        signal: "split" as const,
        dispersion: 1,
        bySegment: { 연령: {} },
      },
      { question: "q?", choices: ["쓴다", "안쓴다"] },
    );
    expect(report.observedButHeld.length).toBeGreaterThan(0);
    expect(report.weakSignals.length).toBe(0);
    expect(report.opportunitySegments.length).toBe(0);
    expect(report.resistanceSegments.length).toBe(0);

    const md = renderFounderInsightReport(report);
    expect(md).toContain("세그먼트로 쪼개 보려면 표본을 키우세요");
    expect(md).not.toContain("인구 축에서 갈리지 않았습니다");
    expect(md).not.toContain("10%p 이상 벌어지는 차이가 없었습니다");
  });

  it("C3: 한 방향만 승격되고 반대 방향이 비면, 빈 섹션은 전 축에 대한 주장을 하지 않는다", () => {
    // 30대 20명 전원 긍정, 40대 20명 중 절반만 긍정 → 30대만 opportunity로 승격되고
    // resistance는 비어 있을 수 있는 분포. 그래도 resistanceSegments를 빈 배열로
    // 고정해 "승격 있음 + 반대 방향 비었음"을 확실히 재현한다.
    const responses = [];
    for (let i = 0; i < 20; i++)
      responses.push({
        persona: { id: `a${i}`, attrs: { 연령: "30대" }, weight: 1 },
        answer: "쓴다",
        choice: "쓴다",
      });
    for (let i = 0; i < 20; i++)
      responses.push({
        persona: { id: `b${i}`, attrs: { 연령: "40대" }, weight: 1 },
        answer: i < 10 ? "쓴다" : "안쓴다",
        choice: i < 10 ? "쓴다" : "안쓴다",
      });
    const base = generateFounderInsightReport(
      {
        responses,
        signal: "split" as const,
        dispersion: 0.6,
        bySegment: { 연령: {} },
      },
      { question: "q?", choices: ["쓴다", "안쓴다"] },
    );
    expect(base.opportunitySegments.length).toBeGreaterThan(0);
    const report = { ...base, resistanceSegments: [] };

    const md = renderFounderInsightReport(report);
    expect(md).toContain(
      "이 방향에서는 순위에 올릴 만큼 뚜렷한 세그먼트가 없었습니다",
    );
    expect(md).not.toContain("10%p 이상 벌어지는 차이가 없었습니다");
  });
});

describe("renderFounderInsightReport — 패널 스크리너 표기", () => {
  function withPanelLabel(label?: string) {
    const base = generateFounderInsightReport(bigResult(), {
      question: "q?",
      choices: ["쓴다", "안쓴다"],
    });
    return {
      ...base,
      appendix: {
        ...base.appendix,
        options: { ...base.appendix.options, panelLabel: label },
      },
    };
  }

  it("panelLabel이 있으면 상단에 대상 모집단과 순환논증 경고가 온다", () => {
    const md = renderFounderInsightReport(withPanelLabel("20~39세 · 수도권"));
    expect(md).toContain(
      "이 리포트는 **20~39세 · 수도권** 인구만 대상으로 합니다.",
    );
    expect(md).toContain("이 집단이 내 타깃이라는 가정은 검증되지 않았습니다");
    expect(md).toContain("스크리너 없이 한 번 더 돌리세요");
  });

  it("panelLabel이 있으면 전체 신호 표본 줄에 대상이 접미로 붙는다", () => {
    const md = renderFounderInsightReport(withPanelLabel("20~39세 · 수도권"));
    expect(md).toMatch(/^- 표본 \d+명.*· 대상: 20~39세 · 수도권/m);
  });

  it("panelLabel이 없으면 대상·경고가 어디에도 없다", () => {
    const md = renderFounderInsightReport(withPanelLabel(undefined));
    expect(md).not.toContain("인구만 대상으로 합니다");
    expect(md).not.toContain("이 집단이 내 타깃이라는 가정은");
    expect(md).not.toContain("· 대상:");
  });

  it("panelLabel이 붙어도 og-stats 파서 소스 형식은 그대로다", () => {
    const md = renderFounderInsightReport(withPanelLabel("20~39세 · 수도권"));
    expect(md).toMatch(/^- .*?· 응답 분포: /m);
  });
});

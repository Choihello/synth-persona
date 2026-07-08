/**
 * 쉬운 요약 카드 ("한눈에 보기") — 통계 문외한용 생활 언어 요약을
 * 구조화 리포트에서 결정적으로 생성한다 (LLM 없음, md 재파싱 없음).
 * 스펙: docs/superpowers/specs/2026-07-05-easy-summary-design.md
 */

import { scopeVerdict } from "../src/report/scope.js";
import type { FounderInsightReport } from "../src/report/types.js";

const SEX_MAP: Record<string, string> = { 여자: "여성", 남자: "남성" };

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** 판정 문장 — split이 비율보다 우선. */
function verdictSentence(signal: "consensus" | "split", r: number): string {
  if (signal === "split" || (r >= 0.4 && r < 0.6)) return "반응이 갈렸어요";
  if (r >= 0.8) return "반응이 뚜렷하게 긍정적이에요";
  if (r >= 0.6) return "긍정에 가까운 반응이에요";
  if (r >= 0.2) return "부정에 가까운 반응이에요";
  return "반응이 뚜렷하게 부정적이에요";
}

/** "차원=값" 세그먼트 라벨 → 생활 언어. 모르는 차원은 원문 그대로. */
export function humanizeSegmentLabel(label: string): string {
  const eq = label.indexOf("=");
  if (eq < 0) return label;
  const dim = label.slice(0, eq);
  const val = label.slice(eq + 1);
  switch (dim) {
    case "연령":
    case "혼인":
      return val;
    case "지역":
      return `${val} 거주자`;
    case "성":
      return SEX_MAP[val] ?? val;
    case "가구원수": {
      const m = val.match(/(\d+)명/);
      return m ? `${m[1]}인 가구` : val;
    }
    default:
      return label;
  }
}

/**
 * 쉬운 요약 카드 HTML. marked가 블록 HTML로 통과시킨다.
 * total=0이면 "" (주입 생략). "응답 분포:" 문자열 금지 — og-stats 파서 보호.
 */
/**
 * @param panelSize "N명 중 M명"의 N — 실제 합성 패널(페르소나) 수. 카드가 표본
 *   크기를 정직하게 드러내도록 호출부가 넘긴다. 미지정 시 10으로 정규화(폴백).
 */
export function easySummaryHTML(
  report: FounderInsightReport,
  positiveChoice: string,
  panelSize = 10,
): string {
  const dist = report.overallSignal.distribution;
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  if (total === 0) return "";
  const r = (dist[positiveChoice] ?? 0) / total;
  const ps = report.overallSignal.panelSize;
  const pp = report.overallSignal.panelPositive;
  const denom = ps ?? panelSize;
  const positiveCount = pp ?? Math.round(r * panelSize);
  // 스크리너를 걸면 "60명"이 전 인구 60명이 아니다. 카드가 그 사실을 밝힌다.
  const panelLabel = report.appendix.options.panelLabel;
  const denomPrefix = panelLabel ? `${esc(panelLabel)} ` : "";
  // 세그먼트가 갈리지 않았으면 시장 판정을 주장하지 않는다 — 판정은 scope.ts 한 곳에서만.
  const scope = scopeVerdict(report);
  const verdict =
    scope === "unanimous"
      ? "이 질문은 이 도구의 범위 밖이에요"
      : scope === "no-effect"
        ? "인구 축에서는 갈리지 않았어요"
        : verdictSentence(report.overallSignal.signal, r);

  const opp = report.opportunitySegments[0];
  const res = report.resistanceSegments[0];
  const oppLabel = opp ? humanizeSegmentLabel(opp.segmentLabel) : undefined;
  const resLabel = res ? humanizeSegmentLabel(res.segmentLabel) : undefined;

  const who: string[] = [];
  if (oppLabel) who.push(`특히 ${esc(oppLabel)}의 반응이 가장 좋았어요.`);
  if (resLabel) who.push(`반대로 ${esc(resLabel)}는 망설였어요.`);
  const whoLine =
    who.length > 0 ? who.join(" ") : "세그먼트 간 뚜렷한 차이는 없었어요.";

  const next = oppLabel
    ? `다음 할 일: ${esc(oppLabel)} 실제 고객 5~8명에게 직접 물어보고, 이 반응이 진짜인지 확인해 보세요.`
    : "다음 할 일: 잠재 고객 5~8명에게 직접 물어보며 확인해 보세요.";

  const consistency = report.confidenceCard.responseConsistency.label;
  const trustExtra =
    consistency === "high"
      ? " 그래도 응답끼리는 꽤 일관적이었어요."
      : consistency === "low"
        ? " 응답이 흔들려서 더 조심해서 봐야 해요."
        : "";

  return `<section class="easy-summary" aria-label="한눈에 보기">
<p class="easy-kicker">한눈에 보기</p>
<p class="easy-verdict">${verdict}</p>
<p class="easy-count"><span class="easy-count-num">${denomPrefix}${denom}명 중 ${positiveCount}명</span>이 "${esc(positiveChoice)}" <span class="easy-basis">가상 응답 ${report.overallSignal.n}개 기준</span></p>
<p class="easy-who">${whoLine}</p>
<p class="easy-next">${next}</p>
<p class="easy-trust">진짜 사람이 아니라 AI가 인구 구성을 흉내 내 답한 결과예요 — 방향을 잡는 참고로만 쓰세요.${trustExtra}</p>
</section>`;
}

/**
 * 리포트용 인라인 SVG 차트 2종 (dataviz 스킬 기준).
 * - 팔레트: 긍정/부정은 polarity → diverging pair(blue #2a78d6 / red #e34948),
 *   크림 서피스(#faf6ef) 대비 검증기 ALL PASS (2026-07-04).
 * - 마크: 얇은 바, 데이터 끝 4px 라운드, 세그먼트 사이 2px 서피스 갭, 직접 라벨.
 * - 텍스트는 잉크 토큰(#1f1d1a / #6b675e) — 시리즈 색을 입히지 않는다.
 */

const POSITIVE = "#2a78d6";
const NEGATIVE = "#e34948";
const INK = "#1f1d1a";
const INK_MUTED = "#6b675e";
const FONT = 'font-family="ui-sans-serif, system-ui, sans-serif"';

function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

/** 전체 응답 분포 — 긍정 vs 나머지 100% 스택 수평 바 + 직접 라벨. */
export function shareBarSVG(
  distribution: Record<string, number>,
  positiveChoice: string,
  panel?: { panelSize: number; panelPositive: number },
): string {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return "";
  const pos = distribution[positiveChoice] ?? 0;
  const neg = total - pos;
  const posPct = Math.round((100 * pos) / total);
  const negPct = 100 - posPct;
  const W = 640;
  const H = 64;
  const barY = 26;
  const barH = 18;
  const posW = Math.round((W * pos) / total);
  const negLabel = Object.keys(distribution)
    .filter((k) => k !== positiveChoice)
    .join("·");
  // 하단 라벨은 페르소나 수 우선(표본 60명 단위), panel 없으면 응답 수.
  const labelPos = panel ? panel.panelPositive : pos;
  const labelNeg = panel ? panel.panelSize - panel.panelPositive : neg;
  // 반복 응답 수는 응답수/표본으로 유도(하드코딩 금지 — repeats≠3도 정확).
  const repeats =
    panel && panel.panelSize > 0 ? Math.round(total / panel.panelSize) : 0;
  const title = panel
    ? repeats >= 2
      ? `전체 반응 · 표본 ${panel.panelSize}명 (각 ${repeats}회 응답, 총 ${total})`
      : `전체 반응 · 표본 ${panel.panelSize}명`
    : `전체 응답 분포 (n=${total})`;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="전체 응답 분포: ${esc(positiveChoice)} ${posPct}%, ${esc(negLabel)} ${negPct}%" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="14" ${FONT} font-size="12" fill="${INK_MUTED}">${title}</text>
  <rect x="0" y="${barY}" width="${Math.max(posW - 1, 0)}" height="${barH}" rx="4" fill="${POSITIVE}"/>
  <rect x="${posW + 1}" y="${barY}" width="${Math.max(W - posW - 1, 0)}" height="${barH}" rx="4" fill="${NEGATIVE}"/>
  <text x="0" y="${barY + barH + 16}" ${FONT} font-size="12" fill="${INK}">${esc(positiveChoice)} ${posPct}% (${labelPos}명)</text>
  <text x="${W}" y="${barY + barH + 16}" ${FONT} font-size="12" fill="${INK}" text-anchor="end">${esc(negLabel)} ${negPct}% (${labelNeg}명)</text>
</svg>`;
}

export interface SegmentDatum {
  label: string;
  ratio: number; // 0~1 긍정 비율
  n: number;
}

/** 세그먼트별 긍정률 수평 바 (단일 측정값 → 단일 색) + 전체 평균 기준선. */
export function segmentBarsSVG(
  segments: SegmentDatum[],
  globalRatio: number,
): string {
  if (segments.length === 0) return "";
  const rows = [...segments].sort((a, b) => b.ratio - a.ratio).slice(0, 8);
  const W = 640;
  const labelW = 190;
  const valueW = 96;
  const plotW = W - labelW - valueW;
  const rowH = 26;
  const barH = 12;
  const top = 22;
  const H = top + rows.length * rowH + 22;
  const gx = labelW + plotW * Math.min(Math.max(globalRatio, 0), 1);
  const gPct = Math.round(globalRatio * 100);

  const bars = rows
    .map((r, i) => {
      const y = top + i * rowH;
      const w = Math.max(Math.round(plotW * Math.min(r.ratio, 1)), 2);
      const pct = Math.round(r.ratio * 100);
      return `  <text x="${labelW - 8}" y="${y + barH - 1}" ${FONT} font-size="12" fill="${INK}" text-anchor="end">${esc(r.label)}</text>
  <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${POSITIVE}"/>
  <text x="${labelW + w + 6}" y="${y + barH - 1}" ${FONT} font-size="12" fill="${INK}">${pct}% <tspan fill="${INK_MUTED}">n=${r.n}</tspan></text>`;
    })
    .join("\n");

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="세그먼트별 긍정 비율 (전체 평균 ${gPct}%)" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="12" ${FONT} font-size="12" fill="${INK_MUTED}">세그먼트별 긍정 비율</text>
${bars}
  <line x1="${gx}" y1="${top - 6}" x2="${gx}" y2="${top + rows.length * rowH - 8}" stroke="${INK_MUTED}" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="${Math.min(gx + 4, W - 110)}" y="${top + rows.length * rowH + 8}" ${FONT} font-size="11" fill="${INK_MUTED}">전체 평균 ${gPct}%</text>
</svg>`;
}

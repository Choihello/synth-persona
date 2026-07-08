/**
 * OG 이미지용 핵심 수치 추출 — 렌더된 리포트 마크다운의 "전체 신호" 섹션에서
 * 응답 분포와 n을 파싱한다. (row에 구조화 수치가 없어 md가 유일한 소스)
 * 의존 형식: render.ts의 `응답 분포: ${formatDistribution(...)}` 줄 +
 * `- n=${n}` 또는 `- 표본 N명 · 각 R회 응답(총 ${n})` 줄.
 */
export interface OgStats {
  n: number;
  /** 렌더 순서 보존 — 첫 항목이 positiveChoice(= choices[0]) */
  dist: [string, number][];
}

const OVERALL_HEADER = "## 전체 신호";

/** `## 전체 신호` 블록만 잘라낸다. 헤더가 없으면 전체를 반환(구 리포트 호환). */
function overallSignalScope(md: string): string {
  const start = md.indexOf(OVERALL_HEADER);
  if (start < 0) return md;
  const rest = md.slice(start + OVERALL_HEADER.length);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

export function extractOgStats(md: string): OgStats | undefined {
  // 섹션 스코프 한정 — 앞선 섹션의 불릿이 첫 매치를 가로채지 못하게 한다.
  const scope = overallSignalScope(md);
  // 불릿 줄만 매칭 — 차트 SVG의 aria-label("전체 응답 분포: 찬성 87%…")을 피한다
  const distLine = scope.match(/^- .*?· 응답 분포: ([^\n]+)/m);
  if (!distLine) return undefined;

  const dist: [string, number][] = [];
  for (const part of distLine[1].split(", ")) {
    const eq = part.lastIndexOf("=");
    if (eq <= 0) continue;
    const count = Number(part.slice(eq + 1).trim());
    if (!Number.isFinite(count)) continue;
    dist.push([part.slice(0, eq).trim(), count]);
  }
  if (dist.length === 0) return undefined;

  const nLine =
    scope.match(/^- n=(\d+)/m) ??
    scope.match(/^- 표본 \d+명 · 각 \d+회 응답\(총 (\d+)\)/m);
  const n = nLine ? Number(nLine[1]) : dist.reduce((sum, [, c]) => sum + c, 0);
  return { n, dist };
}

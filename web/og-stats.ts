/**
 * OG 이미지용 핵심 수치 추출 — 렌더된 리포트 마크다운의 "전체 신호" 섹션에서
 * 응답 분포와 n을 파싱한다. (row에 구조화 수치가 없어 md가 유일한 소스)
 * 의존 형식: render.ts의 `응답 분포: ${formatDistribution(...)}` / `- n=${n}` 줄.
 */
export interface OgStats {
  n: number;
  /** 렌더 순서 보존 — 첫 항목이 positiveChoice(= choices[0]) */
  dist: [string, number][];
}

export function extractOgStats(md: string): OgStats | undefined {
  const distLine = md.match(/응답 분포: ([^\n]+)/);
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

  const nLine = md.match(/^- n=(\d+)/m);
  const n = nLine ? Number(nLine[1]) : dist.reduce((sum, [, c]) => sum + c, 0);
  return { n, dist };
}

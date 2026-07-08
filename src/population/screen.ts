import type { Persona } from "../types.js";

/**
 * 합성 패널을 타깃 집단으로 한정한다.
 *
 * ⚠️ 있는 축만 담는다. 이 도구의 축은 성·연령·지역·혼인·가구원수 다섯뿐이며,
 * 직업·소득·자녀·도심 여부는 존재하지 않는다. 없는 축으로 거른 척하면
 * "부풀리기"가 된다.
 */
export interface PanelScreener {
  /** 허용 연령 라벨 목록 (census 라벨: "20~24세" … "85세이상") */
  연령?: string[];
  지역?: "수도권" | "비수도권";
}

const BAND = /^(\d+)~(\d+)세$/;
const OPEN_ENDED = /^(\d+)세이상$/;

/** 연령 라벨 목록 → 사람이 읽는 범위. 형식을 모르면 지어내지 않고 원문을 잇는다. */
export function ageRangeLabel(labels: string[]): string {
  if (labels.length === 0) return "";
  const first = labels[0];
  if (labels.length === 1) return first;
  const last = labels[labels.length - 1];
  const lo = BAND.exec(first)?.[1] ?? OPEN_ENDED.exec(first)?.[1];
  if (!lo) return `${first}~${last}`;
  if (OPEN_ENDED.test(last)) return `${lo}세 이상`;
  const hi = BAND.exec(last)?.[2];
  return hi ? `${lo}~${hi}세` : `${first}~${last}`;
}

/** 리포트가 말하는 모집단의 이름. 스크리너가 없으면 "전체 인구". */
export function screenerLabel(s?: PanelScreener): string {
  const parts: string[] = [];
  if (s?.연령 && s.연령.length > 0) parts.push(ageRangeLabel(s.연령));
  if (s?.지역) parts.push(s.지역);
  return parts.length > 0 ? parts.join(" · ") : "전체 인구";
}

/**
 * 표집 직전에 모집단을 거른다. 가중치는 건드리지 않는다 —
 * sampleForSimulation이 총 가중치를 인자에서 재계산하므로 재정규화는 공짜다.
 */
export function screenPersonas(all: Persona[], s?: PanelScreener): Persona[] {
  const hasAge = !!s?.연령 && s.연령.length > 0;
  if (!s || (!hasAge && !s.지역)) return all;
  const ages = hasAge ? new Set(s.연령) : undefined;
  return all.filter(
    (p) =>
      (!ages || ages.has(p.attrs.연령)) && (!s.지역 || p.attrs.지역 === s.지역),
  );
}

/**
 * 값이 하나뿐인 축. 그런 축은 여집합이 비어(restN=0) 비교 자체가 불가능하다 —
 * "차이가 작다"고 말할 근거가 없으므로 세그먼트에서 제외해야 한다.
 */
export function constantDims(personas: Persona[]): string[] {
  const seen = new Map<string, Set<string>>();
  for (const p of personas) {
    for (const [dim, value] of Object.entries(p.attrs)) {
      let vals = seen.get(dim);
      if (!vals) {
        vals = new Set();
        seen.set(dim, vals);
      }
      vals.add(value);
    }
  }
  return [...seen].filter(([, vals]) => vals.size <= 1).map(([dim]) => dim);
}

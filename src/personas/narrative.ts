import type { Persona } from "../types.js";

export interface PoolEntry {
  /** persona 요약 서사 */
  n: string;
  job: string;
  edu: string;
  /** 가구 호환 클래스 (family_type에서 유도) */
  hh: "1" | "2" | "3+" | "unknown";
}

export interface NarrativePool {
  meta: {
    source: string;
    license: string;
    generatedAt: string;
    rowsScanned: number;
    strataFilled: number;
    strataTotal: number;
  };
  strata: Record<string, PoolEntry[]>;
}

/** 스트라텀 키 "연령|성|지역|혼인". 네 축 중 하나라도 없으면 null. */
export function narrativeKey(attrs: Record<string, string>): string | null {
  const a = attrs.연령;
  const s = attrs.성;
  const r = attrs.지역;
  const m = attrs.혼인;
  if (!a || !s || !r || !m) return null;
  return `${a}|${s}|${r}|${m}`;
}

/** 가구원수 attr("가구원수 N명")과 후보 hh 클래스의 호환 검사. */
function hhCompatible(
  attrs: Record<string, string>,
  hh: PoolEntry["hh"],
): boolean {
  if (hh === "unknown") return true;
  const v = attrs.가구원수;
  if (!v) return true;
  const m = v.match(/(\d+)/);
  if (!m) return true;
  const n = Number(m[1]);
  if (hh === "1") return n === 1;
  if (hh === "2") return n === 2;
  return n >= 3;
}

/** FNV-1a 32bit — 결정적 후보 선택 (Math.random 금지: 재현성). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 페르소나마다 스트라텀 매칭 + 가구 호환 필터 후 서사를 결정적으로 부착한다.
 * 후보가 없으면 미부착(현행과 동일 동작). 원본 배열·객체는 변형하지 않는다.
 */
export function attachNarratives(
  personas: Persona[],
  pool: NarrativePool,
  seed: number,
): Persona[] {
  return personas.map((p) => {
    const key = narrativeKey(p.attrs);
    if (!key) return p;
    const candidates = (pool.strata[key] ?? []).filter((e) =>
      hhCompatible(p.attrs, e.hh),
    );
    if (candidates.length === 0) return p;
    const pick = candidates[fnv1a(`${p.id}:${seed}`) % candidates.length];
    return {
      ...p,
      narrative: `${pick.n} (직업: ${pick.job} · 학력: ${pick.edu})`,
    };
  });
}

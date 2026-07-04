import type { Response } from "../types.js";

/** mulberry32 — population/sampleForSimulation과 같은 계열의 시드 결정적 RNG. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 실측 reason 텍스트를 LLM 처방 근거로 층화 추출한다.
 * askChoice 구조화 경로에서 Response.answer = reason. answer가 choice 문구와
 * 동일하면 reason 미수집(폴백 경로)이므로 제외한다.
 */
export function sampleReasons(
  responses: Response[],
  positiveChoice: string,
  opts?: { maxPerSide?: number; seed?: number },
): { positive: string[]; negative: string[] } {
  const maxPerSide = opts?.maxPerSide ?? 20;
  const rng = makeRng(opts?.seed ?? 1);

  const pick = (side: Response[]): string[] => {
    const withReason = side
      .filter((r) => r.answer.trim() !== (r.choice ?? "").trim())
      .map((r) => r.answer.trim().slice(0, 200));
    const unique = [...new Set(withReason)];
    return shuffled(unique, rng).slice(0, maxPerSide);
  };

  const positive = pick(responses.filter((r) => r.choice === positiveChoice));
  const negative = pick(responses.filter((r) => r.choice !== positiveChoice));
  return { positive, negative };
}

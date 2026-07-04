import type { LLMProvider } from "../llm/provider.js";
import type { PersonaSource } from "../population/source.js";
import { sampleForSimulation } from "../population/source.js";
import type { SimulateOpts } from "../simulate/simulate.js";
import { simulate } from "../simulate/simulate.js";
import { modeCollapseFlag, positivitySkew, selfConsistency } from "./probes.js";

export interface ConsistencyMeasurement {
  /** 같은 페르소나에 같은 질문 반복 시 최빈 응답 비율 (0~1, 높을수록 일관) */
  selfConsistency: number;
  /** 첫 선택지 쏠림 (0~1, 0=우연 수준, 1=전원 첫 선택지 — 예스맨) */
  positivitySkew: number;
  /** 실행 간 분포 다양성 평균 (정규화 엔트로피) */
  meanDispersion: number;
  /** 분포 붕괴(무차별/평균회귀) 플래그 */
  collapsed: boolean;
  /** 선택지 순서 뒤집기에서 최다 선택이 바뀌었는가 */
  orderBiased: boolean;
  /** 패러프레이즈 간 최다 선택이 유지되는가 */
  paraphraseStable: boolean;
  detail: { runs: number; calls: number; n: number; repeats: number };
}

/**
 * choices 전체를 0으로 시딩해 집계 — 한 선택지로 100% 쏠린(완전 예스맨) 경우에도
 * positivitySkew가 선택지 수(k)를 알 수 있게 한다. normalizedEntropy는 0 카운트를
 * 걸러내므로 붕괴 판정에는 영향 없음.
 */
function tallyOf(
  answers: Array<string | undefined>,
  choices: string[],
): Record<string, number> {
  const t: Record<string, number> = {};
  for (const c of choices) t[c] = 0;
  for (const a of answers) {
    if (a == null) continue;
    t[a] = (t[a] ?? 0) + 1;
  }
  return t;
}

function topOf(t: Record<string, number>): string | undefined {
  let top: string | undefined;
  let max = -1;
  for (const [k, v] of Object.entries(t)) {
    if (v > max) {
      top = k;
      max = v;
    }
  }
  return top;
}

/**
 * B2: 응답 신뢰도(3층) 실측 오케스트레이터.
 * 같은 표본(seed 고정)에 대해 ① 반복 k회(자기일관성·예스맨) ② 선택지 순서
 * 뒤집기(순서 편향) ③ 패러프레이즈(문구 안정성)를 실행하고, 실행 간 분포
 * 다양성으로 붕괴(무차별)를 판정한다. 총 호출 수 = n × (repeats + 1 + 패러프레이즈 수).
 */
export async function measureResponseConsistency(opts: {
  population: PersonaSource;
  provider: LLMProvider;
  question: string;
  paraphrases: string[];
  choices: string[];
  n: number;
  seed?: number;
  repeats?: number;
  simulate?: SimulateOpts;
}): Promise<ConsistencyMeasurement> {
  const repeats = Math.max(1, opts.repeats ?? 3);
  const all = await opts.population.population();
  const sample = sampleForSimulation(all, opts.n, opts.seed ?? 1);

  let calls = 0;
  let runs = 0;
  const runOnce = async (
    prompt: string,
    choices: string[],
  ): Promise<Map<string, string | undefined>> => {
    const { responses } = await simulate(
      sample,
      { prompt, choices },
      opts.provider,
      opts.simulate,
    );
    calls += sample.length;
    runs += 1;
    const byPersona = new Map<string, string | undefined>();
    for (const r of responses) byPersona.set(r.persona.id, r.choice);
    return byPersona;
  };

  // ① 반복 k회 (원 질문·원 순서) — 자기일관성 + 예스맨 + 붕괴 판정 재료
  const repeatRuns: Array<Map<string, string | undefined>> = [];
  for (let i = 0; i < repeats; i++) {
    repeatRuns.push(await runOnce(opts.question, opts.choices));
  }
  const answersPerPersona: string[][] = sample.map((p) =>
    repeatRuns
      .map((run) => run.get(p.id))
      .filter((a): a is string => a != null),
  );
  const firstTally = tallyOf([...repeatRuns[0].values()], opts.choices);

  // ② 선택지 순서 뒤집기
  const reversedRun = await runOnce(opts.question, [...opts.choices].reverse());
  const reversedTally = tallyOf([...reversedRun.values()], opts.choices);

  // ③ 패러프레이즈
  const paraTallies: Array<Record<string, number>> = [];
  for (const p of opts.paraphrases) {
    paraTallies.push(
      tallyOf([...(await runOnce(p, opts.choices)).values()], opts.choices),
    );
  }

  const tops = [firstTally, ...paraTallies].map(topOf);
  const paraphraseStable = tops.every((t) => t === tops[0]);
  const { meanDispersion, collapsed } = modeCollapseFlag([
    firstTally,
    reversedTally,
    ...paraTallies,
  ]);

  return {
    selfConsistency: selfConsistency(answersPerPersona),
    positivitySkew: positivitySkew(firstTally, opts.choices[0]),
    meanDispersion,
    collapsed,
    orderBiased: topOf(firstTally) !== topOf(reversedTally),
    paraphraseStable,
    detail: { runs, calls, n: sample.length, repeats },
  };
}

import snapshotJson from "../data/census/kr-2024.json" with { type: "json" };
import poolJson from "../data/nemotron/kr-pool.json" with { type: "json" };
import { OpenAIProvider } from "../src/llm/openai.js";
import type { NarrativePool } from "../src/personas/narrative.js";
import type { Snapshot } from "../src/population/schema.js";
import { CensusPopulation } from "../src/population/source.js";
import { runCensusStudy } from "../src/study.js";

// 실키 A/B: NARRATIVE off vs on 응답 분포·reason 대조. 실행·판정은 컨트롤러 전담.
const question = {
  prompt: "개인용 클라우드 백업 서비스에 월 5천원을 낼 의향이 있으신가요?",
  choices: ["있다", "없다", "모르겠다"],
};
const seed = 424242;
const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  model: "gpt-4o-mini",
});
const population = new CensusPopulation(snapshotJson as unknown as Snapshot);

for (const mode of ["off", "on"] as const) {
  const result = await runCensusStudy({
    population,
    provider,
    question,
    n: 30,
    seed,
    repeats: 3,
    simulate: { concurrency: 4, retries: 1, counterbalance: true },
    narrativePool:
      mode === "on" ? (poolJson as unknown as NarrativePool) : undefined,
  });
  const dist: Record<string, number> = {};
  let parsed = 0;
  for (const r of result.responses) {
    if (r.choice) {
      parsed++;
      dist[r.choice] = (dist[r.choice] ?? 0) + 1;
    }
  }
  console.log(`\n=== NARRATIVE ${mode} ===`);
  console.log(
    "분포:",
    JSON.stringify(dist),
    `파싱 ${parsed}/${result.responses.length}`,
  );
  console.log("reason 표본 5건:");
  for (const r of result.responses.filter((x) => x.answer).slice(0, 5)) {
    console.log(`- [${r.choice}] ${r.answer.slice(0, 150)}`);
  }
}

import { normalizedEntropy } from "../aggregate/uncertainty.js";

export function selfConsistency(answersPerPersona: string[][]): number {
  if (answersPerPersona.length === 0) return 1;
  let sum = 0;
  for (const answers of answersPerPersona) {
    if (answers.length === 0) {
      sum += 1;
      continue;
    }
    const counts: Record<string, number> = {};
    for (const a of answers) counts[a] = (counts[a] ?? 0) + 1;
    const mode = Math.max(...Object.values(counts));
    sum += mode / answers.length;
  }
  return sum / answersPerPersona.length;
}

export function modeCollapseFlag(
  tallies: Array<Record<string, number>>,
  threshold = 0.15,
): { meanDispersion: number; collapsed: boolean } {
  if (tallies.length === 0) return { meanDispersion: 0, collapsed: false };
  let sum = 0;
  for (const t of tallies) sum += normalizedEntropy(Object.values(t));
  const meanDispersion = sum / tallies.length;
  return { meanDispersion, collapsed: meanDispersion < threshold };
}

export function positivitySkew(
  tally: Record<string, number>,
  positiveChoice: string,
): number {
  const total = Object.values(tally).reduce((s, v) => s + v, 0);
  const k = Object.keys(tally).length;
  if (total === 0 || k < 2) return 0;
  const observed = (tally[positiveChoice] ?? 0) / total;
  const chance = 1 / k;
  if (observed <= chance) return 0;
  return (observed - chance) / (1 - chance);
}

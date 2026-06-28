import { topChoice } from "./calibrate.js";

export type ShareRunner = (
  prompt: string,
  choices: string[],
) => Promise<Record<string, number>>;

export async function paraphraseStability(
  runner: ShareRunner,
  prompts: string[],
  choices: string[],
): Promise<{ tops: Array<string | undefined>; stable: boolean }> {
  const tops: Array<string | undefined> = [];
  for (const p of prompts) tops.push(topChoice(await runner(p, choices)));
  const stable = tops.every((t) => t === tops[0]);
  return { tops, stable };
}

export async function orderBias(
  runner: ShareRunner,
  prompt: string,
  choices: string[],
): Promise<{ forwardTop?: string; reversedTop?: string; biased: boolean }> {
  const forwardTop = topChoice(await runner(prompt, choices));
  const reversedTop = topChoice(await runner(prompt, [...choices].reverse()));
  return { forwardTop, reversedTop, biased: forwardTop !== reversedTop };
}

export async function attributeSensitivity(
  runWith: ShareRunner,
  runWithout: ShareRunner,
  prompt: string,
  choices: string[],
): Promise<{ withTop?: string; withoutTop?: string; changed: boolean }> {
  const withTop = topChoice(await runWith(prompt, choices));
  const withoutTop = topChoice(await runWithout(prompt, choices));
  return { withTop, withoutTop, changed: withTop !== withoutTop };
}

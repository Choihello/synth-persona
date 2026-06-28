import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Persona } from "../types.js";
import type { LLMProvider } from "./provider.js";

export function cassetteKey(persona: Persona, prompt: string): string {
  const payload = JSON.stringify({ attrs: persona.attrs, prompt });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export class RecordedProvider implements LLMProvider {
  private store: Record<string, string>;
  constructor(
    private opts: {
      cassettePath: string;
      mode: "replay" | "record";
      underlying?: LLMProvider;
    },
  ) {
    this.store = existsSync(opts.cassettePath)
      ? (JSON.parse(readFileSync(opts.cassettePath, "utf8")) as Record<
          string,
          string
        >)
      : {};
  }
  async ask(persona: Persona, prompt: string): Promise<string> {
    const key = cassetteKey(persona, prompt);
    if (this.opts.mode === "replay") {
      if (!(key in this.store))
        throw new Error(`No cassette entry for key ${key}`);
      return this.store[key];
    }
    if (!this.opts.underlying)
      throw new Error("record 모드에는 underlying provider가 필요합니다");
    const answer = await this.opts.underlying.ask(persona, prompt);
    this.store[key] = answer;
    writeFileSync(this.opts.cassettePath, JSON.stringify(this.store, null, 2));
    return answer;
  }
}

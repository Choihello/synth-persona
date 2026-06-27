import type { Persona } from "../types.js";

export interface LLMProvider {
  ask(persona: Persona, prompt: string): Promise<string>;
}

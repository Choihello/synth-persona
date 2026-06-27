import type { Persona } from "../types.js";
import type { LLMProvider } from "./provider.js";

export class MockProvider implements LLMProvider {
  constructor(private fn: (persona: Persona, prompt: string) => string) {}
  async ask(persona: Persona, prompt: string): Promise<string> {
    return this.fn(persona, prompt);
  }
}

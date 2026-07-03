import type { Persona } from "../types.js";

export interface ChoiceReply {
  choice: string;
  /** 그 선택을 한 이유 (한두 문장). B3(진단→처방)에서 free-text 근거로 활용. */
  reason?: string;
}

export interface LLMProvider {
  ask(persona: Persona, prompt: string): Promise<string>;
  /**
   * 구조화 선택 경로(옵셔널). choices 중 하나를 강제 반환해
   * matchChoice 부분문자열 매칭의 오매칭/미매칭을 제거한다.
   * 미구현 provider는 simulate가 ask+matchChoice로 폴백.
   */
  askChoice?(
    persona: Persona,
    prompt: string,
    choices: string[],
  ): Promise<ChoiceReply>;
}

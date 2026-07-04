import type { Persona } from "../types.js";

export interface ChoiceReply {
  choice: string;
  /** 그 선택을 한 이유 (한두 문장). B3(진단→처방)에서 free-text 근거로 활용. */
  reason?: string;
}

export interface ProviderUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
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
  /**
   * 구조화 JSON 생성(옵셔널). 처방 등 자유 스키마 산출물용 —
   * 미구현 provider는 호출자가 heuristic으로 폴백한다.
   */
  generateJson?(
    system: string,
    user: string,
    schema: { name: string; schema: Record<string, unknown> },
  ): Promise<unknown>;
  /**
   * 누적 토큰 사용량(옵셔널). 비용이 드는 provider(또는 그 래퍼)가 노출하면
   * CLI가 구체 클래스와 무관하게 사용량을 출력한다.
   */
  readonly usage?: ProviderUsage;
}

import type { ReportStore } from "./store.js";

export interface LimitPolicy {
  perIpDaily: number;
  globalDaily: number;
}

export type LimitResult = { ok: true } | { ok: false; reason: string };

const REPO = "https://github.com/Choihello/synth-persona";

/**
 * 호스팅 모델의 비용 하드캡: IP당 일 한도 + 전역 일 한도(≈$1/일) 이중 방어.
 * IP는 해시로만 저장되므로 여기서도 ipHash만 다룬다.
 */
export async function checkLimit(
  store: ReportStore,
  ipHash: string,
  now: Date,
  policy: LimitPolicy,
): Promise<LimitResult> {
  const date = now.toISOString().slice(0, 10);
  if ((await store.countOnDate(date)) >= policy.globalDaily) {
    return {
      ok: false,
      reason: `오늘의 데모 체험분이 모두 소진됐습니다. 이 도구는 오픈소스라 자기 API 키로 직접 실행하면 제한이 없습니다 — ${REPO}`,
    };
  }
  if ((await store.countByIpOnDate(ipHash, date)) >= policy.perIpDaily) {
    return {
      ok: false,
      reason: `오늘 이 네트워크의 데모 횟수(${policy.perIpDaily}회)를 다 썼습니다. 자기 API 키로 직접 실행하면 제한이 없습니다 — ${REPO}`,
    };
  }
  return { ok: true };
}

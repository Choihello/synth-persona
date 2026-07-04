import type { ReportStore } from "./store.js";

export interface LimitPolicy {
  perIpDaily: number;
  globalDaily: number;
}

export type LimitResult = { ok: true } | { ok: false; reason: string };

/**
 * 호스팅 모델의 비용 하드캡: IP당 일 한도 + 전역 일 한도(≈$1/일) 이중 방어.
 * IP는 해시로만 저장되므로 여기서도 ipHash만 다룬다.
 */
export function checkLimit(
  store: ReportStore,
  ipHash: string,
  now: Date,
  policy: LimitPolicy,
): LimitResult {
  const date = now.toISOString().slice(0, 10);
  if (store.countOnDate(date) >= policy.globalDaily) {
    return {
      ok: false,
      reason:
        "오늘의 무료 체험분이 모두 소진됐습니다. 내일 다시 시도해 주세요.",
    };
  }
  if (store.countByIpOnDate(ipHash, date) >= policy.perIpDaily) {
    return {
      ok: false,
      reason: `오늘 이 네트워크의 무료 횟수(${policy.perIpDaily}회)를 다 썼습니다. 내일 다시 시도해 주세요.`,
    };
  }
  return { ok: true };
}

import { timingSafeEqual } from "node:crypto";

/** 상수시간 문자열 비교. 길이가 다르면 즉시 false (timingSafeEqual은 동일 길이 요구). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * 관리자 요청 판정. `adminToken`(ADMIN_TOKEN env)이 설정돼 있고, 제시된 후보
 * (쿠키·헤더·쿼리 등) 중 하나라도 토큰과 일치하면 true.
 * 토큰 미설정(undefined/빈 문자열) 시 항상 false — 셀프호스팅 시 기능이
 * 꺼져 있는 안전한 기본값이다. 비교는 상수시간으로 한다.
 */
export function isAdminRequest(
  candidates: Array<string | undefined | null>,
  adminToken: string | undefined,
): boolean {
  if (!adminToken) return false;
  return candidates.some(
    (c) => typeof c === "string" && c.length > 0 && safeEqual(c, adminToken),
  );
}

/** 관리자 우회 쿠키 이름. httpOnly로 심어 JS 노출을 막는다. */
export const ADMIN_COOKIE = "sp_admin";

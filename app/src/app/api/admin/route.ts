import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdminRequest } from "../../../../../web/admin.js";
import { adminToken } from "../../../lib/backend.js";

export const runtime = "nodejs";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * 관리자 모드 활성화 — `?token=<ADMIN_TOKEN>`이 맞으면 httpOnly 쿠키를 심어
 * 이 브라우저가 30일간 한도 없이 리포트를 만들 수 있게 한다.
 * 브라우저에서 한 번만 열면 된다. ADMIN_TOKEN 미설정 시 항상 401.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token");
  if (!isAdminRequest([token], adminToken)) {
    return NextResponse.json(
      { error: "유효하지 않은 토큰입니다." },
      { status: 401 },
    );
  }
  const res = NextResponse.json({
    ok: true,
    message:
      "관리자 모드 활성화됨 — 이 브라우저는 30일간 한도 없이 리포트를 만들 수 있습니다.",
  });
  res.cookies.set(ADMIN_COOKIE, adminToken as string, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: THIRTY_DAYS,
    path: "/",
  });
  return res;
}

import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { type NextRequest, NextResponse, after } from "next/server";
import { ADMIN_COOKIE, isAdminRequest } from "../../../../../web/admin.js";
import { checkLimit } from "../../../../../web/limits.js";
import { executeReport } from "../../../../../web/run-report.js";
import { validateReportInput } from "../../../../../web/validate.js";
import type { PanelScreener } from "../../../../../src/population/screen.js";
import {
  adminToken,
  getRunner,
  getStore,
  ipSalt,
  policy,
} from "../../../lib/backend.js";

export const runtime = "nodejs";
export const maxDuration = 300; // 실측 ~60초 + LLM 처방 — Fluid에서 after()까지 보장

export async function POST(req: NextRequest): Promise<NextResponse> {
  let input: {
    question: string;
    choices: string[];
    screener?: PanelScreener;
  };
  try {
    input = validateReportInput(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const ipHash = createHash("sha256")
    .update(ip + ipSalt)
    .digest("hex")
    .slice(0, 16);

  const store = getStore();
  // 관리자(운영자)는 한도를 건너뛴다 — 쿠키(sp_admin) 또는 헤더(x-admin-token).
  const admin = isAdminRequest(
    [req.cookies.get(ADMIN_COOKIE)?.value, req.headers.get("x-admin-token")],
    adminToken,
  );
  if (!admin) {
    const limit = await checkLimit(store, ipHash, new Date(), policy);
    if (!limit.ok) {
      return NextResponse.json({ error: limit.reason }, { status: 429 });
    }
  }

  const id = nanoid(10);
  await store.create({
    id,
    question: input.question,
    choices: input.choices,
    ipHash,
    createdAt: new Date().toISOString(),
    ...(input.screener ? { screener: input.screener } : {}),
  });

  // 응답 반환 후 백그라운드로 실행 — 진행/결과는 DB로 공유(폴링)
  after(async () => {
    await executeReport(store, id, getRunner());
  });

  return NextResponse.json({ id }, { status: 201 });
}

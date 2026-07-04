import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { type NextRequest, NextResponse, after } from "next/server";
import { checkLimit } from "../../../../../web/limits.js";
import { executeReport } from "../../../../../web/run-report.js";
import { validateReportInput } from "../../../../../web/validate.js";
import { getRunner, getStore, ipSalt, policy } from "../../../lib/backend.js";

export const runtime = "nodejs";
export const maxDuration = 300; // 실측 ~60초 + LLM 처방 — Fluid에서 after()까지 보장

export async function POST(req: NextRequest): Promise<NextResponse> {
  let input: { question: string; choices: string[] };
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
  const limit = await checkLimit(store, ipHash, new Date(), policy);
  if (!limit.ok) {
    return NextResponse.json({ error: limit.reason }, { status: 429 });
  }

  const id = nanoid(10);
  await store.create({
    id,
    question: input.question,
    choices: input.choices,
    ipHash,
    createdAt: new Date().toISOString(),
  });

  // 응답 반환 후 백그라운드로 실행 — 진행/결과는 DB로 공유(폴링)
  after(async () => {
    await executeReport(store, id, getRunner());
  });

  return NextResponse.json({ id }, { status: 201 });
}

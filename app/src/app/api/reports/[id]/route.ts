import { NextResponse } from "next/server";
import { getStore } from "../../../../lib/backend.js";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const row = await getStore().get(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    status: row.status,
    error: row.error,
    done: row.progressDone,
    total: row.progressTotal,
    phase: row.phase,
  });
}

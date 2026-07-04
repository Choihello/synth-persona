import { createHash } from "node:crypto";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { marked } from "marked";
import { nanoid } from "nanoid";
import { JobQueue, type ReportRunner } from "./jobs.js";
import { type LimitPolicy, checkLimit } from "./limits.js";
import type { ReportStore } from "./store.js";
import {
  escapeHtml,
  failedPage,
  homePage,
  pendingPage,
  reportPage,
} from "./views.js";

const PANEL_N = 90; // n=30 × repeats 3 — 공유 페이지 메타 표기용

export interface AppDeps {
  store: ReportStore;
  runner: ReportRunner;
  policy: LimitPolicy;
  ipSalt: string;
}

function validate(body: unknown): { question: string; choices: string[] } {
  const b = (body ?? {}) as { question?: unknown; choices?: unknown };
  const question = typeof b.question === "string" ? b.question.trim() : "";
  if (!question) throw new Error("question이 필요합니다.");
  if (question.length > 200) throw new Error("질문은 200자 이내여야 합니다.");
  const choices = Array.isArray(b.choices)
    ? b.choices.map((c) => String(c).trim()).filter(Boolean)
    : [];
  if (choices.length < 2 || choices.length > 4)
    throw new Error("선택지는 2~4개여야 합니다.");
  if (choices.some((c) => c.length > 20))
    throw new Error("선택지는 각 20자 이내여야 합니다.");
  return { question: escapeHtml(question), choices: choices.map(escapeHtml) };
}

export function createApp(deps: AppDeps): { app: Hono; queue: JobQueue } {
  const { store, policy, ipSalt } = deps;
  const queue = new JobQueue(store, deps.runner, { concurrency: 2 });
  const app = new Hono();

  const ipHashOf = (c: {
    req: { header: (n: string) => string | undefined };
  }) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "local";
    return createHash("sha256")
      .update(ip + ipSalt)
      .digest("hex")
      .slice(0, 16);
  };

  app.get("/", (c) => c.html(homePage()));

  app.post("/api/reports", async (c) => {
    let input: { question: string; choices: string[] };
    try {
      input = validate(await c.req.json().catch(() => ({})));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
    const ipHash = ipHashOf(c);
    const limit = checkLimit(store, ipHash, new Date(), policy);
    if (!limit.ok) return c.json({ error: limit.reason }, 429);

    const id = nanoid(10);
    store.create({
      id,
      question: input.question,
      choices: input.choices,
      ipHash,
      createdAt: new Date().toISOString(),
    });
    queue.enqueue(id);
    return c.json({ id }, 201);
  });

  app.get("/api/reports/:id", (c) => {
    const row = store.get(c.req.param("id"));
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ status: row.status, error: row.error });
  });

  app.get("/api/reports/:id/events", (c) => {
    const id = c.req.param("id");
    const row = store.get(id);
    if (!row) return c.json({ error: "not found" }, 404);
    return streamSSE(c, async (stream) => {
      if (row.status === "done" || row.status === "failed") {
        await stream.writeSSE({
          data: JSON.stringify(
            row.status === "done"
              ? { type: "done" }
              : { type: "error", error: row.error },
          ),
        });
        return;
      }
      let done = false;
      const unsub = queue.subscribe(id, (e) => {
        void stream.writeSSE({ data: JSON.stringify(e) });
        if (e.type === "done" || e.type === "error") done = true;
      });
      try {
        while (!done) await new Promise((r) => setTimeout(r, 300));
      } finally {
        unsub();
      }
    });
  });

  app.get("/r/:id", (c) => {
    const row = store.get(c.req.param("id"));
    if (!row) return c.html(failedPage("리포트를 찾을 수 없습니다."), 404);
    if (row.status === "failed")
      return c.html(failedPage(row.error ?? "알 수 없는 오류"));
    if (row.status !== "done" || !row.md) return c.html(pendingPage(row.id));
    const html = marked.parse(row.md, { async: false });
    return c.html(reportPage(html, { n: PANEL_N }));
  });

  return { app, queue };
}

import type { Hono } from "hono";
import { describe, expect, test } from "vitest";
import type { ReportRunner } from "./jobs.js";
import { createApp } from "./server.js";
import { ReportStore } from "./store.js";

function appWith(
  runner: ReportRunner,
  policy = { perIpDaily: 3, globalDaily: 100 },
) {
  const store = new ReportStore(":memory:");
  return { store, ...createApp({ store, runner, policy, ipSalt: "test" }) };
}

const okRunner: ReportRunner = async (_q, _c, onProgress) => {
  onProgress(1, 2, "응답 수집");
  return "# 리포트 본문\n\nsynthetic panel response — 테스트";
};

async function postReport(app: Hono, body: unknown, ip = "1.2.3.4") {
  return app.request("/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reports", () => {
  test("유효 입력 → 201 + id, 잡 완료 후 done", async () => {
    const { app, queue, store } = appWith(okRunner);
    const res = await postReport(app, {
      question: "월 9900원에 쓸 의향?",
      choices: ["쓴다", "안쓴다"],
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(id).toBeTruthy();
    await queue.idle();
    expect(store.get(id)?.status).toBe("done");
  });

  test.each([
    [{ choices: ["A", "B"] }, /question/],
    [{ question: "가".repeat(201), choices: ["A", "B"] }, /200자/],
    [{ question: "q?", choices: ["A"] }, /선택지/],
    [{ question: "q?", choices: ["A", "B", "C", "D", "E"] }, /선택지/],
  ])("잘못된 입력은 400: %j", async (body, msgPattern) => {
    const { app } = appWith(okRunner);
    const res = await postReport(app, body);
    expect(res.status).toBe(400);
    const { error } = (await res.json()) as { error: string };
    expect(error).toMatch(msgPattern);
  });

  test("IP당 일 한도 초과 시 429", async () => {
    const { app } = appWith(okRunner, { perIpDaily: 2, globalDaily: 100 });
    const body = { question: "q?", choices: ["A", "B"] };
    await postReport(app, body);
    await postReport(app, body);
    const res = await postReport(app, body);
    expect(res.status).toBe(429);
  });

  test("다른 IP는 별도 카운트", async () => {
    const { app } = appWith(okRunner, { perIpDaily: 1, globalDaily: 100 });
    await postReport(app, { question: "q?", choices: ["A", "B"] }, "1.1.1.1");
    const res = await postReport(
      app,
      { question: "q?", choices: ["A", "B"] },
      "2.2.2.2",
    );
    expect(res.status).toBe(201);
  });
});

describe("GET /api/reports/:id (폴링)", () => {
  test("상태와 진행이 내려온다", async () => {
    const { app, queue } = appWith(okRunner);
    const res = await postReport(app, { question: "q?", choices: ["A", "B"] });
    const { id } = (await res.json()) as { id: string };
    await queue.idle();
    const st = await app.request(`/api/reports/${id}`);
    expect(((await st.json()) as { status: string }).status).toBe("done");
  });

  test("없는 id는 404", async () => {
    const { app } = appWith(okRunner);
    expect((await app.request("/api/reports/nope")).status).toBe(404);
  });
});

describe("GET /r/:id (공유 페이지)", () => {
  test("완료 리포트를 HTML로 렌더 + 메타 정보 포함", async () => {
    const { app, queue } = appWith(okRunner);
    const res = await postReport(app, {
      question: "월 9900원에 쓸 의향?",
      choices: ["쓴다", "안쓴다"],
    });
    const { id } = (await res.json()) as { id: string };
    await queue.idle();
    const page = await app.request(`/r/${id}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("리포트 본문"); // markdown → HTML
    expect(html).toContain("synthetic panel"); // 정직성 라벨
    expect(html).toContain("gpt-4o-mini"); // 메타
  });

  test("아직 진행 중이면 진행 페이지로", async () => {
    let release: () => void = () => {};
    const slow: ReportRunner = () =>
      new Promise((resolve) => {
        release = () => resolve("# r");
      });
    const { app } = appWith(slow);
    const res = await postReport(app, { question: "q?", choices: ["A", "B"] });
    const { id } = (await res.json()) as { id: string };
    const page = await app.request(`/r/${id}`);
    expect(await page.text()).toContain("생성 중");
    release();
  });
});

describe("GET /", () => {
  test("입력 폼과 disclaimer가 있다", async () => {
    const { app } = appWith(okRunner);
    const html = await (await app.request("/")).text();
    expect(html).toContain("question");
    expect(html).toContain("synthetic panel");
  });
});

describe("XSS 방어", () => {
  test("질문의 HTML이 이스케이프된다", async () => {
    const { app, queue } = appWith(okRunner);
    const res = await postReport(app, {
      question: "<script>alert(1)</script> 쓸래?",
      choices: ["A", "B"],
    });
    const { id } = (await res.json()) as { id: string };
    await queue.idle();
    const html = await (await app.request(`/r/${id}`)).text();
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

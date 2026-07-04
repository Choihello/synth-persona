import { serve } from "@hono/node-server";
import { OpenAIProvider } from "../src/llm/openai.js";
import { makeReportRunner } from "./pipeline.js";
import { createApp } from "./server.js";
import { ReportStore } from "./store.js";

function main(): void {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY가 없습니다 — .env 또는 환경변수를 확인하세요.",
    );
    process.exit(1);
  }
  const port = Number(process.env.PORT ?? 8787);
  const store = new ReportStore(process.env.DB_PATH ?? "web-reports.db");
  const { app } = createApp({
    store,
    runner: makeReportRunner(new OpenAIProvider()),
    policy: {
      perIpDaily: Number(process.env.PER_IP_DAILY ?? 3),
      globalDaily: Number(process.env.DAILY_GLOBAL_CAP ?? 100),
    },
    ipSalt: process.env.IP_SALT ?? "change-me",
  });
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`synth-persona web: http://localhost:${info.port}`);
  });
}

main();

import { OpenAIProvider } from "../../../src/llm/openai.js";
import type { ReportRunner } from "../../../web/jobs.js";
import { makeReportRunner } from "../../../web/pipeline.js";
import { TursoStore } from "../../../web/store-turso.js";
import type { ReportStore } from "../../../web/store.js";
import { SqliteStore } from "../../../web/store.js";

/**
 * 서버리스 인스턴스별 싱글턴. TURSO_DATABASE_URL이 있으면 Turso(공유 상태),
 * 없으면 로컬 SQLite 파일(로컬 next dev용).
 */
declare global {
  var __spStore: ReportStore | undefined;
  var __spRunner: ReportRunner | undefined;
}

export function getStore(): ReportStore {
  if (!globalThis.__spStore) {
    const url = process.env.TURSO_DATABASE_URL;
    globalThis.__spStore = url
      ? new TursoStore({ url, authToken: process.env.TURSO_AUTH_TOKEN })
      : new SqliteStore(process.env.DB_PATH ?? "web-reports.db");
  }
  return globalThis.__spStore;
}

export function getRunner(): ReportRunner {
  if (!globalThis.__spRunner) {
    globalThis.__spRunner = makeReportRunner(new OpenAIProvider());
  }
  return globalThis.__spRunner;
}

export const policy = {
  perIpDaily: Number(process.env.PER_IP_DAILY ?? 3),
  globalDaily: Number(process.env.DAILY_GLOBAL_CAP ?? 100),
};

export const ipSalt = process.env.IP_SALT ?? "change-me";

/** 관리자 우회 토큰. 미설정 시 우회 기능 비활성(기본값). */
export const adminToken = process.env.ADMIN_TOKEN;

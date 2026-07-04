import { type Client, createClient } from "@libsql/client";
import {
  type ReportRow,
  type ReportStatus,
  type ReportStore,
  rowToReport,
} from "./store.js";

const SCHEMA = `CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  choices TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  md TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  progress_done INTEGER,
  progress_total INTEGER,
  phase TEXT
)`;

/**
 * Turso(libSQL) 구현 — Vercel 등 서버리스에서 인스턴스 간 상태 공유용.
 * url ":memory:"/"file:..."로 키 없이 테스트, 프로덕션은
 * TURSO_DATABASE_URL(+TURSO_AUTH_TOKEN).
 */
export class TursoStore implements ReportStore {
  private client: Client;
  private ready: Promise<unknown>;

  constructor(opts: { url: string; authToken?: string }) {
    this.client = createClient(opts);
    this.ready = this.client
      .execute(SCHEMA)
      .then(() =>
        this.client.execute(
          "CREATE INDEX IF NOT EXISTS idx_reports_ip_day ON reports(ip_hash, created_at)",
        ),
      );
  }

  private async exec(sql: string, args: (string | number)[]) {
    await this.ready;
    return this.client.execute({ sql, args });
  }

  async create(r: {
    id: string;
    question: string;
    choices: string[];
    ipHash: string;
    createdAt: string;
  }): Promise<void> {
    await this.exec(
      "INSERT INTO reports (id, question, choices, status, created_at, ip_hash) VALUES (?, ?, ?, 'queued', ?, ?)",
      [r.id, r.question, JSON.stringify(r.choices), r.createdAt, r.ipHash],
    );
  }

  async get(id: string): Promise<ReportRow | undefined> {
    const res = await this.exec("SELECT * FROM reports WHERE id = ?", [id]);
    const row = res.rows[0];
    return row
      ? rowToReport(row as unknown as Record<string, unknown>)
      : undefined;
  }

  async setStatus(id: string, status: ReportStatus): Promise<void> {
    await this.exec("UPDATE reports SET status = ? WHERE id = ?", [status, id]);
  }

  async setProgress(
    id: string,
    done: number,
    total: number,
    phase: string,
  ): Promise<void> {
    await this.exec(
      "UPDATE reports SET progress_done = ?, progress_total = ?, phase = ? WHERE id = ?",
      [done, total, phase, id],
    );
  }

  async markDone(id: string, md: string): Promise<void> {
    await this.exec("UPDATE reports SET status = 'done', md = ? WHERE id = ?", [
      md,
      id,
    ]);
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.exec(
      "UPDATE reports SET status = 'failed', error = ? WHERE id = ?",
      [error, id],
    );
  }

  async countByIpOnDate(ipHash: string, date: string): Promise<number> {
    const res = await this.exec(
      "SELECT COUNT(*) AS c FROM reports WHERE ip_hash = ? AND created_at LIKE ?",
      [ipHash, `${date}%`],
    );
    return Number(res.rows[0].c);
  }

  async countOnDate(date: string): Promise<number> {
    const res = await this.exec(
      "SELECT COUNT(*) AS c FROM reports WHERE created_at LIKE ?",
      [`${date}%`],
    );
    return Number(res.rows[0].c);
  }
}

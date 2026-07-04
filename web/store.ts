import type { DatabaseSync as DatabaseSyncT } from "node:sqlite";

// vite/vitest가 node:sqlite를 아직 리졸브하지 못해 정적 import 대신
// 런타임 내장 모듈 API로 로드한다 (Node 22.3+).
const { DatabaseSync } = process.getBuiltinModule(
  "node:sqlite",
) as typeof import("node:sqlite");
type DatabaseSync = DatabaseSyncT;

export type ReportStatus = "queued" | "running" | "done" | "failed";

export interface ReportRow {
  id: string;
  question: string;
  choices: string[];
  status: ReportStatus;
  md?: string;
  error?: string;
  createdAt: string;
  ipHash: string;
}

/** SQLite 저장소 (Node 내장 node:sqlite — 네이티브 빌드·외부 의존성 불필요). */
export class ReportStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      choices TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      md TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      ip_hash TEXT NOT NULL
    )`);
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_reports_ip_day ON reports(ip_hash, created_at)",
    );
  }

  create(r: {
    id: string;
    question: string;
    choices: string[];
    ipHash: string;
    createdAt: string;
  }): void {
    this.db
      .prepare(
        "INSERT INTO reports (id, question, choices, status, created_at, ip_hash) VALUES (?, ?, ?, 'queued', ?, ?)",
      )
      .run(r.id, r.question, JSON.stringify(r.choices), r.createdAt, r.ipHash);
  }

  get(id: string): ReportRow | undefined {
    const row = this.db
      .prepare(
        "SELECT id, question, choices, status, md, error, created_at, ip_hash FROM reports WHERE id = ?",
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: String(row.id),
      question: String(row.question),
      choices: JSON.parse(String(row.choices)) as string[],
      status: String(row.status) as ReportStatus,
      md: row.md == null ? undefined : String(row.md),
      error: row.error == null ? undefined : String(row.error),
      createdAt: String(row.created_at),
      ipHash: String(row.ip_hash),
    };
  }

  setStatus(id: string, status: ReportStatus): void {
    this.db
      .prepare("UPDATE reports SET status = ? WHERE id = ?")
      .run(status, id);
  }

  markDone(id: string, md: string): void {
    this.db
      .prepare("UPDATE reports SET status = 'done', md = ? WHERE id = ?")
      .run(md, id);
  }

  markFailed(id: string, error: string): void {
    this.db
      .prepare("UPDATE reports SET status = 'failed', error = ? WHERE id = ?")
      .run(error, id);
  }

  /** date는 UTC "YYYY-MM-DD". created_at ISO 문자열의 접두 일치로 하루를 센다. */
  countByIpOnDate(ipHash: string, date: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS c FROM reports WHERE ip_hash = ? AND created_at LIKE ?",
      )
      .get(ipHash, `${date}%`) as { c: number };
    return Number(row.c);
  }

  countOnDate(date: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS c FROM reports WHERE created_at LIKE ?")
      .get(`${date}%`) as { c: number };
    return Number(row.c);
  }
}

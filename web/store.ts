import type { DatabaseSync as DatabaseSyncT } from "node:sqlite";
import type { PanelScreener } from "../src/population/screen.js";

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
  progressDone?: number;
  progressTotal?: number;
  phase?: string;
  /** 스크리너로 한정된 모집단 (연령 라벨 목록 + 지역). 없으면 전 인구. */
  screener?: PanelScreener;
}

/**
 * 리포트 저장소 계약 — 서버리스(Vercel)에서는 TursoStore, 로컬/테스트는
 * SqliteStore. 진행률도 DB에 기록해 인스턴스 간 상태를 공유한다(SSE 대체).
 */
export interface ReportStore {
  create(r: {
    id: string;
    question: string;
    choices: string[];
    ipHash: string;
    createdAt: string;
    screener?: PanelScreener;
  }): Promise<void>;
  get(id: string): Promise<ReportRow | undefined>;
  setStatus(id: string, status: ReportStatus): Promise<void>;
  setProgress(
    id: string,
    done: number,
    total: number,
    phase: string,
  ): Promise<void>;
  markDone(id: string, md: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  countByIpOnDate(ipHash: string, date: string): Promise<number>;
  countOnDate(date: string): Promise<number>;
}

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
  phase TEXT,
  screener TEXT
)`;

/** 기존 테이블용 가산적 마이그레이션. 첫 요청 시 실행, 재실행 안전(중복 컬럼 삼킴). */
export const MIGRATIONS: readonly string[] = [
  "ALTER TABLE reports ADD COLUMN screener TEXT",
];

/** SQLite/libSQL의 "이미 존재하는 컬럼" 에러 판별 — 마이그레이션 재실행 안전용. */
export function isDuplicateColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /duplicate column name/i.test(msg);
}

export function rowToReport(row: Record<string, unknown>): ReportRow {
  return {
    id: String(row.id),
    question: String(row.question),
    choices: JSON.parse(String(row.choices)) as string[],
    status: String(row.status) as ReportStatus,
    md: row.md == null ? undefined : String(row.md),
    error: row.error == null ? undefined : String(row.error),
    createdAt: String(row.created_at),
    ipHash: String(row.ip_hash),
    progressDone:
      row.progress_done == null ? undefined : Number(row.progress_done),
    progressTotal:
      row.progress_total == null ? undefined : Number(row.progress_total),
    phase: row.phase == null ? undefined : String(row.phase),
    screener:
      row.screener == null
        ? undefined
        : (JSON.parse(String(row.screener)) as PanelScreener),
  };
}

// vite/vitest가 node:sqlite를 아직 리졸브하지 못해 정적 import 대신
// 런타임 내장 모듈 API로 로드한다. SqliteStore 생성 시점까지 지연해,
// Turso를 쓰는 프로덕션은 node:sqlite 없는 런타임(Node <22.13)에서도 동작한다.
function loadSqlite(): typeof import("node:sqlite") {
  const mod = process.getBuiltinModule("node:sqlite") as
    | typeof import("node:sqlite")
    | undefined;
  if (!mod) {
    throw new Error(
      "node:sqlite unavailable — SqliteStore needs Node 22.13+ (or set TURSO_DATABASE_URL to use Turso)",
    );
  }
  return mod;
}
type DatabaseSync = DatabaseSyncT;

/** 로컬 파일/메모리용 구현 (Node 내장 node:sqlite — 외부 의존성 불필요). */
export class SqliteStore implements ReportStore {
  private db: DatabaseSync;

  constructor(path: string) {
    const { DatabaseSync } = loadSqlite();
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_reports_ip_day ON reports(ip_hash, created_at)",
    );
    for (const sql of MIGRATIONS) {
      try {
        this.db.exec(sql);
      } catch (e) {
        if (!isDuplicateColumnError(e)) throw e;
      }
    }
  }

  async create(r: {
    id: string;
    question: string;
    choices: string[];
    ipHash: string;
    createdAt: string;
    screener?: PanelScreener;
  }): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO reports (id, question, choices, status, created_at, ip_hash, screener) VALUES (?, ?, ?, 'queued', ?, ?, ?)",
      )
      .run(
        r.id,
        r.question,
        JSON.stringify(r.choices),
        r.createdAt,
        r.ipHash,
        r.screener ? JSON.stringify(r.screener) : null,
      );
  }

  async get(id: string): Promise<ReportRow | undefined> {
    const row = this.db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToReport(row) : undefined;
  }

  async setStatus(id: string, status: ReportStatus): Promise<void> {
    this.db
      .prepare("UPDATE reports SET status = ? WHERE id = ?")
      .run(status, id);
  }

  async setProgress(
    id: string,
    done: number,
    total: number,
    phase: string,
  ): Promise<void> {
    this.db
      .prepare(
        "UPDATE reports SET progress_done = ?, progress_total = ?, phase = ? WHERE id = ?",
      )
      .run(done, total, phase, id);
  }

  async markDone(id: string, md: string): Promise<void> {
    this.db
      .prepare("UPDATE reports SET status = 'done', md = ? WHERE id = ?")
      .run(md, id);
  }

  async markFailed(id: string, error: string): Promise<void> {
    this.db
      .prepare("UPDATE reports SET status = 'failed', error = ? WHERE id = ?")
      .run(error, id);
  }

  /** date는 UTC "YYYY-MM-DD". created_at ISO 문자열의 접두 일치로 하루를 센다. */
  async countByIpOnDate(ipHash: string, date: string): Promise<number> {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS c FROM reports WHERE ip_hash = ? AND created_at LIKE ?",
      )
      .get(ipHash, `${date}%`) as { c: number };
    return Number(row.c);
  }

  async countOnDate(date: string): Promise<number> {
    const row = this.db
      .prepare("SELECT COUNT(*) AS c FROM reports WHERE created_at LIKE ?")
      .get(`${date}%`) as { c: number };
    return Number(row.c);
  }
}

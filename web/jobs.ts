import type { PanelScreener } from "../src/population/screen.js";
import { executeReport } from "./run-report.js";
import type { ReportStore } from "./store.js";

/** 리포트 1건 생성 러너 — 실제 구현은 pipeline.ts, 테스트는 fake 주입. */
export type ReportRunner = (
  question: string,
  choices: string[],
  onProgress: (done: number, total: number, phase: string) => void,
  screener?: PanelScreener,
) => Promise<string>;

export interface JobEvent {
  type: "progress" | "done" | "error";
  done?: number;
  total?: number;
  phase?: string;
  error?: string;
}

type Listener = (e: JobEvent) => void;

/**
 * 인프로세스 잡 큐. 동시 실행을 제한해 호스팅 키의 rate limit을 보호한다.
 * 잡 지속성 없음(v1) — 서버 재시작 시 running/queued는 유실된다.
 */
export class JobQueue {
  private queue: string[] = [];
  private active = 0;
  private listeners = new Map<string, Set<Listener>>();
  private idleResolvers: Array<() => void> = [];

  constructor(
    private store: ReportStore,
    private runner: ReportRunner,
    private opts: { concurrency: number },
  ) {}

  subscribe(id: string, fn: Listener): () => void {
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  private emit(id: string, e: JobEvent): void {
    for (const fn of this.listeners.get(id) ?? []) fn(e);
  }

  enqueue(id: string): void {
    this.queue.push(id);
    this.pump();
  }

  /** 테스트/종료용: 큐와 실행 중 잡이 모두 빌 때까지 대기. */
  idle(): Promise<void> {
    if (this.queue.length === 0 && this.active === 0) return Promise.resolve();
    return new Promise((r) => this.idleResolvers.push(r));
  }

  private pump(): void {
    while (this.active < this.opts.concurrency && this.queue.length > 0) {
      const id = this.queue.shift();
      if (id == null) break;
      this.active++;
      void this.run(id).finally(() => {
        this.active--;
        this.pump();
        if (this.queue.length === 0 && this.active === 0) {
          for (const r of this.idleResolvers.splice(0)) r();
        }
      });
    }
  }

  private async run(id: string): Promise<void> {
    try {
      await executeReport(this.store, id, this.runner, (e) => this.emit(id, e));
    } finally {
      this.listeners.delete(id);
    }
  }
}

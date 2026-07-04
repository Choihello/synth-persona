import type { ReportRunner } from "./jobs.js";
import type { ReportStore } from "./store.js";

/**
 * 리포트 1건 실행: 상태 전이(running→done|failed) + 진행률 DB 기록(5단위
 * 스로틀). 호출 컨텍스트 중립 — 로컬 JobQueue와 Vercel after() 양쪽에서 쓴다.
 * 진행 이벤트가 추가로 필요하면 onEvent로 구독(옵셔널).
 */
export async function executeReport(
  store: ReportStore,
  id: string,
  runner: ReportRunner,
  onEvent?: (e: {
    type: "progress" | "done" | "error";
    done?: number;
    total?: number;
    phase?: string;
    error?: string;
  }) => void,
): Promise<void> {
  const row = await store.get(id);
  if (!row) return;
  await store.setStatus(id, "running");
  try {
    const md = await runner(row.question, row.choices, (d, t, phase) => {
      onEvent?.({ type: "progress", done: d, total: t, phase });
      if (d % 5 === 0 || d === t) {
        void store.setProgress(id, d, t, phase);
      }
    });
    await store.markDone(id, md);
    onEvent?.({ type: "done" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await store.markFailed(id, msg);
    onEvent?.({ type: "error", error: msg });
  }
}

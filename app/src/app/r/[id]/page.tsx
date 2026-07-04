import { marked } from "marked";
import Link from "next/link";
import { getStore } from "../../../lib/backend.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ⚠️ 스타일 미적용 스켈레톤 — UI 디자인은 별도 논의 후 적용한다.
export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getStore().get(id);

  if (!row) {
    return (
      <main>
        <h1>리포트를 찾을 수 없습니다</h1>
        <Link href="/">← 새 리포트 만들기</Link>
      </main>
    );
  }
  if (row.status === "failed") {
    return (
      <main>
        <h1>생성 실패</h1>
        <p style={{ color: "crimson" }}>{row.error}</p>
        <Link href="/">← 다시 시도</Link>
      </main>
    );
  }
  if (row.status !== "done" || !row.md) {
    return (
      <main>
        <h1>리포트 생성 중…</h1>
        <p>
          합성 패널이 응답하는 중입니다 (약 1분). 잠시 후 새로고침해 주세요.
        </p>
        <meta httpEquiv="refresh" content="4" />
      </main>
    );
  }

  const html = marked.parse(row.md, { async: false });
  return (
    <main>
      <p>
        <Link href="/">← 새 리포트 만들기</Link>
      </p>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 입력은 서버에서 이스케이프됨 + 자체 렌더러 출력 */}
      <article dangerouslySetInnerHTML={{ __html: html }} />
      <hr />
      <p>
        <small>
          이 리포트는 gpt-4o-mini 합성 패널 n=90 기반의 synthetic panel
          response입니다 — 실제 시장 반응이 아닙니다.
        </small>
      </p>
    </main>
  );
}

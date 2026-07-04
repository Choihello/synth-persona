import { marked } from "marked";
import type { Metadata } from "next";
import Link from "next/link";
import { getStore } from "../../../lib/backend.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const row = await getStore().get(id);
  // 저장된 question은 서버에서 이스케이프됨 — 메타에는 엔티티를 되돌려 노출
  const q = row?.question
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
  return {
    title: q ? `${q} — 0차 시장검증 리포트` : "0차 시장검증 리포트",
    description:
      "통계청 합성 패널 90명의 응답을 세그먼트 분석·신뢰도 카드·다음 행동 처방으로 번역한 리포트",
  };
}

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
        <p className="backlink">
          <Link href="/">← 새 리포트 만들기</Link>
        </p>
      </main>
    );
  }
  if (row.status === "failed") {
    return (
      <main>
        <h1>생성 실패</h1>
        <p className="error-text">{row.error}</p>
        <p className="backlink">
          <Link href="/">← 다시 시도</Link>
        </p>
      </main>
    );
  }
  if (row.status !== "done" || !row.md) {
    return (
      <main>
        <h1>리포트 생성 중…</h1>
        <p className="lede">
          합성 패널이 응답하는 중입니다 (약 1분). 이 페이지는 자동으로
          새로고침됩니다.
        </p>
        <meta httpEquiv="refresh" content="4" />
      </main>
    );
  }

  const html = marked.parse(row.md, { async: false });
  return (
    <main>
      <p className="backlink">
        <Link href="/">← 새 리포트 만들기</Link>
      </p>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 입력은 서버에서 이스케이프됨 + 자체 렌더러/차트 출력 */}
      <article className="report" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import type { ReportRow } from "../../../../web/store.js";
import { getStore } from "../../lib/backend.js";
import { unescapeHtml } from "../../lib/html.js";
import ReportForm from "../report-form.js";

export const metadata: Metadata = {
  title: "새 리포트 만들기 — synth-persona",
};

// 갤러리(GALLERY_IDS)가 DB를 읽으므로 시간 기반 재검증 — 홈은 정적 유지
export const revalidate = 3600;

async function loadGallery(): Promise<{ id: string; question: string }[]> {
  const ids = (process.env.GALLERY_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return [];
  const store = getStore();
  const rows = await Promise.all(ids.map((id) => store.get(id)));
  return rows
    .filter((r): r is ReportRow => r?.status === "done")
    .map((r) => ({ id: r.id, question: unescapeHtml(r.question) }));
}

export default async function NewReportPage() {
  const gallery = await loadGallery();

  return (
    <main>
      <h1>
        아이디어를 검증하기 전에,
        <br />
        합성 패널에게 먼저 물어보세요
      </h1>
      <p className="lede">
        질문 하나를 입력하면 통계청 인구총조사 분포로 구성된 합성 패널 60명이 각
        3회(총 180응답, gpt-4o-mini) 응답하고, 세그먼트 분석·신뢰도 카드·다음 행동
        처방이 담긴 리포트로 번역해 드립니다.
      </p>
      <div className="disclaimer">
        ⚠️ 결과는 <strong>synthetic panel response</strong>(가상 패널 응답)이며
        실제 시장 반응·구매율이 아닙니다 — 고객 인터뷰 전에 가설을 탐색하는
        용도입니다.
      </div>
      <p className="lede" style={{ fontSize: "0.85em" }}>
        이 페이지는 오픈소스 프로젝트{" "}
        <a href="https://github.com/Choihello/synth-persona">synth-persona</a>의
        라이브 데모입니다 — 자기 API 키로 직접 실행하면 횟수 제한이 없습니다.
      </p>

      <ReportForm />

      {gallery.length > 0 && (
        <section className="gallery">
          <h2>샘플 리포트</h2>
          <ul>
            {gallery.map((g) => (
              <li key={g.id}>
                <Link href={`/r/${g.id}`}>{g.question}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

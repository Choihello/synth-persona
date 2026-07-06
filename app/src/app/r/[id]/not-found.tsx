import Link from "next/link";

export default function ReportNotFound() {
  return (
    <main>
      <h1>리포트를 찾을 수 없습니다</h1>
      <p className="backlink">
        <Link href="/new">← 새 리포트 만들기</Link>
      </p>
    </main>
  );
}

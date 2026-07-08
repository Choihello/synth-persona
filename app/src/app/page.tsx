import Link from "next/link";

/** 랜딩 — 신문 1면. 정적 마크업만, DB 접근 없음 (항상 즉시 뜨고 깨지지 않는다). */
export default function Landing() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <p className="landing-kicker">오픈소스 합성 패널 엔진 · 라이브 데모</p>
        <h1 className="landing-headline">
          진짜 고객을 만나기 전,
          <br />
          <span className="landing-underline">가짜 60명</span>에게 먼저
          물어보세요
        </h1>
        <p className="landing-sub">
          통계청 인구 분포를 흉내 낸 합성 패널 — 실제 여론이 아니라서, 오히려
          솔직하게 쓸 수 있습니다
        </p>
        <div className="landing-cta-row">
          <Link className="landing-cta" href="/new">
            리포트 만들기 — 약 2분
          </Link>
          <Link className="landing-sample-link" href="/r/2khi1bDwJ4">
            샘플 리포트 보기 →
          </Link>
          <a
            className="landing-sample-link"
            href="https://github.com/Choihello/synth-persona"
          >
            GitHub에서 코드 보기 →
          </a>
        </div>
      </section>

      <section className="landing-cards" aria-label="예시 리포트 미리보기">
        <Link href="/r/2khi1bDwJ4" className="landing-report-card">
          <span className="landing-card-label">예시 리포트</span>
          <p className="landing-card-kicker">한눈에 보기</p>
          <p className="landing-card-verdict">반응이 갈렸어요</p>
          <p className="landing-card-num">
            60명 중 11명<span>이 "온라인 배송"</span>
          </p>
          <span className="landing-bar" aria-hidden="true">
            <i style={{ width: "18%" }} />
            <em />
          </span>
          <span className="landing-card-basis">가상 응답 180개 기준</span>
        </Link>
        <Link href="/r/2khi1bDwJ4" className="landing-report-card">
          <span className="landing-card-label">예시 리포트</span>
          <p className="landing-card-kicker">기회 세그먼트</p>
          <p className="landing-card-verdict">지역에서 뚜렷하게 갈렸어요</p>
          <p className="landing-card-num">
            34.3%<span>수도권 긍정 · 비수도권 6.2%</span>
          </p>
          <span className="landing-bar" aria-hidden="true">
            <i style={{ width: "34%" }} />
            <em />
          </span>
          <span className="landing-card-basis">합성 패널 응답 기준</span>
        </Link>
      </section>

      <section className="landing-how">
        <h2>작동 방식</h2>
        <ol>
          <li>
            <span className="landing-step-num">1</span>
            <h3>질문을 입력합니다</h3>
            <p>선택지 2~4개, 200자 이내 — 첫 번째 선택지가 긍정 방향입니다.</p>
          </li>
          <li>
            <span className="landing-step-num">2</span>
            <h3>합성 패널 60명이 응답합니다</h3>
            <p>
              통계청 인구총조사 분포로 구성된 가상 패널 60명이 각각 3번씩, 총
              180번 약 2분간 응답합니다.
            </p>
          </li>
          <li>
            <span className="landing-step-num">3</span>
            <h3>리포트와 공유 링크를 받습니다</h3>
            <p>
              쉬운 요약, 세그먼트 분석, 다음 행동 처방이 담긴 리포트가
              생성됩니다.
            </p>
          </li>
        </ol>
      </section>

      <section className="landing-honest">
        <h2>이 서비스가 하지 않는 것</h2>
        <ul>
          <li>
            <strong>실제 여론조사가 아닙니다</strong> — AI가 인구 구성을 흉내 내
            답한 결과입니다.
          </li>
          <li>
            <strong>고객 인터뷰를 대체하지 않습니다</strong> — 인터뷰 전에
            가설을 좁히는 용도입니다.
          </li>
          <li>
            <strong>수치는 방향 신호입니다</strong> — 실제 시장 반응·구매율이
            아닙니다.
          </li>
        </ul>
      </section>

      <section className="landing-bottom">
        <Link className="landing-cta" href="/new">
          리포트 만들기 — 약 2분
        </Link>
        <p className="landing-bottom-note">
          오픈소스 데모 · IP당 하루 1회 — 무제한은{" "}
          <a href="https://github.com/Choihello/synth-persona">
            자기 키로 직접 실행
          </a>
        </p>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://synth-persona-app.vercel.app"),
  title: "synth-persona — 오픈소스 합성 패널 엔진",
  description:
    "통계청 분포 기반 합성 패널 60명(각 3회·총 180응답)에게 질문을 던지는 오픈소스 엔진의 라이브 데모 — 세그먼트 유의성 게이트·쉬운 요약 리포트",
};

/** 외부 이동 아이콘 — 접근성 이름은 링크의 aria-label이 전달한다(가이드 §5-4). */
function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="shell">
          <header className="masthead">
            <Link href="/">
              <span className="wordmark">synth-persona</span>
            </Link>
            <a
              className="family-link"
              href="https://founder-hub.fly.dev"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="FounderSteps — 별도 서비스, 새 창에서 열림"
            >
              FounderSteps
              <ExternalIcon />
            </a>
          </header>
          {children}
          <footer className="colophon">
            <p className="colophon-family">
              같은 사람이 만든 별도 서비스:
              <a
                className="family-link"
                href="https://founder-hub.fly.dev"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="FounderSteps — 별도 서비스, 새 창에서 열림"
              >
                FounderSteps
                <ExternalIcon />
              </a>
              <a
                className="family-link"
                href="https://plan-lint-web.fly.dev"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="plan-lint — 별도 서비스, 새 창에서 열림"
              >
                plan-lint
                <ExternalIcon />
              </a>
            </p>
            <p className="colophon-legal">
              통계청 인구총조사 분포 기반 합성 패널 · 결과는 실제 시장 반응이
              아닌 탐색 신호입니다 · 오픈소스 (MIT) ·{" "}
              <a href="https://github.com/Choihello/synth-persona">GitHub</a> ·
              서사:{" "}
              <a href="https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea">
                Nemotron-Personas-Korea
              </a>{" "}
              (CC BY 4.0)
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}

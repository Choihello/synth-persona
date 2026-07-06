import type { Metadata } from "next";
import { Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

const serif = Noto_Serif_KR({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-serif",
});

const sans = Noto_Sans_KR({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://synth-persona-app.vercel.app"),
  title: "synth-persona — 오픈소스 합성 패널 엔진",
  description:
    "통계청 분포 기반 합성 패널 90명에게 질문을 던지는 오픈소스 엔진의 라이브 데모 — 세그먼트 유의성 게이트·쉬운 요약 리포트",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <div className="shell">
          <header className="masthead">
            <Link href="/">
              <span className="wordmark">synth-persona</span>
            </Link>
            <span className="tag">오픈소스 합성 패널 · 라이브 데모</span>
          </header>
          {children}
          <footer className="colophon">
            통계청 인구총조사 분포 기반 합성 패널 · 결과는 실제 시장 반응이 아닌
            탐색 신호입니다 · 오픈소스 (MIT) ·{" "}
            <a href="https://github.com/Choihello/synth-persona">GitHub</a> ·
            서사:{" "}
            <a href="https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea">
              Nemotron-Personas-Korea
            </a>{" "}
            (CC BY 4.0)
          </footer>
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "synth-persona — 0차 시장검증",
  description:
    "질문 하나로 통계청 합성 패널의 반응을 받아보는 0차 시장검증 리포트",
};

// ⚠️ 스타일 미적용 스켈레톤 — UI 디자인은 별도 논의 후 적용한다.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
        {children}
      </body>
    </html>
  );
}

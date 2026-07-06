import { ImageResponse } from "next/og";
import { loadNotoSerifKR } from "../lib/og-font.js";

// 사이트 기본 OG (랜딩·/new) — r/[id]는 자체 동적 OG가 우선한다.
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "synth-persona — 진짜 고객을 만나기 전, 가짜 90명에게 먼저 물어보세요";

const CREAM = "#faf6ef";
const INK = "#1f1d1a";
const INK_MUTED = "#6b675e";
const ACCENT = "#2a78d6";
const HAIRLINE = "rgba(31,29,26,0.18)";

const KICKER = "오픈소스 합성 패널 엔진 · 라이브 데모";
const LINE1 = "진짜 고객을 만나기 전,";
const UNDERLINED = "가짜 90명";
const LINE2_REST = "에게 먼저 물어보세요";
const FOOT = "가상 패널 응답 — 실제 여론이 아닙니다";

export default async function OgImage() {
  const glyphs = [
    ...new Set(
      `synth·persona ${KICKER}${LINE1}${UNDERLINED}${LINE2_REST}${FOOT}`.split(
        "",
      ),
    ),
  ].join("");
  const [serif700, serif400] = await Promise.all([
    loadNotoSerifKR(glyphs, 700),
    loadNotoSerifKR(glyphs, 400),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: CREAM,
        color: INK,
        padding: "56px 72px 48px",
        fontFamily: "NotoSerifKR",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderBottom: `2px solid ${INK}`,
          paddingBottom: 18,
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 700 }}>synth·persona</div>
        <div style={{ fontSize: 20, fontWeight: 400, color: INK_MUTED }}>
          가짜 90명에게 먼저 물어보세요
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flexGrow: 1,
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 21,
            fontWeight: 400,
            color: INK_MUTED,
            letterSpacing: "0.14em",
            marginBottom: 22,
          }}
        >
          {KICKER}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 62,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
          }}
        >
          {LINE1}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: 62,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
          }}
        >
          <span
            style={{
              borderBottom: `4px solid ${ACCENT}`,
              paddingBottom: 4,
            }}
          >
            {UNDERLINED}
          </span>
          <span>{LINE2_REST}</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          borderTop: `1px solid ${HAIRLINE}`,
          paddingTop: 16,
          fontSize: 18,
          fontWeight: 400,
          color: INK_MUTED,
        }}
      >
        {FOOT}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "NotoSerifKR", data: serif700, weight: 700 },
        { name: "NotoSerifKR", data: serif400, weight: 400 },
      ],
    },
  );
}

import { ImageResponse } from "next/og";
import { extractOgStats } from "../../../../../web/og-stats.js";
import { getStore } from "../../../lib/backend.js";
import { unescapeHtml } from "../../../lib/html.js";
import { loadNotoSerifKR } from "../../../lib/og-font.js";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "0차 시장검증 리포트 — synth-persona";

// charts.ts와 동일한 검증 팔레트 (크림 서피스 대비 ALL PASS)
const CREAM = "#faf6ef";
const INK = "#1f1d1a";
const INK_MUTED = "#6b675e";
const POSITIVE = "#2a78d6";
const NEGATIVE = "#e34948";
const HAIRLINE = "rgba(31,29,26,0.18)";

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getStore().get(id);

  const question = row ? unescapeHtml(row.question) : "0차 시장검증 리포트";
  const stats = row?.md ? extractOgStats(row.md) : undefined;

  let bar: { posLabel: string; posPct: number; negLabel: string } | undefined;
  if (stats && stats.dist.length > 0) {
    const total = stats.dist.reduce((sum, [, c]) => sum + c, 0);
    if (total > 0) {
      const [posLabel, pos] = stats.dist[0];
      bar = {
        posLabel: unescapeHtml(posLabel),
        posPct: Math.round((100 * pos) / total),
        negLabel: stats.dist
          .slice(1)
          .map(([l]) => unescapeHtml(l))
          .join("·"),
      };
    }
  }

  const fixed =
    "synth-persona 0차 시장검증·리포트 가상 패널 응답 — 실제 여론이 아닙니다 합성이 응답하는 중 질문을 입력하면 60명 n=%()0123456789";
  const glyphs = [
    ...new Set(
      (question + fixed + (bar ? bar.posLabel + bar.negLabel : "")).split(""),
    ),
  ].join("");
  const [serif700, serif400] = await Promise.all([
    loadNotoSerifKR(glyphs, 700),
    loadNotoSerifKR(glyphs, 400),
  ]);

  const headline =
    question.length > 90 ? `${question.slice(0, 90)}…` : question;

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
      {/* masthead */}
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
          0차 시장검증 리포트
        </div>
      </div>

      {/* headline */}
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          alignItems: "center",
          fontSize: headline.length > 40 ? 52 : 62,
          fontWeight: 700,
          lineHeight: 1.3,
          letterSpacing: "-0.01em",
        }}
      >
        {headline}
      </div>

      {/* key numbers */}
      {bar ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 26,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                width: `${bar.posPct}%`,
                backgroundColor: POSITIVE,
                borderRadius: 5,
                marginRight: 3,
              }}
            />
            <div
              style={{
                flexGrow: 1,
                backgroundColor: NEGATIVE,
                borderRadius: 5,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 26,
              fontWeight: 400,
            }}
          >
            <div style={{ display: "flex" }}>
              {`${bar.posLabel} ${bar.posPct}%`}
            </div>
            <div style={{ display: "flex", color: INK_MUTED }}>
              {`${bar.negLabel} ${100 - bar.posPct}% · n=${stats?.n}`}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", fontSize: 26, color: INK_MUTED }}>
          {row
            ? "합성 패널이 응답하는 중"
            : "질문을 입력하면 합성 패널 60명이 응답합니다"}
        </div>
      )}

      {/* colophon */}
      <div
        style={{
          display: "flex",
          borderTop: `1px solid ${HAIRLINE}`,
          marginTop: 28,
          paddingTop: 16,
          fontSize: 18,
          fontWeight: 400,
          color: INK_MUTED,
        }}
      >
        가상 패널 응답 — 실제 여론이 아닙니다
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

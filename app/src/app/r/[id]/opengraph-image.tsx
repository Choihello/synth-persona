import { ImageResponse } from "next/og";
import { screenerLabel } from "../../../../../src/population/screen.js";
import { extractOgStats } from "../../../../../web/og-stats.js";
import { getStore } from "../../../lib/backend.js";
import { unescapeHtml } from "../../../lib/html.js";
import { loadNotoSerifKR } from "../../../lib/og-font.js";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "0차 시장검증 리포트 — synth-persona";

// FounderSteps 패밀리 토큰(docs/DESIGN-GUIDE.md §2)의 라이트 값.
// 공유 카드는 테마를 따라가지 않으므로 라이트 고정.
const CREAM = "#f2f4f6"; // --bg (패밀리 시그니처인 조용한 회색 층)
const INK = "#191f28"; // --text
const INK_MUTED = "#4e5968"; // --text-muted
const HAIRLINE = "#d1d6db"; // --border-strong
// 막대는 리포트 본문 차트(web/charts.ts)와 같은 값이어야 같은 데이터로 읽힌다.
const POSITIVE = "#2a78d6";
const NEGATIVE = "#e34948";

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getStore().get(id);

  const question = row ? unescapeHtml(row.question) : "0차 시장검증 리포트";
  const stats = row?.md ? extractOgStats(row.md) : undefined;
  const panelLabel = row?.screener ? screenerLabel(row.screener) : undefined;

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
      (
        question +
        fixed +
        (panelLabel ?? "") +
        (bar ? bar.posLabel + bar.negLabel : "")
      ).split(""),
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
          borderBottom: `1px solid ${HAIRLINE}`,
          paddingBottom: 18,
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 700 }}>synth·persona</div>
        {panelLabel ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              fontSize: 20,
              fontWeight: 400,
              color: INK_MUTED,
            }}
          >
            <div style={{ display: "flex" }}>0차 시장검증 리포트</div>
            <div style={{ display: "flex", fontSize: 16 }}>
              대상: {panelLabel}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 20, fontWeight: 400, color: INK_MUTED }}>
            0차 시장검증 리포트
          </div>
        )}
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

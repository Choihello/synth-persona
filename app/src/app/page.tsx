"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// ⚠️ 스타일 미적용 스켈레톤 — UI 디자인은 별도 논의 후 적용한다.
export default function Home() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [choices, setChoices] = useState("쓴다,안쓴다");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: question.trim(),
        choices: choices
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "요청 실패");
      setBusy(false);
      return;
    }
    const { id } = (await res.json()) as { id: string };
    timer.current = setInterval(async () => {
      const r = await fetch(`/api/reports/${id}`);
      if (!r.ok) return;
      const s = (await r.json()) as {
        status: string;
        error?: string;
        done?: number;
        total?: number;
        phase?: string;
      };
      if (s.done != null && s.total != null) {
        setPct(Math.round((100 * s.done) / s.total));
        setPhase(`${s.phase ?? "진행"} ${s.done}/${s.total}`);
      }
      if (s.status === "done") {
        if (timer.current) clearInterval(timer.current);
        router.push(`/r/${id}`);
      }
      if (s.status === "failed") {
        if (timer.current) clearInterval(timer.current);
        setError(`생성 실패: ${s.error ?? ""}`);
        setBusy(false);
      }
    }, 2500);
  }

  return (
    <main>
      <h1>0차 시장검증 리포트</h1>
      <p>
        아이디어 질문 하나를 입력하면, 통계청 인구총조사 분포로 구성된 합성 패널
        90명이 응답하고 그 결과를 리포트로 번역합니다.
      </p>
      <blockquote>
        ⚠️ 결과는 synthetic panel response(가상 패널 응답)이며 실제 시장
        반응·구매율이 아닙니다.
      </blockquote>
      <form onSubmit={submit}>
        <p>
          <label>
            질문 (200자 이내)
            <br />
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              maxLength={200}
              required
              style={{ width: "100%" }}
              placeholder="예: 신선식품 새벽배송 구독, 월 9900원에 쓸 의향?"
            />
          </label>
        </p>
        <p>
          <label>
            선택지 (쉼표 구분, 2~4개 — 첫 번째가 긍정 방향)
            <br />
            <input
              value={choices}
              onChange={(e) => setChoices(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </label>
        </p>
        <button type="submit" disabled={busy}>
          {busy ? "생성 중…" : "리포트 생성 (약 1분)"}
        </button>{" "}
        <small>무료 · IP당 하루 3회</small>
      </form>
      {busy && (
        <div>
          <p>{phase || "대기 중…"}</p>
          <progress value={pct} max={100} style={{ width: "100%" }} />
          <p>
            <small>페이지를 닫지 마세요 (약 1분).</small>
          </p>
        </div>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}

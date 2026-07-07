"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function ReportForm() {
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
    setPct(0);
    setPhase("");
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
        setPhase(`${s.phase ?? "진행"} — ${s.done}/${s.total}`);
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
    <>
      <form className="card" onSubmit={submit}>
        <label className="field">
          <span>질문 (200자 이내)</span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            maxLength={200}
            required
            placeholder="예: 신선식품 새벽배송 구독, 월 9900원에 쓸 의향?"
          />
        </label>
        <label className="field">
          <span>선택지 (쉼표 구분, 2~4개 — 첫 번째가 긍정 방향)</span>
          <input
            type="text"
            value={choices}
            onChange={(e) => setChoices(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "생성 중…" : "리포트 생성 — 약 2분"}
        </button>
        <span className="hint">무료 · IP당 하루 1회</span>
      </form>

      {busy && (
        <div className="progress-panel" aria-live="polite">
          <p className="progress-phase">{phase || "합성 패널 구성 중…"}</p>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="progress-note">
            합성 패널 60명이 응답하는 중입니다 — 페이지를 닫지 마세요 (약 2분).
          </p>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </>
  );
}

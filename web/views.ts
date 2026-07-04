export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; }
body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; line-height: 1.65; }
h1, h2, h3 { line-height: 1.3; }
blockquote { border-left: 4px solid #e0a800; margin: 0; padding: 4px 16px; background: rgba(224,168,0,.08); }
table { border-collapse: collapse; width: 100%; overflow-x: auto; display: block; }
th, td { border: 1px solid #8884; padding: 6px 10px; text-align: left; }
textarea, input[type=text] { width: 100%; box-sizing: border-box; padding: 10px; font-size: 16px; border: 1px solid #8886; border-radius: 8px; }
button { padding: 12px 20px; font-size: 16px; border-radius: 8px; border: 0; background: #2563eb; color: #fff; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.muted { color: #888; font-size: 14px; }
#progress { display: none; margin-top: 24px; }
.bar { height: 8px; background: #8883; border-radius: 4px; overflow: hidden; }
.bar > div { height: 100%; width: 0%; background: #2563eb; transition: width .4s; }
.error { color: #dc2626; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function homePage(): string {
  return layout(
    "synth-persona — 0차 시장검증",
    `<h1>0차 시장검증 리포트</h1>
<p>아이디어 질문 하나를 입력하면, 통계청 인구총조사 분포로 구성된 <strong>합성 패널 90명</strong>(gpt-4o-mini)이 응답하고, 그 결과를 세그먼트 분석·신뢰도 카드·다음 행동 처방이 담긴 리포트로 번역합니다.</p>
<blockquote>⚠️ 결과는 <strong>synthetic panel response</strong>(가상 패널 응답)이며 실제 시장 반응·구매율이 아닙니다 — 인터뷰 전에 가설을 탐색하는 용도입니다.</blockquote>
<form id="f">
  <p><label>질문 (200자 이내)<br>
    <textarea id="question" name="question" rows="2" maxlength="200" placeholder="예: 신선식품 새벽배송 구독, 월 9900원에 쓸 의향?" required></textarea>
  </label></p>
  <p><label>선택지 (쉼표 구분, 2~4개 — 첫 번째가 긍정 방향)<br>
    <input type="text" id="choices" name="choices" value="쓴다,안쓴다" required>
  </label></p>
  <button id="go" type="submit">리포트 생성 (약 1분)</button>
  <span class="muted">무료 · IP당 하루 3회</span>
</form>
<div id="progress">
  <p id="phase">대기 중…</p>
  <div class="bar"><div id="fill"></div></div>
  <p class="muted">합성 패널 90명이 응답하는 중입니다 — 페이지를 닫지 마세요 (약 1분).</p>
</div>
<p id="err" class="error"></p>
<script>
const f = document.getElementById("f");
f.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  document.getElementById("err").textContent = "";
  document.getElementById("go").disabled = true;
  const body = {
    question: document.getElementById("question").value.trim(),
    choices: document.getElementById("choices").value.split(",").map(s => s.trim()).filter(Boolean),
  };
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: "요청 실패" }));
    document.getElementById("err").textContent = error;
    document.getElementById("go").disabled = false;
    return;
  }
  const { id } = await res.json();
  document.getElementById("progress").style.display = "block";
  watch(id);
});

function watch(id) {
  let gotEvent = false;
  const es = new EventSource("/api/reports/" + id + "/events");
  es.onmessage = (m) => {
    gotEvent = true;
    const e = JSON.parse(m.data);
    if (e.type === "progress") {
      document.getElementById("phase").textContent = (e.phase || "진행") + " " + e.done + "/" + e.total;
      document.getElementById("fill").style.width = Math.round(100 * e.done / e.total) + "%";
    } else if (e.type === "done") { es.close(); location.href = "/r/" + id; }
    else if (e.type === "error") {
      es.close();
      document.getElementById("err").textContent = "생성 실패: " + (e.error || "");
      document.getElementById("go").disabled = false;
    }
  };
  es.onerror = () => { es.close(); poll(id); };
  // SSE가 오래 조용하면 폴링 폴백
  setTimeout(() => { if (!gotEvent) { es.close(); poll(id); } }, 8000);
}

async function poll(id) {
  const t = setInterval(async () => {
    const r = await fetch("/api/reports/" + id);
    if (!r.ok) return;
    const s = await r.json();
    if (s.status === "done") { clearInterval(t); location.href = "/r/" + id; }
    if (s.status === "failed") {
      clearInterval(t);
      document.getElementById("err").textContent = "생성 실패: " + (s.error || "");
      document.getElementById("go").disabled = false;
    }
  }, 3000);
}
</script>`,
  );
}

export function pendingPage(id: string): string {
  return layout(
    "리포트 생성 중…",
    `<h1>리포트 생성 중…</h1>
<p>합성 패널이 응답하는 중입니다 (약 1분). 이 페이지는 자동으로 새로고침됩니다.</p>
<script>setInterval(async () => {
  const r = await fetch("/api/reports/${escapeHtml(id)}");
  if (r.ok) { const s = await r.json(); if (s.status === "done" || s.status === "failed") location.reload(); }
}, 3000)</script>`,
  );
}

export function failedPage(error: string): string {
  return layout(
    "리포트 생성 실패",
    `<h1>생성 실패</h1><p class="error">${escapeHtml(error)}</p><p><a href="/">← 다시 시도</a></p>`,
  );
}

export function reportPage(reportHtml: string, meta: { n: number }): string {
  return layout(
    "0차 시장검증 리포트 — synth-persona",
    `<p><a href="/">← 새 리포트 만들기</a></p>
${reportHtml}
<hr>
<p class="muted">이 리포트는 gpt-4o-mini 합성 패널 n=${meta.n} 기반의 synthetic panel response입니다 — 실제 시장 반응이 아닙니다. <a href="https://github.com/Choihello/synth-persona">synth-persona</a>로 생성.</p>`,
  );
}

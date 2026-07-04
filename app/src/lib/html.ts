/** 저장 시 escapeHtml된 텍스트를 표시용으로 되돌린다 (React가 다시 이스케이프). */
export function unescapeHtml(s: string): string {
  return s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

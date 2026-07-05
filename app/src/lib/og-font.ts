/** Google Fonts css2 text= 서브셋에서 TTF를 받아온다 (satori는 폰트 필수). */
export async function loadNotoSerifKR(
  text: string,
  weight: 400 | 700,
): Promise<ArrayBuffer> {
  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@${weight}&text=${encodeURIComponent(text)}`,
      {
        // 구형 UA로 요청해야 woff2 대신 satori가 읽는 TTF/OTF가 온다
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
        },
      },
    )
  ).text();
  const m = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  if (!m) throw new Error("OG font subset fetch failed");
  return (await fetch(m[1])).arrayBuffer();
}

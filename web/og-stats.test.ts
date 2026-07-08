import { describe, expect, it, test } from "vitest";
import { extractOgStats } from "./og-stats.js";

const SAMPLE_MD = `# 컨셉 — 0차 시장검증 리포트

> ⚠️ disclaimer

## 전체 신호

<svg viewBox="0 0 640 64" width="100%" role="img" aria-label="전체 응답 분포: 찬성 87%, 반대·유보 13%" xmlns="http://www.w3.org/2000/svg"></svg>

- 🟢 consensus(합의) · 응답 분포: 찬성=78, 반대=4, 유보=8
- n=90 · seed=999846 · provider=web · 누락률 0.0%

## 기회 세그먼트

### 연령=45~49세  (n=18 · 긍정 100.0% · 신뢰도 high)
- 분포: 찬성=18 · 인구 가중 비율 ≈ 13.0%
`;

describe("extractOgStats", () => {
  test("전체 신호의 응답 분포와 n을 추출한다", () => {
    const s = extractOgStats(SAMPLE_MD);
    expect(s).toEqual({
      n: 90,
      dist: [
        ["찬성", 78],
        ["반대", 4],
        ["유보", 8],
      ],
    });
  });

  test("세그먼트의 '분포:' 줄에는 걸리지 않는다 (응답 분포만)", () => {
    const md = "- 분포: 찬성=18 · 인구 가중 비율 ≈ 13.0%\n";
    expect(extractOgStats(md)).toBeUndefined();
  });

  test("n= 줄이 없으면 분포 합계를 n으로 쓴다", () => {
    const md = "- 🟢 consensus(합의) · 응답 분포: A=3, B=7\n";
    expect(extractOgStats(md)).toEqual({
      n: 10,
      dist: [
        ["A", 3],
        ["B", 7],
      ],
    });
  });

  test("분포가 없으면 undefined", () => {
    expect(extractOgStats("# 제목\n본문")).toBeUndefined();
    expect(extractOgStats("")).toBeUndefined();
  });

  it("표본 N명 줄에서도 n(응답 수)을 파싱한다", () => {
    const md = [
      "- 🟢 consensus(합의) · 응답 분포: 쓴다=19, 안쓴다=161",
      "- 표본 60명 · 각 3회 응답(총 180) · seed=7 · 누락률 0.0%",
    ].join("\n");
    const stats = extractOgStats(md);
    expect(stats?.n).toBe(180);
    expect(stats?.dist[0]).toEqual(["쓴다", 19]);
  });

  test("라벨에 =가 들어가도 마지막 =를 기준으로 나눈다", () => {
    const md = "- 🟢 consensus(합의) · 응답 분포: 가격=저렴=5, 보통=15\n";
    expect(extractOgStats(md)?.dist).toEqual([
      ["가격=저렴", 5],
      ["보통", 15],
    ]);
  });

  it("한 줄 요약의 선행 불릿에 오염되지 않는다 (전체 신호 블록에서만 파싱)", () => {
    const md = [
      "## 한 줄 요약",
      "",
      "- 아직 못 하는 것: 가격 · 응답 분포: 미끼=1",
      "",
      "## 전체 신호",
      "",
      "- ● consensus(합의) · 응답 분포: 쓴다=28, 안쓴다=2",
      "- 표본 30명 · 각 3회 응답(총 90) · 누락률 0.0%",
      "",
      "## 기회 세그먼트",
      "",
    ].join("\n");
    const s = extractOgStats(md);
    expect(s?.dist[0]).toEqual(["쓴다", 28]);
    expect(s?.n).toBe(90);
  });

  it("unanimous 리포트의 새 라벨(⚪ 응답 전부 동일)에서도 분포를 파싱한다", () => {
    const md = [
      "## 전체 신호",
      "",
      "- ⚪ 응답 전부 동일 · 응답 분포: 끈다=180",
      "- 표본 60명 · 각 3회 응답(총 180) · 누락률 0.0%",
      "",
    ].join("\n");
    const s = extractOgStats(md);
    expect(s?.n).toBe(180);
    expect(s?.dist).toEqual([["끈다", 180]]);
  });

  it("표본 줄에 '· 대상: …' 접미가 붙어도 n을 그대로 파싱한다", () => {
    const md = [
      "## 전체 신호",
      "",
      "- 🟢 consensus(합의) · 응답 분포: 쓴다=150, 안쓴다=30",
      "- 표본 60명 · 각 3회 응답(총 180) · 대상: 20~39세 · 수도권 · 누락률 0.0%",
      "",
    ].join("\n");
    const s = extractOgStats(md);
    expect(s?.n).toBe(180);
    expect(s?.dist[0]).toEqual(["쓴다", 150]);
  });
});

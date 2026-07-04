import { describe, expect, test } from "vitest";
import { extractOgStats } from "./og-stats.js";

const SAMPLE_MD = `# 컨셉 — 0차 시장검증 리포트

> ⚠️ disclaimer

## 전체 신호

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

  test("라벨에 =가 들어가도 마지막 =를 기준으로 나눈다", () => {
    const md = "- 🟢 consensus(합의) · 응답 분포: 가격=저렴=5, 보통=15\n";
    expect(extractOgStats(md)?.dist).toEqual([
      ["가격=저렴", 5],
      ["보통", 15],
    ]);
  });
});

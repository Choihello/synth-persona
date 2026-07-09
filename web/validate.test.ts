import { describe, expect, test } from "vitest";
import { validateReportInput } from "./validate.js";

const base = { question: "월 9900원에 쓸 의향?", choices: ["쓴다", "안쓴다"] };

describe("validateReportInput — 스크리너", () => {
  test("스크리너 없으면 screener는 undefined (현행)", () => {
    expect(validateReportInput(base).screener).toBeUndefined();
  });

  test("빈 스크리너 객체도 undefined로 접힌다", () => {
    expect(
      validateReportInput({ ...base, screener: {} }).screener,
    ).toBeUndefined();
  });

  test("연령 범위를 census 라벨 목록으로 펼친다", () => {
    const { screener } = validateReportInput({
      ...base,
      screener: { ageMin: "20~24세", ageMax: "35~39세" },
    });
    expect(screener?.연령).toEqual([
      "20~24세",
      "25~29세",
      "30~34세",
      "35~39세",
    ]);
    expect(screener?.지역).toBeUndefined();
  });

  test("지역만 지정해도 된다", () => {
    const { screener } = validateReportInput({
      ...base,
      screener: { region: "수도권" },
    });
    expect(screener).toEqual({ 지역: "수도권" });
  });

  test("연령 + 지역 동시", () => {
    const { screener } = validateReportInput({
      ...base,
      screener: { ageMin: "30~34세", ageMax: "30~34세", region: "비수도권" },
    });
    expect(screener).toEqual({ 연령: ["30~34세"], 지역: "비수도권" });
  });

  test("잘못된 연령 라벨은 거부", () => {
    expect(() =>
      validateReportInput({
        ...base,
        screener: { ageMin: "20대", ageMax: "30~34세" },
      }),
    ).toThrow(/연령 라벨/);
  });

  test("ageMin > ageMax는 거부", () => {
    expect(() =>
      validateReportInput({
        ...base,
        screener: { ageMin: "40~44세", ageMax: "20~24세" },
      }),
    ).toThrow(/시작이 끝보다/);
  });

  test("연령 시작·끝 한쪽만 있으면 거부", () => {
    expect(() =>
      validateReportInput({ ...base, screener: { ageMin: "20~24세" } }),
    ).toThrow(/시작과 끝/);
  });

  test("없는 축(직업)은 거부", () => {
    expect(() =>
      validateReportInput({ ...base, screener: { 직업: "직장인" } }),
    ).toThrow(/없는 축/);
  });

  test("잘못된 지역 값은 거부", () => {
    expect(() =>
      validateReportInput({ ...base, screener: { region: "서울" } }),
    ).toThrow(/수도권/);
  });
});

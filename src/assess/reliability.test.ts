import { describe, expect, test } from "vitest";
import type { Response, StudyResult } from "../types.js";
import { assessReliability } from "./reliability.js";

function resp(
  attrs: Record<string, string>,
  prov: Record<string, string>,
): Response {
  return {
    persona: { id: "p", attrs, weight: 1, provenance: prov as never },
    answer: attrs.choice ?? "쓴다",
    choice: "쓴다",
  };
}

function studyWith(responses: Response[]): StudyResult {
  const dims = new Set<string>();
  for (const r of responses)
    for (const k of Object.keys(r.persona.attrs)) dims.add(k);
  const bySegment: StudyResult["bySegment"] = {};
  for (const d of dims)
    bySegment[d] = { x: { signal: "split", breakdown: { 쓴다: 1 } } };
  return { responses, signal: "split", dispersion: 1, bySegment };
}

describe("assessReliability", () => {
  test("provenance → confidence 매핑 (matched=high, conditioned=medium, inferred=low)", () => {
    const result = studyWith([
      resp(
        { 연령: "30대", 혼인: "미혼", 가구원수: "1명" },
        { 연령: "matched", 혼인: "conditioned", 가구원수: "inferred" },
      ),
    ]);
    const card = assessReliability(result);
    const byDim = Object.fromEntries(
      card.attributes.map((a) => [a.dim, a.confidence]),
    );
    expect(byDim.연령).toBe("high");
    expect(byDim.혼인).toBe("medium");
    expect(byDim.가구원수).toBe("low");
  });

  test("같은 dim에 matched+inferred 섞이면 보수적으로 low (첫 샘플에 끌리지 않음)", () => {
    const result = studyWith([
      resp({ 혼인: "미혼" }, { 혼인: "matched" }),
      resp({ 혼인: "유배우" }, { 혼인: "inferred" }),
    ]);
    const a = assessReliability(result).attributes.find(
      (x) => x.dim === "혼인",
    );
    expect(a?.provenance).toBe("inferred");
    expect(a?.confidence).toBe("low");
  });

  test("같은 dim에 matched+conditioned 섞이면 최소 medium", () => {
    const result = studyWith([
      resp({ 혼인: "미혼" }, { 혼인: "matched" }),
      resp({ 혼인: "유배우" }, { 혼인: "conditioned" }),
    ]);
    const a = assessReliability(result).attributes.find(
      (x) => x.dim === "혼인",
    );
    expect(a?.confidence).toBe("medium");
  });

  test("provenance 없는 페르소나 → unknown", () => {
    const result = studyWith([resp({ age: "30대" }, {})]);
    const card = assessReliability(result);
    expect(card.attributes[0].provenance).toBe("unknown");
    expect(card.attributes[0].confidence).toBe("unknown");
    expect(
      card.guardrails.some((g) => g.includes("provenance 정보가 없습니다")),
    ).toBe(true);
  });

  test("결핍 축 → missingAxes + 가격 가드레일", () => {
    const result = studyWith([resp({ 연령: "30대" }, { 연령: "matched" })]);
    const card = assessReliability(result);
    expect(card.missingAxes).toEqual(["소득", "직업", "자녀"]);
    expect(
      card.guardrails.some((g) => g.includes("가격·구매력 판단 부적합")),
    ).toBe(true);
  });

  test("inferred 속성 → 저확신 가드레일", () => {
    const result = studyWith([
      resp({ 가구원수: "1명" }, { 가구원수: "inferred" }),
    ]);
    const card = assessReliability(result);
    expect(card.guardrails.some((g) => g.includes("저확신 속성"))).toBe(true);
  });

  test("fidelity 주면 1층 composition 채움 (MAE<0.05 → 🟢)", () => {
    const result = studyWith([resp({ 연령: "30대" }, { 연령: "matched" })]);
    const fidelity = {
      core: {
        name: "성×연령×지역",
        provenance: "matched" as const,
        mae: 0,
        tvd: 0,
        maxError: { key: "", expected: 0, actual: 0 },
      },
      conditional: [],
      matched: ["성", "연령", "지역"],
      conditioned: [],
    };
    const card = assessReliability(result, { fidelity });
    expect(card.composition).toEqual({ signal: "🟢", mae: 0, tvd: 0 });
  });

  test("bridges 주면 해당 dim에 note 첨부", () => {
    const result = studyWith([
      resp({ 가구원수: "1명" }, { 가구원수: "conditioned" }),
    ]);
    const card = assessReliability(result, {
      bridges: { 가구원수: "householder_age_as_proxy" },
    });
    const a = card.attributes.find((x) => x.dim === "가구원수");
    expect(a?.note).toBe("bridge:householder_age_as_proxy");
  });

  test("항상 synthetic panel response 가드레일 포함", () => {
    const result = studyWith([resp({ 연령: "30대" }, { 연령: "matched" })]);
    const card = assessReliability(result);
    expect(
      card.guardrails.some((g) => g.includes("synthetic panel response")),
    ).toBe(true);
    expect(card.responseConsistency.status).toBe("not-measured");
  });
});

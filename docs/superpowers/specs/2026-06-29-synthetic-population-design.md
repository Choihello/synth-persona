# 검증된 합성 인구(Synthetic Population) — 설계 문서

> 작성일: 2026-06-29
> 상태: 설계 brainstorming 완료 → 구현 계획(Plan 3A/3B) 대기
> 선행: Plan 1(엔진) · Plan 2A/2B(검증 하네스) · KosisSource 라이브 연동 완료

## 1. 목적과 포지셔닝

단순 "페르소나 생성기"가 아니라 **검증 가능한 합성 인구(synthetic population) 기반 사전 시장조사 도구**로 격상한다. 통계청 다수 교차표를 결합해 인구학적으로 충실한 5축 페르소나 모집단을 만들고, 그 충실도를 원본 대비 숫자로 검증(fidelity 리포트)한다.

### 신뢰성 2층 모델 (이 설계의 토대)
- **1층 — 구성(인구학적) 충실도**: "이 가상 집단이 실제 한국 인구를 닮았나?" → **측정 가능**. 통계청 + 합성 + fidelity 리포트가 담당. 이 문서의 범위.
- **2층 — 응답(추론) 충실도**: "Haiku가 그 사람처럼 답하나?" → 본질적으로 무름, 캘리브레이션(Plan 2A)·🔴/🟢·probes(Plan 2B)로 *경계*. 이 문서 범위 밖(후속 기능점검).

> **정직성 원칙(핵심)**: "IPF로 완전 결합분포를 복원했다"고 말하지 않는다. **matched-core(실제 joint)** 와 **conditioned/estimated(부착·추정)** 변수를 provenance와 fidelity 리포트에 명확히 분리해 드러낸다.

## 2. 확정된 설계 결정

| 항목 | 결정 |
|---|---|
| 프레임 | **개인 단위 respondent + 가구 맥락 부착** |
| MVP 축(5) | 성별 · 연령 · 지역(권역) · 혼인상태 *(개인 4)* + 가구원수 *(가구 맥락 1)* |
| 지역 해상도 | **권역 2구분(수도권/비수도권)** — 시도는 후속(설정 교체로 확장) |
| 생성 방식 | **접근 B: matched-core + 조건부 부착** (전체 IPF joint 아님) |
| 데이터 전달 | **번들 스냅샷(커밋) + 라이브 갱신 스크립트** — 키 없이 재현/테스트/CI 그린 |
| 5번째 축 | 혼인상태(인구총조사, 같은 프레임). 경제활동은 별도 조사라 후속 |

## 3. 데이터 소스 (정찰로 확인된 실재 표)

| 변수 | 프레임 | 통계청 표 | 인코딩 | universe(주의) |
|---|---|---|---|---|
| 성 × 연령 × 지역 | individual | `DT_1IN1509` | C2(성)·C3(연령)·C1(지역) | 전체 인구 |
| 연령 × 혼인 | individual | `DT_1MR2060` | 다축 | 통상 **15세+** |
| 연령 × 가구원수 | householder | `DT_1JC1511` | C2(연령)·ITM(가구원수) | 가구주(가구) |

→ 가진 2/3-way는 **연령 중심 별모양(star)**. 그래서 접근 B가 IPF보다 적합.

## 4. 생성 방식 (접근 B)

```
matched-core:  성 × 연령 × 권역  ← DT_1IN1509 실제 joint에서 직접 샘플 (provenance: matched)
      ↓ 각 페르소나의 연령을 앵커로
conditional 부착:
  혼인상태  ~ P(혼인 | 연령)      ← DT_1MR2060, 15세+ 교집합에만 부착 (provenance: conditioned)
  가구원수  ~ P(가구원수 | 연령)   ← DT_1JC1511, householder bridge로 부착 (provenance: conditioned)
```

### 보완 반영 (검토 의견 1·A·B)
- **부착변수 간 상관 소실**: 혼인·가구원수는 연령을 통해서만 연결됨(혼인⊥가구원수 | 연령). MVP 허용하되 provenance=conditioned로 명시하고 fidelity에서 분리 평가.
- **불가능 vs 희귀 구분**:
  - *구조적 불가능*(예: 15세미만 × 기혼) → universe/연령 정렬로 애초에 차단(+validity 가드).
  - *희귀하지만 실재*(예: 기혼 × 1인가구 = 분거) → 보존하되 conditioned 표시. **무조건 필터 금지**(분포 왜곡).
- **universe 정렬(A)**: 혼인은 15세+ 코어 연령에만 부착, <15세는 "해당없음" 기본값(provenance: inferred).
- **householder bridge 가정(명시)**: `DT_1JC1511`은 `P(가구원수 | 가구주연령)`인데 이를 개인의 연령으로 부착하면 *"개인 연령 ≈ 가구주 연령"* 근사가 들어감(비가구주에겐 부정확). MVP에서 허용하되 provenance=conditioned + frame=householder로 명시하고 fidelity의 matched-vs-estimated에 드러냄. (정석: 가구 생성 후 가구원 샘플링 — 후속.)

## 5. 스냅샷 스키마 (검토 의견 3·6 반영)

`data/census/kr-2024.json`:
```jsonc
{
  "meta": {
    "year": 2024,
    "geographyLevel": "권역",          // 시도|권역|전국
    "generatedAt": "ISO",
    "sources": [
      { "var": ["성","연령","지역"], "tblId": "DT_1IN1509", "orgId": "101",
        "frame": "individual", "universe": "전체인구", "denominator": "명" },
      { "var": ["연령","혼인"], "tblId": "DT_1MR2060",
        "frame": "individual", "universe": "15세이상인구", "denominator": "명" },
      { "var": ["연령","가구원수"], "tblId": "DT_1JC1511",
        "frame": "householder", "universe": "일반가구(가구주)", "denominator": "가구" }
    ],
    "ageBins": ["15세미만","15~19세", /* ... */ "85세 이상"],
    "suppression": { "marker": ["X","-"], "policy": "null→0 기여, rare는 report에 기록" }
  },
  "core":        { "dims": ["성","연령","지역"], "categories": {...}, "counts": [...] },
  "conditional": [
    { "given": "연령", "var": "혼인",   "frame": "individual",  "universe": "15세이상인구", "matrix": [...] },
    { "given": "연령", "var": "가구원수", "frame": "householder", "universe": "일반가구",     "matrix": [...] }
  ]
}
```
`data/census/manifest.json`: `{ latest, availableYears, tableIds, generatedAt, checksum }` — 연도별 비교·회귀 테스트용.

## 6. Plan 3A — 합성 인구 엔진

**파일:**
```
data/census/kr-2024.json, data/census/manifest.json     # 번들 스냅샷
scripts/refresh-census.ts                                # (키 필요) 라이브→집계→스냅샷 기록
src/population/schema.ts    # 스냅샷 타입 + Provenance + Frame 리터럴
src/population/loader.ts    # 로드/검증 + frame 가드 + universe·연령 정렬
src/population/synthesize.ts# synthesizePopulation(snapshot, n, seed) → Persona[]
src/types.ts                # Persona += provenance?, flags?(low-confidence)
src/study.ts                # PersonaSource 추상화 통합
src/index.ts                # 신규 export
```

**핵심 인터페이스:**
```ts
type Frame = "individual" | "householder" | "household";
type Provenance = "matched" | "conditioned" | "inferred" | "llm_generated";

interface Persona {
  id: string;
  attrs: Record<string, string>;
  provenance?: Record<string, Provenance>;
  flags?: string[];                     // 예: "low-confidence:연령bin"
}

interface PersonaSource { generate(n: number, seed: number): Promise<Persona[]>; }
class CensusPopulation implements PersonaSource { constructor(snapshot: Snapshot); /* synthesize */ }
// 기존 DataSource(SampleSource/KosisSource) 경로는 어댑터로 PersonaSource 충족(하위호환)

function synthesizePopulation(snapshot: Snapshot, n: number, seed: number): Persona[];
```

**frame 가드(#2)**: 서로 다른 frame의 소스를 결합하려면 *명시 bridge 함수*를 거쳐야 함(예: `attachHouseholdContext`). loader가 무심코 cross-frame join을 막음(런타임 throw + 타입).

**runStudy 통합**: `runStudy`는 `personaSource: PersonaSource`를 받도록 일반화. 기존 `source: DataSource` 호출은 어댑터(`distributionPersonaSource(dataSource)`)로 동일 동작 유지.

## 7. Plan 3B — fidelity 리포트

**파일:**
```
src/verify/scoring.ts       # += totalVariationDistance(p,q), smoothedKL(p,q,eps)
src/verify/fidelity.ts      # populationFidelity(personas, snapshot)
src/verify/fidelity-report.ts # 마크다운 fidelity 카드
src/index.ts                # export
```

**`populationFidelity` 산출(검토 의견 4·5 반영):**
- **core fidelity**: 합성 집단의 성×연령×권역 재집계 vs 스냅샷 core joint → MAE/TVD/maxErrorCell. *실제 joint라 ≈0(샘플오차만) 기대* — 0에서 크게 벗어나면 버그.
- **conditional fidelity**: 연령×혼인, 연령×가구원수 재집계 vs 원본 조건부 → MAE/TVD (부착이라 0 아님, 표본오차+정렬효과).
- **matched vs estimated 표**: 각 변수/pair가 matched(core) / conditioned / inferred 중 무엇인지, 독립가정된 pair(예: 혼인×가구원수) 명시.
- **rare/sparse 셀 목록** + suppressed 셀 표기.
- 지표: MAE(기존 scoring), **TVD 주력**, **smoothed KL 보조**(0셀 회피).

**fidelity 카드 예시 섹션**: 종합 충실도, core 🟢(≈0), conditional 수치, matched-vs-estimated, rare-cell 목록.

## 8. 엔진 보강 (정찰서 도출)

- `parseKosisRows`에 `c3nm` 추가 (`DT_1IN1509`는 연령이 C3) — refresh 스크립트가 3축 표를 읽음.
- `KosisAxis`에 `"c3nm"` 추가.

## 9. 테스트 (키/네트워크 없이 결정적)

- 작은 **픽스처 스냅샷** + 고정 시드로 `synthesizePopulation` 검증: provenance 정확, universe 정렬(15세미만에 혼인 미부착), 불가능 조합 0건, 희귀 조합 보존+flag.
- `populationFidelity`: core 재집계 ≈ 원본(tol), conditional MAE 합리적, matched-vs-estimated 분류 정확.
- **frame 가드**: cross-frame 직접 join 시 throw.
- scoring TVD/smoothedKL 단위 테스트(0셀 포함).
- 갱신 스크립트는 라이브(키)라 단위 테스트는 파싱/집계 로직만 mock으로.

## 10. 범위 / 분해

- **Plan 3A**: 스냅샷 스키마·로더(frame 가드)·synthesize·provenance·PersonaSource·runStudy 통합·엔진 보강(c3nm)·refresh 스크립트. → 실제 통계청 5축 페르소나 생성.
- **Plan 3B**: scoring(TVD/KL)·fidelity·fidelity-report. → 1층 신뢰를 숫자로.

**비범위(후속)**: 시도 해상도, 경제활동/소득 축, 가구→가구원 정석 샘플링, Haiku 2층 기능점검, 웹 UI.

## 11. 명시적 비주장 (정직성)

- 완전 5차원 결합분포를 복원하지 않는다. matched-core(3-way 실측) + 연령 앵커 조건부 부착이며, 부착변수 간 상관은 연령 경유만.
- 합성 인구는 *대표성 있는 패널*이지 실제 개인이 아니며, 응답(2층)은 별도의 캘리브레이션으로 경계된다.

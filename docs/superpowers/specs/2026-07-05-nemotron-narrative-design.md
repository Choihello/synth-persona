# Nemotron 서사 레이어 설계 — 2026-07-05

## 목적

롤플레이 페르소나가 마른 속성 5개("연령=45~49세, 성=남자, …")뿐이라 응답의
현실감과 reason 텍스트 품질이 얕다. NVIDIA **Nemotron-Personas-Korea**
(100만 레코드, CC BY 4.0, KOSIS 등 근거)의 서사를 **매칭 레이어**로 얹어
프롬프트만 풍부화한다. **표본 추출·가중치·세그먼트·리포트 수치는 전부
불변** — 통계 골격(KOSIS IPF)은 우리 것이 더 강하므로(결합분포 IPF vs
그들의 독립성 가정) 대체가 아니라 서사만 빌린다.

## 결정 사항 (브레인스토밍 합의)

- 방향: **서사 레이어** (모집단 대체 아님)
- 불변식 완화 승인: `src/types.ts`의 Persona에 **optional `narrative?:
  string` 필드 1줄 추가만** 허용. 기존 필드·`src/aggregate`는 계속 무수정.
  불변식 문구는 "src/types.ts 기존 필드 무수정 (optional 추가는 승인 시)"로 갱신
- 라이브 A/B 승인 (≈$0.05): GO면 웹 기본 ON + `NARRATIVE=off`로 끌 수
  있게, NO-GO면 기본 OFF 유지 + 원인 보고
- 실행 모델 정책: **메인 컨트롤러 fable 고정, 서브에이전트는 Opus 4.8**

## 데이터셋 사실 (확인 완료)

- 필드: 인구통계 12(sex 남자/여자, age 19~99, marital_status
  미혼/배우자있음/사별/이혼, family_type 39종, housing_type,
  education_level, bachelors_field, occupation, district 252,
  province 17, country, military_status) + 서사 7종(persona 요약 ~150자,
  professional/family/sports/arts/travel/culinary 각 ~200자) +
  속성 텍스트 6종 + uuid
- 라이선스 CC BY 4.0 (저작자표시 필요) · 성인(19+)만 · 완전 합성 ·
  변수 간 독립성 가정 명시
- 접근: HF datasets-server rows API가 JSON 반환 (`/rows?dataset=…&offset=…
  &length=100`) — parquet 리더 불필요

## ① 오프라인 풀 빌드 — `scripts/build-nemotron-pool.ts`

- HF rows API를 무작위 offset으로 페이징 수집 (100행/콜, 필요 시 수백 콜,
  1회성 스크립트 — 코어 런타임 의존성 추가 없음, fetch만)
- **층화**: 연령대(20~24 … 85세이상 14구간)×성(2)×권역(2)×혼인(3) =
  168 스트라텀, 스트라텀당 목표 20 (드문 조합은 미달 허용, 수집 결과 보고)
- 매핑 규칙:
  - province ∈ {서울, 경기, 인천} → 수도권, 그 외 → 비수도권
  - marital_status: 배우자있음→유배우 · 사별→사별·이혼 · 이혼→사별·이혼 ·
    미혼→미혼 (그 외 값 발견 시 스킵하고 보고)
  - age → 우리 5세 구간. **age 19는 제외** (우리 15~19세 구간과 정합 불가 —
    15~19세 스트라텀은 빈 채로 두고 매칭 폴백)
  - family_type → 가구 호환 클래스 `hh: "1" | "2" | "3+" | "unknown"`
    (텍스트 규칙: "혼자"/"1인" 포함→1, "배우자와 거주" 등 2인 표현→2,
    자녀/부모 동거 표현→3+, 판별 불가→unknown. 실제 39종 값 목록을 수집
    단계에서 덤프해 규칙을 확정하고 스크립트에 하드코딩)
- 저장(`data/nemotron/kr-pool.json`, 커밋): 스트라텀 키 →
  `{ n: string(서사 요약 persona), job: occupation, edu: education_level,
  hh: 호환클래스 }[]`. 목표 1~2MB (요약 서사만, 7종 전문 미포함)
- 메타: 생성일·수집 행수·스트라텀 충족률·라이선스 표기를 JSON meta에 기록

## ② 코어 통합

### src/types.ts (승인된 1줄)

```ts
export interface Persona {
  id: string;
  attrs: Record<string, string>;
  weight: number;
  provenance?: Record<string, Provenance>;
  flags?: string[];
  /** 매칭된 배경 서사 (Nemotron-Personas-Korea, CC BY 4.0) — 프롬프트 전용, 집계·세그먼트에 미사용 */
  narrative?: string;
}
```

### 신규 `src/personas/narrative.ts`

```ts
export interface PoolEntry { n: string; job: string; edu: string; hh: "1" | "2" | "3+" | "unknown" }
export interface NarrativePool {
  meta: { source: string; license: string; generatedAt: string; rowsScanned: number; strataFilled: number; strataTotal: number };
  strata: Record<string, PoolEntry[]>;
}
export function narrativeKey(attrs: Record<string, string>): string | null
  // "연령|성|지역|혼인" 값으로 스트라텀 키. 필요한 축이 없으면 null
export function attachNarratives(personas: Persona[], pool: NarrativePool, seed: number): Persona[]
```

- 순수 함수, 결정적: 후보 선택은 `hash(persona.id + seed) % candidates.length`
  (같은 seed → 같은 서사, 재현성·counterbalance 불변)
- **가구 호환 필터**: 페르소나 attrs의 가구원수(1명/2명/3명+)와 후보 `hh`가
  모순이면 제외 (unknown은 허용). 후보 0이면 narrative 미부착
- 원본 페르소나 불변(새 객체 반환) — 기존 소비자 무영향
- 서사에 직업·학력 병기: narrative 문자열을
  `"{persona 요약} (직업: {job} · 학력: {edu})"` 형태로 조립

### 프롬프트 (`src/llm/claude.ts` personaSystemPrompt)

속성 목록 아래, narrative 있을 때만:

```
배경 서사 (참고용 — 아래 속성과 상충하면 속성이 우선):
{narrative}
```

### 배선

- `src/study.ts`(또는 페르소나 샘플링 직후 지점)에서 옵션
  `narrativePool?: NarrativePool`이 주어지면 attachNarratives 적용
- `web/pipeline.ts`: `NARRATIVE` 환경변수로 제어. **구현 시점 기본값은
  OFF**(`NARRATIVE === "on"`일 때만 활성) — 라이브 A/B GO 판정 후 별도
  커밋으로 기본 ON(`!== "off"`)으로 뒤집는다 (검증 전 프로덕션 무영향 보장)
- CLI/데모/기존 테스트는 풀 미전달 → 현재와 완전 동일 동작

## ③ 검증 3층 (GO/NO-GO)

1. **오프라인 모순 감사** — `eval/narrative-audit.ts` (키 없음): 실제 풀로
   200명 샘플 매칭 → 성·연령대·권역·혼인·가구호환 모순 **0건** 자동 검증.
   추가로 무작위 20건을 컨트롤러(fable)가 직접 읽고 정성 판정 보고
2. **키 없는 테스트**: 풀 스키마 로더 검증 · 매칭 결정성(같은 seed 2회
   동일) · 가구 모순 후보 제외 · 후보 없음 폴백 · 프롬프트에 서사+속성우선
   문구 포함 · **attrs 무변경 회귀(세그먼트 축 오염 방지)** · 15~19세 폴백.
   테스트 픽스처는 소형 mock 풀(커밋) — 실제 풀 파일은 스키마 검증만
3. **라이브 A/B** (≈$0.05): 같은 질문·같은 seed·n=30×3, NARRATIVE off/on
   각 1회 실측. **GO 기준**: choice 파싱률 저하 없음 · 응답 분포 전면
   붕괴(단일 선택지 100% 쏠림 전환) 없음 — 이동 폭은 관찰 보고 ·
   reason 텍스트에 서사 맥락 반영 확인(정성) · 감사 1층 모순 0.
   GO → 웹 기본 ON / NO-GO → 기본 OFF + 원인 분석 보고

## ④ 표기·라이선스 (CC BY 4.0)

- 서사 사용 리포트의 appendix에 1줄:
  `페르소나 서사: NVIDIA Nemotron-Personas-Korea (CC BY 4.0)`
- README와 웹 콜로폰에 저작자표시 추가
- 리포트 본문에 서사 원문 미노출

## ⑤ 불변식 (갱신본)

- `src/types.ts` **기존 필드 무수정** — optional 추가는 이번 승인분
  (`narrative?`)만 · `src/aggregate` 무수정
- 표본 추출·가중치·세그먼트·리포트 수치 불변 (서사는 프롬프트 전용)
- 코어 런타임 의존성 @anthropic-ai/sdk 단일 (풀은 JSON 데이터, 빌드
  스크립트는 fetch만)
- 테스트 키 없이 그린 · 재현성(seed) 유지
- 실행: 메인 fable 고정, 서브에이전트 Opus 4.8, push 승인 게이트

## 범위 밖

- Nemotron을 모집단으로 대체 (통계 골격 교체)
- 직업·학력을 세그먼트 축으로 추가 (후속 후보 — 분포 검증 별도 필요)
- 서사 7종 전문 활용 (요약 1종만 사용)

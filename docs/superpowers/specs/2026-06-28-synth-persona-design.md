# Synth-Persona — 설계 문서 (골격)

> 작업명: **synth-persona** (변경 가능)
> 작성일: 2026-06-28
> 상태: 골격 설계 승인됨 → 구현 계획(writing-plans) 대기

## 1. 개요

통계청 인구조사 데이터로 통계적으로 현실적인 **가상 페르소나 모집단**을 합성하고,
LLM으로 그들에게 시장조사 질문을 던져 **"진짜 조사 전 0차 간보기"**를 제공하는 오픈소스 도구.

- **목표**: 사업 모델이 아니라 **오픈소스 포트폴리오**. 성공 지표 = 기술적 깊이 · 코드 품질 · 데모 설득력 · GitHub traction.
- **포지셔닝**: 상용 합성소비자 SaaS(인텔리시아, Aaru 등)의 *대체*가 아니라 그 *입구*. "진짜 조사할 돈 없는 1인 창업자/사이드프로젝트의 0차 도구."
- **핵심 철학**: 신뢰성은 "정답을 맞추는 능력"이 아니라 **"내가 어디서 틀리는지 아는 능력"**. 이 철학을 검증 하네스로 구현하는 것이 최대 차별점.

### 제품의 3가지 신뢰성 기둥
1. **앵커링** — 통계청 분포 + IPF로 고정관념 편향을 사전에 줄임 (MVP 포함)
2. **불확실성 표시** — 페르소나 의견이 갈린 곳에 🔴, 합의된 곳에 🟢. "어디를 진짜 조사할지" 조준 (MVP 포함, 핵심)
3. **캘리브레이션** — 과거 사례 적중률로 신뢰구간 부여. 시간이 쌓는 해자 (MVP는 rig만, 데이터는 누적)

## 2. 검증 상태 (골격 설계의 전제)

골격 설계 전, 두 핵심 기술 가정을 스파이크로 검증함:

- **가정 #2 (IPF로 현실적 페르소나 생성)** — ✅ **완전 증명** (순수 Node, 의존성 0).
  - 연령-가구 상관 보존: "20대×4인가구"(비현실) 4.7%→2.4%, "40대×4인가구"(현실) 5.4%→8.7%.
  - 주변분포 정확 복원(0.500/0.500). IPF는 라이브러리 없이 ~65줄.
- **가정 #1 (KOSIS API)** — 🟡 구조 검증 완료, 라이브 호출만 키 대기.
  - URL 빌더 · 응답 파서(문서 스키마) · 에러 처리 · IPF 타깃 변환 모두 mock으로 검증.
  - 남은 1가지: 통계청이 2-way 교차표를 공개하는지(라이브 키로 확인). 없어도 1-way로 IPF는 동작(상관만 약화).

검증 자산: `ipf_poc.mjs`, `kosis_client.mjs` (스크래치패드) → `src/personas/ipf.ts`, `src/data/kosis-source.ts`로 이식.

## 3. 골격 결정 사항

| 항목 | 결정 |
|---|---|
| MVP 형태 | 엔진(코어) + 얇은 CLI 먼저 (웹 UI는 이후) |
| 언어 | TypeScript |
| LLM 제공자 | Claude 기본 + 교체가능 어댑터 (BYOK) |
| 데이터 소싱 | 번들 샘플 + 라이브 KOSIS 둘 다 (인터페이스로 추상화) |
| 아키텍처 | 접근 A — 순수 함수 파이프라인 + 얇은 오케스트레이터 |

## 4. 아키텍처

### 4.1 데이터 흐름
```
DataSource.getDistribution()      → Distribution (마진 + 2way 교차표)
  → ipf(distribution)             → JointDistribution (결합분포 텐서)
  → samplePersonas(joint, N)      → Persona[]
  → simulate(personas, question)  → Response[]   (LLMProvider 사용)
  → aggregate(responses)          → StudyResult  (🔴/🟢 + 세그먼트 교차)
```

### 4.2 디렉토리 구조
```
<repo>/
├─ package.json
├─ tsconfig.json
├─ README.md
├─ LICENSE                    # MIT
├─ .env.example              # ANTHROPIC_API_KEY, KOSIS_API_KEY
├─ data/samples/
│   └─ kr-census-sample.json # 번들 샘플 분포(마진 + 2way 교차표)
├─ src/
│   ├─ types.ts              # 단계 간 공유 타입
│   ├─ data/
│   │   ├─ source.ts         # DataSource 인터페이스
│   │   ├─ sample-source.ts  # 번들 샘플 구현
│   │   └─ kosis-source.ts   # 라이브 KOSIS 구현 (검증 코드 이식)
│   ├─ personas/
│   │   ├─ ipf.ts            # IPF 엔진 (검증 코드 이식)
│   │   └─ sample.ts         # 결합분포 → 페르소나 N명 샘플링
│   ├─ llm/
│   │   ├─ provider.ts       # LLMProvider 인터페이스
│   │   ├─ claude.ts         # Claude 어댑터 (기본)
│   │   ├─ mock.ts           # 테스트용 가짜 provider
│   │   └─ recorded.ts       # VCR 녹화/재생 provider
│   ├─ simulate/simulate.ts  # 페르소나 × 질문 → 응답
│   ├─ aggregate/uncertainty.ts # 분산/엔트로피 → 🔴/🟢 + 세그먼트 교차
│   ├─ verify/
│   │   ├─ invariants.ts     # 계층1 불변식
│   │   ├─ probes.ts         # 계층3 편향 탐침
│   │   ├─ robustness.ts     # 계층4 섭동/순서/절제
│   │   ├─ calibrate.ts      # 계층5 외부 벤치마크 채점
│   │   ├─ scoring.ts        # 통계 채점(상관/오차/Brier)
│   │   └─ report.ts         # 전 계층 → 단일 성적표(md+html)
│   ├─ study.ts              # runStudy() 오케스트레이터
│   └─ index.ts              # 공개 API export
├─ cli/main.ts               # 얇은 CLI (node:util parseArgs)
├─ eval/
│   ├─ cassettes/            # 계층2 VCR 녹화
│   ├─ fixtures/             # 골든 스터디
│   ├─ groundtruth/          # 실제 조사 결과(사회조사·공개 여론조사)
│   └─ report/               # 생성된 성적표 + 드리프트 히스토리
├─ logs/                     # 캘리브레이션용 append-only 로그(1일차부터 쌓기)
├─ test/*.test.ts            # 단위 테스트 (LLM은 mock/recorded)
├─ .github/workflows/ci.yml  # 결정적 게이트 (키 불필요)
└─ stryker.conf.json         # 뮤테이션 테스트 설정
```

## 5. 핵심 인터페이스

```typescript
// 통계청/샘플이 주는 원재료
interface Distribution {
  dimensions: { name: string; categories: string[] }[];
  marginals: Record<string, number[]>;                  // 1-way 타깃
  crossTables?: { dims: [string, string]; matrix: number[][] }[]; // 2-way(있으면)
}

interface DataSource {                                   // 샘플/KOSIS 공통
  getDistribution(spec: DistSpec): Promise<Distribution>;
}

interface Persona {
  id: string;
  attrs: Record<string, string>;                         // {연령, 성별, 지역, 가구원수, ...}
}

interface LLMProvider {                                   // Claude/mock/recorded 공통
  ask(persona: Persona, prompt: string): Promise<string>;
}

interface Response {
  persona: Persona;
  answer: string;
  choice?: string;                                       // 상대비교 질문의 선택지(집계용)
}

interface StudyResult {
  responses: Response[];
  signal: "consensus" | "split";                         // 🟢 / 🔴
  dispersion: number;                                    // 엔트로피/분산
  bySegment: Record<string, { signal: string; breakdown: Record<string, number> }>;
  missing?: { personaId: string; reason: string }[];     // 부분 실패 정직 표시
}
```

설계 원칙:
- `Distribution`이 1-way/2-way 모두 표현 → 교차표 유무에 양쪽 대응.
- `LLMProvider.ask`는 최소 인터페이스 → mock/recorded로 LLM 없이 테스트.
- `StudyResult`에 불확실성이 1급 시민 → 빨간불/녹색불이 곧 차별점.

## 6. 검증 하네스 (6계층 + 3루프)

### 계층
1. **코드 정합성** (LLM 없음, 결정적) — IPF 불변식(property test, 마진 복원/합=1/음수없음/수렴), 샘플링 충실도(고정 시드), KOSIS 파서 골든테스트, 불가능 조합 게이트. *(MVP)*
2. **시뮬레이션 하네스** — VCR(카세트)로 실제 Claude 응답 1회 녹화 후 재생. 무료·빠름·결정적. 집계/불확실성 로직 검증. *(MVP)*
3. **도메인 타당성/편향 탐침** — 갈려야 할 대조 질문의 분산 감시(예스맨/평균회귀), 자기일관성, 골든 스터디. *(MVP)*
4. **적대적/강건성** — 뮤테이션 테스트(Stryker, 결정적 코어), 패러프레이즈 불변성, 순서/위치 편향, 속성 절제. *(MVP)*
5. **외부 정답 벤치마크** — 공개 조사 결과 백테스트 → Spearman/MAE/Brier/커버리지 채점 → fidelity 지표. *(rig는 MVP, 데이터는 누적)*
6. **CI/드리프트 거버넌스** — 결정적 게이트(시드+카세트→바이트 동일), 모델 버전 핀+드리프트 diff, 비용/지연 예산, 커버리지 임계. *(MVP)*

### 루프
```
[개발 루프]    수정 → `npm run verify` (계층1·2·4·6, 결정적·무료·수초) → 게이트
[데이터 루프]  실제 스터디 → logs/ append → `npm run calibrate` → 성적표 갱신
[벤치마크 루프] (수동/스케줄) groundtruth 백테스트 → fidelity 재측정 → 드리프트 히스토리
```

### 통합 성적표 (`report.ts`)
전 계층 결과를 단일 성적표(md+html)로 렌더 — 불변식 통과율, 뮤테이션 점수, 편향 탐침, fidelity, 드리프트 추이. README의 **"이 시스템은 자기 자신을 검증한다"**의 시각적 증거.

## 7. 에러 처리

- DataSource/LLMProvider 실패는 **타입화된 에러**로 상위 전달.
- 부분 실패(페르소나 일부 응답 실패)는 `StudyResult.missing`에 누락 표시 — "정직하게 모른다고 말하기" 원칙을 코드로.
- KOSIS 에러 응답(`{err, errMsg}`)은 배열 응답과 구분해 명확한 메시지로(검증 완료).

## 8. 도구 & 설정

**런타임(최소):** Node 24(네이티브 TS 실행, `--env-file`, `node:util parseArgs`) + `@anthropic-ai/sdk`(유일한 런타임 외부 의존성). IPF·샘플링·KOSIS·집계·CLI = 무의존.

**검증/개발(devDeps):** vitest(러너), fast-check(property), @stryker-mutator/core(mutation), Biome(린트+포맷).

**기타:** 빌드 tsup(ESM, lib+CLI), CI는 GitHub Actions(결정적 잡만, 키 불필요), 모델 기본값은 비용 고려해 Haiku(설정으로 Sonnet/Opus 승급; 정확한 모델 ID는 구현 시 claude-api 레퍼런스로 확정), 라이선스 MIT.

**핵심 UX 불변식:** 키 없이도 `git clone && npm install && npm run verify`가 초록불. Claude 키는 실제 시뮬레이션 때만 필요.

## 9. 범위 (MVP) 및 비범위

**MVP 포함:** 데이터(샘플+KOSIS rig) → IPF → 페르소나 샘플 → 시뮬(Claude/mock/recorded) → 집계(🔴/🟢+세그먼트) → CLI → 검증 계층 1·2·3·4·6 작동 + 5 rig + 통합 성적표.

**비범위(이후):** 웹 UI/데모 GIF, 캘리브레이션 데이터 본격 누적, 멀티 제공자 추가, 로컬 LLM, 프롬프트 뮤테이션, 실제 인간 A/B 패널 연동.

## 10. 키 받은 뒤 닫을 것 (#1-D)
1. kosis.kr 인증키 발급(무료)
2. 인구총조사 2-way 교차표 `tblId` 1개 확보
3. `kosis-source.ts` 라이브 호출로 실제 데이터 페르소나 생성 확인 + 교차표 가용성 최종 판정.

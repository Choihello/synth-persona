# Claude Code 전달용 보완 문서 — synth-persona 리뷰 후속

작성일: 2026-06-30  
대상 브랜치: `spec/product-reorientation`  
목적: 코드 리뷰에서 발견한 구현/계획 리스크를 Claude Code가 바로 보완할 수 있도록 정리한다.

## 현재 상태 요약

- 현재 브랜치 diff는 코드가 아니라 문서 2개뿐이다.
  - `docs/superpowers/specs/2026-06-30-product-reorientation-design.md`
  - `docs/superpowers/plans/2026-06-30-reliability-overlay-bundle-A.md`
- 로컬 검증 결과:
  - `npm test` → 27 files / 89 tests passed
  - `npm run lint` → clean
  - `.\node_modules\.bin\tsc.cmd --noEmit` → exit 0
  - `npm audit --omit=dev` → 0 vulnerabilities
- 리모트는 아직 없다.
- 코드 리뷰에서 발견한 핵심 리스크는 “테스트가 통과하지만 제품 취지와 어긋날 수 있는 동작”이다.

## 제품 취지

이 도구는 “AI가 시장조사를 대체한다”가 아니라, 실제 조사 전에 가설을 압축하고 어디를 누구에게 검증할지 알려주는 도구다. 따라서 모든 보완은 다음 원칙을 지켜야 한다.

- 결과 숫자는 실제 구매율/시장 예측이 아니라 `synthetic panel response`로 라벨링한다.
- 불확실한 결과는 초록불처럼 보이면 안 된다.
- 1층 구성 신뢰도와 2층 LLM 응답 추론은 출력에서 분리한다.
- 완전한 5-way joint라고 주장하지 않는다.
- `Persona.weight`, provenance, householder bridge, suppressed(`X`)와 structural zero(`-`) 구분을 유지한다.
- 런타임 외부 의존성은 추가하지 않는다.

## 우선순위 보완 항목

### P1. 선택지가 실제 Claude 프롬프트에 전달되지 않음

문제:

- `src/simulate/simulate.ts`는 `provider.ask(persona, question.prompt)`만 호출한다.
- `question.choices`는 사후 `matchChoice()`에만 사용된다.
- CLI/README는 `--question "...?" --choices "쓴다,안쓴다"` 형태를 권장한다.
- 실제 Claude가 선택지를 정확히 포함해 답하지 않으면 `choice`가 `undefined`가 되거나 자유응답 문자열 단위로 집계될 수 있다.

수정 방향:

- `choices`가 있을 때 LLM에게 선택지 중 하나를 정확히 고르게 하는 프롬프트를 구성한다.
- 자유응답 모드(`choices` 없음)는 기존 동작을 유지한다.
- `matchChoice()`의 부분문자열 방어는 유지한다.

권장 테스트:

- `simulate()`에서 fake provider가 받은 prompt를 캡처하고, 선택지 목록과 “정확히 하나 선택” 지시가 포함되는지 확인한다.
- 선택지가 없을 때는 원래 prompt가 불필요하게 변형되지 않는지 확인한다.
- `"쓴다"` / `"안쓴다"` 부분문자열 케이스는 기존 테스트 유지.

수용 기준:

- `question.choices`가 있으면 provider에 전달되는 prompt에 선택지 전체가 들어간다.
- LLM 응답이 선택지를 포함하면 기존처럼 `choice`가 채워진다.
- 기존 89 테스트와 신규 테스트가 모두 통과한다.

### P1. 전원 실패/무응답이 consensus처럼 보일 수 있음

문제:

- `simulate()`는 개별 provider 실패를 `missing`으로 누적하고 계속 진행한다.
- `aggregate()`는 빈 응답의 normalized entropy를 0으로 처리한다.
- 결과적으로 API 키 누락, rate limit, `--n 0`, `--n abc`, `--n -1` 같은 경우가 `분산 0.00 consensus`처럼 보일 수 있다.

수정 방향:

- 응답이 0건이면 정상 consensus가 아니라 실패/불충분 상태로 드러나야 한다.
- CLI 입력 `n`은 finite positive integer로 검증한다.
- 부분 실패가 과도할 때 경고를 강화한다. 최소한 전원 실패는 실패로 처리한다.

권장 테스트:

- provider가 모든 persona에서 throw할 때 `runStudy()` 또는 상위 경계가 실패/불충분 상태를 반환하거나 throw하는지 확인한다.
- CLI `--n 0`, `--n -1`, `--n abc` 입력이 사용법 오류로 종료되는지 확인한다.
- 일부 실패는 `missing`으로 유지하되 출력에 누락 건수가 표시되는지 확인한다.

수용 기준:

- 응답 0건 결과가 `consensus`로 렌더되지 않는다.
- 잘못된 `--n`은 조용히 빈 결과로 흘러가지 않는다.
- 에러 메시지는 사용자가 무엇을 고쳐야 하는지 알려준다.

### P1. Reliability demo 계획이 build entry와 맞지 않음

문제:

- 계획 문서는 `eval/reliability-demo.ts`와 `reliability:demo` 스크립트를 추가하라고 한다.
- 현재 `tsup.config.ts` entry에는 `eval/calibrate-demo.ts`, `eval/fidelity-demo.ts`만 있다.
- 그대로 구현하면 `npm run build && npm run reliability:demo`에서 `dist/eval/reliability-demo.js`가 없을 수 있다.

수정 방향:

- `docs/superpowers/plans/2026-06-30-reliability-overlay-bundle-A.md`의 Task 4에 `tsup.config.ts` 수정 항목을 추가한다.
- 실제 구현 시 `tsup.config.ts` entry에 `eval/reliability-demo.ts`를 추가한다.

권장 테스트:

- `npm run build && npm run reliability:demo`
- 출력에 다음 문자열 포함 확인:
  - `## 신뢰성 카드`
  - `synthetic panel response`
  - `matched`
  - `conditioned`
  - `householder_age_as_proxy`

수용 기준:

- build 후 `dist/eval/reliability-demo.js`가 생성된다.
- `npm run reliability:demo`가 별도 키 없이 동작한다.

### P2. Spec과 Plan의 CLI 범위가 충돌함

문제:

- spec은 CLI에도 “신뢰성” 블록을 추가한다고 적는다.
- plan은 CLI 배선을 묶음 B로 제외한다.
- 둘 중 하나는 정리해야 Claude Code가 구현 범위를 잘못 잡지 않는다.

권장 결정:

- 묶음 A에서는 CLI 배선을 제외하는 편이 더 일관적이다.
- 이유: 현재 CLI는 provenance 없는 `SampleSource` 경로라 신뢰성 카드가 대부분 `unknown`이 된다.
- 대신 묶음 A는 `reliability:demo`로 key-free census 기반 신뢰성 카드를 보여준다.
- CLI 배선은 `runStudy`에 `PersonaSource`/census 경로가 연결되는 묶음 B 또는 별도 작업에서 처리한다.

수정 방향:

- spec §4.3의 “CLI에도 신뢰성 블록 추가” 문장을 조정한다.
- plan의 “범위 밖” 설명은 유지하되, spec과 같은 표현으로 맞춘다.

수용 기준:

- spec과 plan이 동일한 범위를 말한다.
- Claude Code가 CLI를 묶음 A에서 구현해야 하는지 혼동하지 않는다.

### P2. ReliabilityCard provenance 판정이 첫 샘플 하나에 끌릴 수 있음

문제:

- 계획 코드의 `assessReliability()`는 dim별 provenance를 responses 중 첫 발견값으로 정한다.
- 같은 dim 안에 `conditioned`와 `inferred`가 섞이면 낮은 신뢰도를 숨길 수 있다.

수정 방향:

- dim별 provenance를 보수적으로 집계한다.
- 권장 우선순위: `inferred` > `conditioned` > `llm_generated` > `matched` > `unknown`
- 또는 dim별 provenance breakdown을 함께 보존한다.

권장 테스트:

- 같은 dim에서 `matched`와 `inferred`가 섞이면 결과 confidence가 `low`인지 확인한다.
- 같은 dim에서 `matched`와 `conditioned`가 섞이면 최소 `medium`인지 확인한다.
- 모든 provenance가 없으면 `unknown`으로 남는지 확인한다.

수용 기준:

- 낮은 신뢰도 provenance가 하나라도 있으면 결과가 과신으로 표시되지 않는다.
- bridge note는 기존처럼 유지된다.

### P2. `loadSnapshot` 구조 검증이 얕음

문제:

- `src/population/loader.ts`는 top-level 구조와 frame bridge만 확인한다.
- `core.counts` 길이, `core.categories` 누락, conditional matrix shape, 음수/NaN weight는 충분히 검증하지 않는다.
- 깨진 스냅샷이 `synthesizePopulation()`에서 조용히 왜곡된 persona로 바뀔 수 있다.

수정 방향:

- `loadSnapshot()`에서 최소 구조 불변식을 검증한다.
- core:
  - 모든 `core.dims`에 대응하는 `core.categories[dim]` 존재
  - category 배열이 비어 있지 않음
  - `core.counts.length === product(category lengths)`
  - count는 finite number이고 0 이상
- conditional:
  - `matrix.length === givenKeys.length`
  - 각 row 길이 `varKeys.length`
  - 값은 `null` 또는 finite non-negative number
  - non-individual frame은 bridge 필수 유지

권장 테스트:

- counts 길이가 맞지 않는 snapshot은 throw.
- category가 누락된 snapshot은 throw.
- conditional matrix row 길이가 맞지 않으면 throw.
- 음수/NaN 값은 throw.
- 정상 snapshot은 기존처럼 통과.

수용 기준:

- 잘못된 스냅샷이 합성 단계까지 넘어가지 않는다.
- 기존 snapshot과 기존 테스트는 통과한다.

## 구현 순서 제안

1. 문서 계획 보정부터 한다.
   - `reliability-demo` build entry 누락 보정
   - spec/plan CLI 범위 불일치 해소
2. Runtime 동작 리스크를 고친다.
   - choices prompt 전달
   - empty/all-missing 결과 처리
   - CLI `n` 검증
3. Reliability overlay 구현 전 plan 코드를 보수적으로 조정한다.
   - provenance 집계 방식 수정
4. Snapshot 검증을 강화한다.
5. 전체 게이트를 실행한다.

## 전체 검증 게이트

보완 작업 완료 후 반드시 실행:

```bash
npm test
npm run lint
.\node_modules\.bin\tsc.cmd --noEmit
npm run build
```

Reliability demo 구현 후 추가 실행:

```bash
npm run reliability:demo
```

가능하면 mutation test도 수동 확인:

```bash
npm run test:mutation
```

## 리뷰 중 확인한 근거 파일

- `src/simulate/simulate.ts`
- `src/aggregate/uncertainty.ts`
- `cli/main.ts`
- `src/population/loader.ts`
- `src/population/synthesize.ts`
- `tsup.config.ts`
- `docs/superpowers/specs/2026-06-30-product-reorientation-design.md`
- `docs/superpowers/plans/2026-06-30-reliability-overlay-bundle-A.md`

## Claude Code에게 전달할 한 줄 지시

위 보완 항목을 우선순위대로 처리하되, 코어 제품 원칙을 유지한다: 이 도구는 시장 예측기가 아니라 실제 조사를 조준하는 사전 검증 도구이며, 불확실성을 절대 consensus처럼 포장하지 않는다.

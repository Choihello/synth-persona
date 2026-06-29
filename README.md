# synth-persona

> 통계청 인구 통계로 만든 **가상 페르소나**에게 시장조사 질문을 던져, 진짜 설문 전에 빠르게 "간"을 보는 오픈소스 도구.
> *Synthetic personas grounded in real Korean census distributions — a fast, cheap "zeroth-draft" market read before you run an actual survey.*

![CI](https://img.shields.io/badge/tests-30%20passing-brightgreen) ![node](https://img.shields.io/badge/node-24-blue) ![license](https://img.shields.io/badge/license-MIT-black) ![deps](https://img.shields.io/badge/runtime%20deps-1-lightgrey)

<p align="center">
  <img src="docs/demo.svg" alt="synth-persona CLI demo" width="680">
</p>

---

## 뭐 하는 도구야?

실제 시장조사는 패널 모집에 2주, 수백만 원이 든다. 그래서 **아이디어 초기 단계에선 "방향"만 빠르게 보고 싶을 때**가 많다. `synth-persona`는:

1. **통계청 분포로 현실적인 모집단을 합성**한다 (연령·성별·지역·가구원수가 *함께* 그럴듯하게 — 단순 독립 샘플링이 만드는 "20대 4인가구 가구주" 같은 비현실 조합을 IPF로 억제).
2. 그 페르소나들에게 **LLM으로 질문**을 던진다.
3. 답을 **합의(🟢) / 분열(🔴) 신호 + 세그먼트 교차표**로 집계한다.

핵심은 정답을 맞히는 게 아니라 **"어디를 진짜로 조사해야 하는지"를 찾아주는 것**이다.

## 철학: 신뢰성 = "내가 어디서 틀리는지 아는 능력"

LLM 페르소나는 평균으로 회귀하고, 예스맨 편향이 있고, 고정관념을 연기한다. 그래서 이 도구는 **"다 안다"고 말하지 않는다.** 대신:

- 페르소나 의견이 **갈린 곳(🔴)** 을 표시한다 → *"여기에 진짜 조사 예산을 쓰세요"*
- 합의된 곳(🟢)은 *"추가 조사 불필요"* 로 표시한다
- 세그먼트(연령·지역…)별로 답이 갈리는지를 보여준다 → *전체는 갈려도 "40대 안에선 합의"* 같은 결을 포착

> 🔴/🟢 신호는 버그가 아니라 **제품 그 자체**다. "조사를 대체"하는 게 아니라 "조사를 조준"한다.

## 데모

키 없이 결정적 mock 제공자로 바로 돌려볼 수 있다:

```console
$ node dist/cli/main.js --question "신선식품 새벽배송 구독, 월 9900원에 쓸 의향?" \
    --choices "쓴다,안쓴다" --n 60 --seed 7 --mock

전체 신호: 🔴 split (분산 0.99)
응답 분포: 쓴다=34, 안쓴다=26

[age별]
  🟢 20대: 쓴다=16
  🟢 50대: 안쓴다=12
  🟢 40대: 안쓴다=14
  🟢 30대: 쓴다=18

[sex별]
  🔴 남: 쓴다=16, 안쓴다=10
  🔴 여: 안쓴다=16, 쓴다=18

[region별]
  🔴 수도권: 쓴다=17, 안쓴다=13
  🔴 비수도권: 쓴다=17, 안쓴다=13

[hh별]
  🔴 1인가구: 쓴다=21, 안쓴다=5
  🔴 2인가구: 안쓴다=11, 쓴다=8
  ...
```

읽는 법: **전체는 🔴 분열**이지만 **연령(age)으로 보면 각 세그먼트가 🟢 합의** — 20·30대는 "쓴다", 40·50대는 "안쓴다". 즉 *"이 서비스의 운명은 연령이 가른다"* 가 한눈에 보인다. (위 출력은 데모용 결정적 mock 결과이고, 실제 인사이트는 Claude 제공자로 얻는다.)

## 빠른 시작

```bash
git clone <repo-url> synth-persona && cd synth-persona
npm install
npm run build
# 키 없이 데모 (결정적 mock):
node dist/cli/main.js --question "A안 vs B안?" --choices "A안,B안" --n 40 --mock
```

키 없이도 `npm install && npm test` 가 항상 초록불이다 (테스트·CI는 mock/VCR만 사용).

### 실제 LLM(Claude)으로 돌리기

```bash
cp .env.example .env   # ANTHROPIC_API_KEY 채우기
node --env-file=.env dist/cli/main.js --question "..." --choices "...,..." --n 50
```

기본 모델은 비용을 고려해 Haiku이며, 라이브러리에서 다른 Claude 모델로 교체 가능하다.

### 실제 통계청 데이터(KOSIS)로

`.env`에 `KOSIS_API_KEY`를 넣고(kosis.kr 활용신청 → 자동승인 즉시 발급) 라이브러리에서 `KosisSource`를 쓰면, 번들 샘플 대신 실제 인구총조사 교차표로 페르소나를 만든다:

```ts
import { KosisSource, runStudy, ClaudeProvider } from "synth-persona";

const source = new KosisSource({
  apiKey: process.env.KOSIS_API_KEY!,
  tblId: "DT_1JC1511",          // 인구총조사: 가구주 연령 × 가구원수
  orgId: "101", objL1: "00",    // 전국 (40,000셀 한도 회피)
  objL2: "ALL", itmId: "ALL",
  newEstPrdCnt: 1,              // 최신 1개 기간 (다연도 합산 방지)
  rowDim: { name: "연령", keys: ["25~29세", "40~44세", /* ... */] },
  colDim: { name: "가구원수", keys: ["가구원수 1명", "가구원수 4명", /* ... */] },
  rowAxis: "c2nm",             // 연령은 분류축
  colAxis: "item",             // 가구원수는 항목축(ITM_NM)
});
const result = await runStudy({ source, provider: new ClaudeProvider(), question: { /* ... */ }, n: 100 });
```

> 표마다 축 인코딩이 다르다 — 어떤 표는 한 축을 분류(C1/C2)가 아니라 **항목(ITM_NM)**으로 둔다. `rowAxis`/`colAxis`로 지정한다. 비공표값(`X`)·결측(`-`)은 자동으로 null 처리된다.

### CLI 옵션

| 플래그 | 설명 | 기본값 |
|---|---|---|
| `--question` | 던질 질문 (필수) | — |
| `--choices` | 상대 비교 선택지 `"A,B"` | 없음(자유응답) |
| `--n` | 페르소나 수 | 50 |
| `--seed` | 재현용 시드 | 1 |
| `--source` | `sample` (KOSIS는 추후) | sample |
| `--mock` | 키 없이 결정적 mock | off |

## 동작 원리

```
DataSource (통계청 샘플/KOSIS)
   └─ 주변분포 + 2-way 교차표
        ↓  IPF (반복비례조정)
   결합분포 텐서 ── 변수 간 상관 보존
        ↓  시드 샘플링
   페르소나 N명 (연령·성별·지역·가구…)
        ↓  LLMProvider (Claude / Mock / VCR)
   페르소나별 응답
        ↓  집계 (정규화 엔트로피)
   🔴/🟢 전체 신호 + 세그먼트 교차표
```

라이브러리로도 쓸 수 있다:

```ts
import { runStudy, SampleSource, ClaudeProvider } from "synth-persona";

const result = await runStudy({
  source: new SampleSource(),
  provider: new ClaudeProvider(),       // 또는 MockProvider / RecordedProvider
  question: { prompt: "이 컨셉 어때요?", choices: ["끌린다", "안 끌린다"] },
  n: 100,
  seed: 42,
});

console.log(result.signal);     // "consensus" | "split"
console.log(result.bySegment);  // 세그먼트별 신호 + 분포
```

## 왜 "그냥 GPT 래퍼"가 아닌가 — 검증

이 프로젝트는 **자기 자신을 검증한다.** 현재 포함된 것:

- **IPF 불변식 (property test)** — 무작위 분포에서 마진 항상 복원, 결합분포 합=1, 상관 보존을 `fast-check`로 검증
- **결정성** — 같은 시드 → 같은 결과 (파이프라인 전 구간 테스트)
- **VCR(녹화/재생) LLM** — 실제 Claude 응답을 한 번 녹화 후 재생 → 테스트가 무료·결정적·무네트워크
- **키 없는 결정적 CI** — `lint + test + build` 게이트 (`@anthropic-ai/sdk` 외 런타임 의존성 0)
- **캘리브레이션 성적표** — 결과를 아는 과거 사례에 백테스트해 *fidelity*(순위상관·MAE·방향정확도)를 내고 마크다운 report card로 렌더 (`npm run calibrate:demo`)
- **능동 편향/강건성 점검** — 예스맨·평균회귀·자기일관성 탐침, 패러프레이즈·선택지 순서·속성 민감도 섭동 검사, 결정성/예산/드리프트 거버넌스 → ✅/⚠️ 하네스 성적표
- **뮤테이션 테스트** — Stryker로 순수 코어에 버그를 심어 "테스트가 진짜 버그를 잡는지" 점수화 (`npm run test:mutation`)

> 위 데모의 핵심 버그(부분문자열 선택지 오매칭)도 실제 CLI를 돌려보다 발견해 고쳤다 — 정적 검사가 아니라 실행·관찰로.

## 한계 (정직하게)

가상 페르소나가 **할 수 없는 것**:
- 구매전환율·가격탄력성 같은 **정량 예측** (절대 수치는 믿지 말 것 — 상대 순위만)
- LLM 학습 시점 이후의 **신제품/신트렌드** 반응
- 소수의견·극단값 (평균으로 뭉개짐)

쓸모 있는 곳: **탐색적 정성조사, A/B 상대 비교, 세그먼트별 태도의 결, 설문 사전 점검** — 즉 "진짜 조사 전에 가설을 좁히는" 0차 단계.

## 로드맵

- [x] **코어 엔진** — IPF · 페르소나 샘플링 · LLM 시뮬 · 불확실성 집계 · CLI (Plan 1)
- [x] **검증 — 채점·캘리브레이션·성적표** — fidelity 점수(순위상관/MAE/방향정확도) + 마크다운 report card (`npm run calibrate:demo`) (Plan 2A)
- [x] **검증 — 능동 점검** — 편향 탐침(예스맨/평균회귀/자기일관성) · 강건성(패러프레이즈/순서편향/속성민감도) · 거버넌스(결정성/예산/드리프트) · 뮤테이션 테스트(`npm run test:mutation`, 코어 ~79%) (Plan 2B)
- [x] **라이브 KOSIS 연동 (라이브러리)** — 통계청 인증키로 실제 인구총조사 교차표(예: `DT_1JC1511` 가구주 연령×가구원수) 사용. `KosisSource`가 항목축 매핑·비공표값(`X`/`-`)·기간 제약(`newEstPrdCnt`) 처리. (CLI `--source kosis` 노출은 추후)
- [x] **검증된 합성 인구 (Plan 3A)** — 통계청 다표 융합으로 5속성 페르소나: 성×연령×권역 *matched-core* + 혼인·가구원수 *연령 앵커 조건부 부착*(완전 5-way joint 아님). 가중 모집단(`weight`)·provenance(matched/conditioned/inferred)·frame 가드·householder bridge 명시. 실제 2024 인구총조사 스냅샷(`data/census/`, 약 4,346만 명) 번들 — 키 없이 재현.
- [ ] **합성 인구 fidelity 리포트 (Plan 3B)** — 합성 집단을 원본 대비 가중 재집계(MAE/TVD)해 "1층 신뢰"를 숫자로
- [ ] 웹 UI

## 라이선스

MIT

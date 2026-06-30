# 실측 파이프라인 smoke test — 2026-06-30

> **목적**: Haiku 실측 *전에* 파이프라인·파싱·missing-rate·로깅·라벨을 점검한다. **외부 LLM 호출 없음(MockProvider).** 모든 숫자는 **synthetic panel response**이며 시장 반응이 아니다. 이 문서는 "pipeline smoke test"이지 시장 판단이 아니다.
>
> 재현: census 스냅샷 → `synthesizePopulation` → `sampleForSimulation(pop, N, seed=42)` → `LoggingProvider(MockProvider)` → `simulate`/`aggregate`/`assessReliability`. 공개 API만 사용.

## 1) persona context가 provider에 전달되는가 — 확인됨

persona 속성은 `ClaudeProvider`의 **system 프롬프트**(`personaSystemPrompt`)로 들어간다(이전 dry-run에서 user 프롬프트만 캡처해 안 보였던 것). 보강 후 실제 전달 형태:

```
당신은 통계청 인구총조사 분포로 구성된 가상 패널 응답자(synthetic panel respondent)입니다.
실제 개인이 아니며, 사람 대상 실측 전에 가설을 탐색하기 위한 것입니다.
아래 속성을 가진 사람이라면 어떻게 답할지, 그 사람의 입장에서 간결하고 솔직하게 답하세요 (...).

- 성: 여자 (출처: matched)
- 연령: 30~34세 (출처: matched)
- 지역: 비수도권 (출처: matched)
- 혼인: 미혼 (출처: conditioned)
- 가구원수: 가구원수 1명 (출처: conditioned)
- 참고: 일부 속성은 가구주 연령 기반 추정입니다 (bridge:householder_age_as_proxy).

출처가 conditioned/inferred인 속성은 추정값이니 과신하지 마세요.
```

user 프롬프트(`buildPrompt`)에는 질문 + "정확히 하나 고르고 그대로 답에 포함" + choices가 들어간다. → **성별·연령대·권역·혼인·가구원수·provenance·bridge·synthetic-panel 제한 모두 포함됨.**

## 2) N=100 mock census (저위험 질문, 2지선다)

질문: "AI가 장보기 예산을 자동 추천해준다면 신뢰할 수 있나요?" / choices: `신뢰할 수 있다` · `신뢰하기 어렵다`
(가격/구매의향이 아닌 **신뢰/수용** 질문 — 소득축 결핍 영향 적음.)

- 전체 신호: 🔴 split (분산 0.96)
- 응답 분포(synthetic panel response): `신뢰할 수 있다=39, 신뢰하기 어렵다=61`
- **missing rate: call 0.0% · parse 0.0%** (provider 로그 100건, error 0)
- 연령 세그먼트 표집: 가중 비례라 근로연령대多·초고령少 (15~19=4 … 85+=3), 큰 왜곡 없음
- mock이 **자연어 문장**("네, 신뢰할 수 있다고 봅니다")으로 답해도 `matchChoice`가 선택지 문구를 잡아 parse 미매칭 0건.

### 로깅 샘플 (`LoggingProvider`)
```
s1 | model=mock run=smoke-N100 | 여자/30~34세/비수도권 | hash=0e0948685d06 | raw="네, 신뢰할 수 있다고 봅니다" | parsed=신뢰할 수 있다 | 0ms
s2 | model=mock run=smoke-N100 | 남자/70~74세/비수도권 | hash=0e0948685d06 | raw="음, 신뢰하기 어렵다 쪽이에요" | parsed=신뢰하기 어렵다 | 0ms
```
기록 필드: runId·model·personaId·attrs·promptHash·rawResponse·latencyMs·error. parsed choice/missing은 `StudyResult`에서 personaId로 결합.

## 3) 신뢰성 카드 (N=100)

- 1층 구성: 🟢 MAE 0.0000 · TVD 0.0000
- 2층 속성: 성·연령·지역=matched(높음), 가구원수=conditioned(중간, bridge), **혼인=inferred(낮음)** ← 표본에 15~19세(18+ 혼인 universe 밖)가 4명 포함되어 worst-wins로 강등. *2층 카드는 표본 의존적*임을 재확인.
- 3층 응답: not-measured (키 필요, 묶음 B)
- 가드레일: synthetic panel response · 가격·구매력 부적합(소득·직업·자녀 결핍) · 저확신(혼인) 결론 사용 금지 — 전부 정상 노출

## 4) 3지선다 변형 (N=100)

질문: "이 서비스, 써보고 싶나요?" / choices: `써보고 싶다` · `잘 모르겠다` · `쓰지 않을 것 같다`
- 분포: `써보고 싶다=39, 쓰지 않을 것 같다=30, 잘 모르겠다=31`, **missing 0**, 신호 split
- → 3지선다 + 자연어 응답도 파이프라인 정상.

## 5) 성공 기준 점검

| 기준 | 결과 |
|---|---|
| dry-run prompt에서 persona context 확인 가능 | ✅ system 프롬프트에 5속성+provenance+bridge+synthetic-panel |
| mock N≥100에서 분포/신뢰카드/parsed choice 정상 | ✅ N=100, 카드 정상, parse 0 미매칭 |
| missing rate 낮거나 0, 발생 시 리포트 | ✅ 0.0%, formatResult/스크립트가 비율 표기 |
| Haiku 실측을 "pipeline smoke test"로만 준비 | ✅ 라벨·로깅·저위험 질문 정의, 시장판단 아님 |
| test/build green | ✅ (게이트 통과) |

## 6) Haiku 실측 착수 전 권고

1. **첫 질문 = 저위험 신뢰/수용 질문**("AI 예산 추천 신뢰?"). 가격/구매의향은 소득축 들어온 뒤로.
2. **choices 자연스럽게** + 실측 후 **missing rate 모니터링**(mock은 0이지만 Haiku는 어미 변형으로 미매칭 가능 → `buildPrompt`의 "그대로 포함" 지시가 1차 방어).
3. **`LoggingProvider`로 raw/latency/error 저장**, 전원 실패 시 `aggregate` throw로 false consensus 차단(이미 구현).
4. **비결정성 대비**: VCR(`RecordedProvider`) 녹화로 재현성 확보.
5. 결과는 항상 **synthetic panel response / 실제 시장 반응 아님 / 실측 전 가설 탐색**으로 라벨(formatResult 배너·카드 가드레일에 반영됨).

→ **파이프라인은 Haiku 실측(issue #2) 착수 준비 완료. `ANTHROPIC_API_KEY`만 있으면 됨.** 단 첫 실행은 "시장 판단"이 아니라 **pipeline/parsing/missing-rate 점검**으로 라벨링할 것.

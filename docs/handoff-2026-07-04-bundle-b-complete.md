# synth-persona 세션 인계 — 묶음 B 완료·main 병합 · 2026-07-04

## 0. 한 줄 요약

Plan 4(창업자 리포트) + Live Inference(실측 준비) + 묶음 B(B1·B2·B3) 전부 완료되어 **PR #5로 main에 병합**됨. 제품 루프(질문 → 실측 → 실데이터 근거 리포트)가 `npm run report:live` 하나로 완주된다. 테스트 233개(키 없이) 그린.

## 1. 현재 상태

- 브랜치: **main** (PR #5 머지 완료, feature 브랜치 삭제됨), working tree 깨끗
- issue #4(B3) 클로즈
- **운용 결정: OpenAI 단독** — 기본 `--provider openai`, `.env`에 `OPENAI_API_KEY` 필요. ClaudeProvider는 BYOK/교차 검증용으로 코드 유지(`--provider anthropic`)
- 라이브 검증 완료(gpt-4o-mini, 누적 ~\$0.07): B1 go(조건부) · B2 순서/문구 편향 계측(low) · B3 LLM 처방 실데이터 근거 확인
- 실측 권장 플래그: `--counterbalance --repeats 3` (B2에서 마지막 선택지 편향·run간 분산 ±20%p 실측됨)

## 2. 주요 실행 명령

```
npm run report:demo                                        # 키 없는 데모
npm run report:live -- --n 30 --repeats 3 --counterbalance # 실측 리포트 (openai)
npm run b2:live                                            # 응답 신뢰도 계측
node dist/cli/main.js --question "..." --choices "A,B" --n 30 --seed 7 --source census --counterbalance --repeats 3
```

## 3. 다음 후보 — 2026-07-04 오후 갱신

~~1. n=100+ 재확인~~ ✅ 완료 — 동률 해소(41.7% vs 22.7%), 1인가구 저항 n=138 재현 (b1 노트 후속 섹션)
~~2. counterbalance 기본값화~~ ✅ 완료 — 라이브 기본 on, --no-counterbalance로 해제
~~3. 오픈소스 정리~~ ✅ 대부분 완료 — 사용자용 README·CHANGELOG·--help·친절한 전원실패 에러·**v0.2.0 릴리스** (https://github.com/Choihello/synth-persona/releases/tag/v0.2.0)

남은 결정/후보:
1. **npm 배포 여부** — package.json은 private:true 유지 중. 배포하려면 name 충돌 확인·files 필드·prepublish 정리 필요 (사용자 결정 대기)
2. **플랫폼화 탐색** — 웹 UI. 별도 brainstorming 사이클 권장, 키 모델(BYOK vs 호스팅) 결정 선행
3. Batches API — n=1000+ 상시 운용이 보이면 (현재 비용 수준에선 YAGNI)
4. Claude 교차 실측 (보류 — --provider anthropic으로 즉시 가능)

## 4. 실측 노트

- docs/b1-live-notes-2026-07-04.md (B1 go 판정·1인가구 반직관 발견)
- docs/b2-live-notes-2026-07-04.md (편향 계측·카운터밸런스 효과 41%)
- docs/b3-live-notes-2026-07-04.md (LLM 처방 품질·비용)

## 5. 불변식 (유지)

synthetic panel 과장 금지 · 처방 초안 라벨(basis: heuristic|llm) · `src/types.ts`·`aggregate` 무수정 · 런타임 의존성 @anthropic-ai/sdk 단일(OpenAI는 내장 fetch) · 테스트 키 없이 그린

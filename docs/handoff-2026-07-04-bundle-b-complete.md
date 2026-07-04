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

## 3. 다음 후보 (우선순위 미정 — 사용자 결정)

1. **n=100+ 재확인**: B1의 새벽배송·반찬 동률(7/30)이 우연인지 — Batches API(50% 할인) 도입 검토 시점
2. **counterbalance/repeats 기본값화**: 실측 경로에서 기본 on으로 할지 (현재 opt-in)
3. **오픈소스/BYOK 정리**: README 사용자용 문서, 키 안내, 라이선스
4. **플랫폼화 탐색**: humanize-web-architect류 웹 UI — 사용자 키 vs 호스팅 모델 결정 필요
5. Claude 교차 실측 (보류 중 — 크레딧 확보 시 명령 3개로 즉시 가능, b3 노트 참조)

## 4. 실측 노트

- docs/b1-live-notes-2026-07-04.md (B1 go 판정·1인가구 반직관 발견)
- docs/b2-live-notes-2026-07-04.md (편향 계측·카운터밸런스 효과 41%)
- docs/b3-live-notes-2026-07-04.md (LLM 처방 품질·비용)

## 5. 불변식 (유지)

synthetic panel 과장 금지 · 처방 초안 라벨(basis: heuristic|llm) · `src/types.ts`·`aggregate` 무수정 · 런타임 의존성 @anthropic-ai/sdk 단일(OpenAI는 내장 fetch) · 테스트 키 없이 그린

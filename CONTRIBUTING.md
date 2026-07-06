# Contributing

## 개발 셋업

```console
# Node 24+
npm install
npm run build        # tsup — dist/ 생성 (CLI·eval 스크립트가 dist를 실행)
```

## 게이트 4종 — PR 전 전부 그린이어야 합니다

```console
npx vitest run       # 전부 API 키 없이 돕니다 (결정적 mock·seed 고정)
npx tsc --noEmit
npm run lint         # biome
cd app && npx next build
```

## 불변식

- 테스트는 **API 키 없이** 그린이어야 합니다 — 키가 필요한 검증은 `eval/`의
  live 스크립트로 분리합니다
- 코어(`src/`) 런타임 의존성은 @anthropic-ai/sdk 단일, `web/`은
  @libsql/client 단일 — 새 런타임 의존성은 이슈에서 먼저 논의해 주세요
- `src/types.ts` 기존 필드는 수정하지 않습니다 (optional 추가는 논의 후)
- synthetic panel 결과를 실제 시장 반응처럼 표현하는 카피는 받지 않습니다
- Nemotron-Personas-Korea (CC BY 4.0) 저작자표시를 유지합니다
- 페르소나 카드·프롬프트 문구를 바꿀 때는 편향 프로브(`npm run b2:live` 계열)를
  재실행해 회귀를 확인합니다. 프롬프트에 특정 상품 카테고리 예시를 열거하지
  마세요 — 해당 카테고리 제품의 응답이 일괄 왜곡됩니다(프라이밍). 시장 트렌드
  등 외부 신호는 리포트/애널리스트 계층에만 주입합니다

## 커밋

conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)를 따릅니다.

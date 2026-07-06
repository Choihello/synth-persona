# 오픈소스 릴리스 v0.4.0 — 다듬기 설계 (2026-07-06)

## 0. 배경과 방향

이 저장소를 오픈소스 공개 품질로 다듬어 릴리스하기로 확정됐다 (2026-07-06):

- 기존 "npm 공개 스킵" 방침을 뒤집어 공개 릴리스로 전환 — public 유지
- `synth-persona` 이름 유지 (npm 이름 미점유 확인됨, 2026-07-06)

**확정된 스코프 결정 4개:**

| 결정 | 내용 |
|---|---|
| 1차 독자 | 코드를 읽는 개발자(설계 서사)와 실사용 개발자, 둘 다 동등 |
| 라이브 데모 | "창업자를 위한 0차 시장검증" 제품 언어 → **오픈소스 엔진의 라이브 데모**로 재포지셔닝 |
| npm 발행 | 스코프 포함 — 다듬기 마지막 단계에서 발행 (발행 직전 사용자 재승인) |
| 문서 언어 | 한글 본문 + 영문 서문 (README 상단 What/Why/Quickstart) |

## 1. 데모 재포지셔닝 (app/)

목표: 데모가 "팔리는 제품"이 아니라 "오픈소스 엔진의 쇼케이스"로 읽히게.

- **히어로**: kicker "창업자를 위한 0차 시장검증" → "오픈소스 합성 패널 엔진 ·
  라이브 데모" 계열. 헤드라인("가짜 90명…")·정직 섹션("이 서비스가 하지 않는 것")은
  유지 — 데모 쇼케이스로 여전히 유효
- **CTA**: 히어로 CTA 행에 GitHub 링크 추가. footer(layout.tsx)에 MIT·GitHub 동선
  (npm 링크는 §4 발행 확인 **후** 추가 — 발행 전엔 죽은 링크가 되므로 Release
  태그 회차에 묶어 push)
- **한도 문구의 CTA화** (사용자 지적 반영): 한도는 운영자 키의 비용 하드캡이므로
  유지하되, 안내를 오픈소스 전환 동선으로 바꾼다
  - landing-bottom-note: "무료 · IP당 하루 3회" → "오픈소스 데모 · IP당 하루 3회 —
    무제한은 자기 키로 직접 실행 (GitHub)"
  - `web/limits.ts` 한도 소진 메시지: "내일 다시 시도" → "GitHub에서 자기 키로
    직접 실행하면 제한이 없습니다" 계열 + 저장소 URL
- **/new**: 상단에 "이 데모는 오픈소스 프로젝트의 쇼케이스입니다" 한 줄 + 저장소 링크
- **사이트 OG** description을 엔진 톤으로 조정 (리포트 OG는 무수정)
- 검증: 프리뷰 도구 라이트/다크/모바일 computed style + 배포 후 라이브 스모크

## 2. README 재정비

기존 269줄은 자산 — 재작성이 아니라 보강.

- **영문 서문 ~20줄** 추가 (배지 아래): What / Why / Quickstart(mock 한 줄) /
  Live demo 링크. 본문은 한글 유지
- **웹 서비스 섹션 갱신**: 라이브 데모 URL, 리포트 **스크린샷 1~2장**
  (`docs/screenshots/`, 프리뷰 도구로 촬영 — 라이트/다크 각 1장), 기능 요약
  (쉬운 요약 카드·2중 유의성 게이트·Nemotron 서사·OG 공유)
- **로드맵 갱신**: "웹 UI" 체크, v0.2~0.3에서 들어간 항목 반영 (Wilson 2티어
  통계 게이트 · LLM 관련성 게이트 · Nemotron 서사 페르소나 · 쉬운 요약 카드 ·
  Vercel+Turso 배포)

## 3. 결함 청산 (2026-07-06 점검에서 발견)

1. **미존재 리포트 ID → HTTP 404**: `app/src/app/r/[id]/page.tsx`가 "찾을 수
   없습니다" UI를 200으로 반환 중. `notFound()` 호출 + `not-found.tsx`로 전환
   (기존 안내 문구·백링크 유지). generateMetadata의 row 부재 분기도 확인
2. **metadataBase 명시**: 빌드 경고 제거 (`https://synth-persona-app.vercel.app`).
   프로덕션 og:image는 이미 절대 URL로 정상이나 로컬 빌드 위생 차원
3. **쉬운 요약 문구 정합**: `web/easy-summary.ts`에서 "세그먼트 간 뚜렷한 차이는
   없었어요"(카드)와 "일부 세그먼트에서 상대적으로 긍정 신호가 강합니다"(한 줄
   요약)가 동일 리포트에 공존 가능 — weakSignals 존재 시 카드 문구가 이를
   반영하도록 조건 분기 정리. **TDD**: web/ 단위 테스트 먼저
4. **.gitignore 보강** (보안 실사 후속): `.env` → `.env*` + `!.env.example`.
   Next.js 관례(`.env.local` 등) 변형 파일의 미래 커밋 사고 예방

**보안 실사 결과 (2026-07-06, 기록용):** git 이력 전체(--all)를 키·토큰
패턴(sk-* / JWT / `OPENAI_API_KEY=`)으로 스캔 — 실키 검출 0건. 이력상 env류
파일은 `.env.example`(빈 값 템플릿)뿐.

## 4. npm 발행 (최종 게이트)

- `package.json`: `"private": true` 제거, 버전 **0.4.0**
- `npm pack --dry-run`으로 files 구성·크기 검증 (Nemotron 풀 985KB 포함 —
  총 크기가 수 MB를 크게 넘으면 사용자와 상의)
- 발행 순서: 모든 다듬기·게이트·push 완료 후 **발행 직전 사용자 재승인** →
  `npm publish` (사용자 npm 계정 로그인 필요)
- **한글 경로 예비책**: publish가 경로 문제로 실패하면 `npm pack` 산출물
  tarball을 영문 임시 경로로 옮겨 `npm publish <tarball>`로 우회
- 발행 후: README 설치 명령·npm 뱃지 동작 확인

## 5. 커뮤니티 최소 세트 · 릴리스

- **CONTRIBUTING.md** 경량 신설: 개발 셋업(node 24, npm i, build), 게이트 4종
  (vitest·tsc·lint·app build), 커밋 관례, "키 없이 테스트 그린" 불변식 안내
- **CHANGELOG.md**: v0.4.0 항목 (재포지셔닝·404·npm 공개 등)
- push(사용자 승인 게이트) → Vercel 자동 배포 → **GitHub Release v0.4.0** 태그
  → 라이브 스모크로 마감

## 6. 실행 순서

§3 결함 청산 → §1 랜딩 재포지셔닝 → §2 README·스크린샷 → §5 문서 →
게이트 4종 + 최종 리뷰 → **push 승인** → 배포·라이브 스모크 →
§4 npm 발행(재승인) → Release 태그.

## 7. 불변식 (전 구간 유지)

- `src/types.ts` 기존 필드 무수정 · `src/aggregate` 무수정
- 코어 런타임 의존성 단일(@anthropic-ai/sdk) · web은 @libsql/client 단일
- 테스트 키 없이 그린 · seed 재현성
- synthetic panel 과장 금지 · Nemotron CC BY 4.0 저작자표시 유지

## 8. 테스트·검증 전략

- web/ 로직 변경(easy-summary, limits 메시지)은 단위 테스트 선행(TDD)
- app/ 라우트 변경(404, 랜딩)은 `next build` + 프리뷰 도구 + 라이브 스모크
- 404는 배포 후 `curl -w %{http_code}`로 미존재 ID가 404 반환하는지 확인
- 전체 게이트: vitest 321+ · tsc · biome · app next build

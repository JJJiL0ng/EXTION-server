# 백엔드 리팩토링 작업 기록

## 진행 원칙

- 기준 브랜치: `refactor`
- 작업 브랜치: `backend/refactor-NNN-topic`
- 사유: 저장소에 `refactor` 브랜치가 이미 존재해 Git ref 충돌 때문에 `refactor/backend-...` 브랜치를 만들 수 없다.
- 각 작업은 별도 브랜치에서 커밋한 뒤 `refactor`로 로컬 머지한다.

## Step 1. 테스트 기준선 수집

- 상태: 완료
- 브랜치: `backend/refactor-001-test-baseline`
- 작업 기간: 2026-06-14 ~ 2026-06-14
- 목적:
  - 서버 리팩토링 전에 현재 build/test/e2e 상태를 기준선으로 남긴다.
- 기존 문제:
  - unit test는 `test/jest-setup.ts`가 예전 Prisma 경로인 `src/prisma/prisma.service`를 mock해 실행 전에 실패한다.
  - e2e test는 `test/jest-e2e.json`에 `src/*` alias 매핑이 없어 `src/v2/...` import를 해석하지 못한다.
- 설계 판단:
  - 이 단계에서는 테스트 설정을 바로 고치지 않고 실패를 기준선으로 기록했다.
  - 실제 수정은 Step 2 테스트 fixture/mock 정리에서 다룬다.
- 대안과 트레이드오프:
  - 테스트 설정을 즉시 수정할 수 있지만, 기준선과 수정 결과가 한 커밋에 섞이면 기존 문제와 개선 효과가 분리되지 않는다.
- 수정한 주요 파일:
  - `docs/refactoring/backend-step.md`
  - `../refactoring-guide/SOP/backend-step.md`
- 변경 내용:
  - Node/npm 버전과 build/test/e2e 결과 기록
  - 브랜치 네이밍 충돌과 실제 작업 브랜치 규칙 기록
- Before/After:
  - Before: 서버 repo 안에 백엔드 리팩토링 기록 파일 없음
  - After: 서버 repo에서 추적 가능한 기준선 기록 추가
- 포트폴리오 평가 포인트:
  - 기존 실패를 숨기지 않고 원인과 다음 수정 단위를 분리했다.
- 리뷰어가 먼저 볼 파일:
  - `docs/refactoring/backend-step.md`
  - `test/jest-setup.ts`
  - `test/jest-e2e.json`
- DB/Prisma 영향:
  - 없음
- API/WebSocket 영향:
  - 없음
- 검증:
  - 실행 디렉터리: `/Users/jihong/Documents/EXTION/EXTION-server`
  - `node --version`: `v22.20.0`
  - `npm --version`: `10.9.3`
  - `npm run build`
  - `npm run test`
  - `npm run test:e2e`
- 검증 결과:
  - `npm run build`: 성공
  - `npm run test`: 실패. `test/jest-setup.ts`의 `src/prisma/prisma.service` mock 경로가 현재 `src/v2/prisma/prisma.service.ts` 구조와 맞지 않음.
  - `npm run test:e2e`: 실패. e2e Jest 설정에 `src/*` alias 매핑이 없어 `src/v2/ai-chat/ai-chat.service` import를 찾지 못함.
- 남은 리스크:
  - 테스트가 실행 전 설정 단계에서 실패하므로 실제 서비스 로직 회귀 여부는 아직 확인하지 못했다.
- 다음 단계:
  - Step 2에서 Jest alias와 Prisma mock 경로를 현재 구조에 맞추고, 테스트 fixture 기반을 정리한다.
- 관련 커밋/PR:
  - 로컬 커밋 예정: `docs: 백엔드 기준선 문서 추가`

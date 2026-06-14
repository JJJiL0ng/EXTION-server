# EXTION Server

AI 기반 스프레드시트 작업을 처리하는 EXTION의 NestJS 백엔드입니다. 프론트엔드의 시트 편집 화면, AI 채팅, 스키마 변환 플로우를 위해 REST API, WebSocket gateway, Prisma 기반 버전 관리, LLM 실행 경계를 제공합니다.

## 역할

- 사용자/게스트 세션 생성과 초대 코드 흐름 지원
- 스프레드시트 JSON 데이터 저장, 버전 생성, rollback, 파일명 변경
- Socket.IO 기반 AI 채팅 job lifecycle 처리
- LangChain/Gemini 기반 task routing, 데이터 편집 명령 생성, 파일명 생성
- source/target spreadsheet를 이용한 schema mapping script 생성과 multiturn 수정
- 운영 설정 검증, CORS/payload limit, REST/WebSocket error payload 정리

## 집중 리팩토링 스프린트

이 저장소의 `refactor` 브랜치는 개인 주말/여유 시간에 진행한 집중 리팩토링 스프린트 결과입니다. 단순히 기능을 추가하는 대신, 기존 동작을 유지하면서 서버 코드를 리뷰 가능한 단위로 나누고 테스트 가능한 경계를 만드는 데 초점을 뒀습니다.

작업은 `backend/refactor-001-*`부터 `backend/refactor-010-*`까지 단계별 브랜치로 분리했고, 각 단계의 의도와 검증 결과는 [docs/refactoring/backend-step.md](docs/refactoring/backend-step.md)에 기록했습니다.

| Step | 주제 | 핵심 결과 |
| --- | --- | --- |
| 1 | 테스트 기준선 | 기존 build/test/e2e 상태와 실패 원인 기록 |
| 2 | 테스트 fixture | Jest alias, Prisma mock, e2e override 정리 |
| 3 | env/config | 필수 env 검증, CORS/payload helper 분리 |
| 4 | AiChatService | message/branch/spreadsheet context 책임 분리 |
| 5 | AiChatGateway | job registry, rate limit, event name 경계 분리 |
| 6 | versioning tests | sheet versioning과 rollback 회귀 테스트 추가 |
| 7 | repository | Prisma query 경계를 repository로 분리 |
| 8 | LLM factory | Gemini/Extion model 생성 로직을 factory로 통합 |
| 9 | error/observability | REST exception filter와 socket error payload 정리 |
| 10 | legacy cleanup | 주석 처리 controller, raw debug log, dead code 제거 |

## 현재 구조

```text
src/common/config       env validation, CORS, payload limit helper
src/common/errors       REST/WebSocket error response helper
src/v2/ai-agent         LLM model factory, task manager, data edit runners
src/v2/ai-chat          WebSocket gateway, chat facade, branch/message services
src/v2/sheet            spreadsheet JSON 저장, versioning, repository
src/v2/schema-converter schema mapping, mapping script, multiturn editing
src/v2/user             guest/user creation
test                    e2e setup, Prisma mock factory
docs/refactoring        리팩토링 기록
```

## 기술 스택

- NestJS 11, TypeScript
- Prisma 6, PostgreSQL
- Socket.IO, `@nestjs/websockets`
- LangChain, Google Gemini
- Jest, Supertest
- Swagger, Helmet, Firebase Admin

## 실행

```bash
npm install
npm run db:generate
npm run start:dev
```

기본 서버 포트는 `PORT` env 또는 `8080`입니다.

## 주요 환경 변수

```text
DATABASE_URL=postgresql://...
GOOGLE_API_KEY=...
CORS_ORIGINS=http://localhost:3000,https://your-web-domain.com
PORT=8080
JSON_BODY_LIMIT=10mb
URLENCODED_BODY_LIMIT=10mb
```

`NODE_ENV=test`에서는 unit/e2e 테스트가 외부 DB/API key 없이 부트스트랩될 수 있도록 필수 외부 env 검증을 완화합니다.

## 검증

`refactor` 브랜치 최종 검증 결과:

```bash
npm run test
npm run test:e2e
npm run build
```

- `npm run test`: 성공, 12 suites / 41 tests
- `npm run test:e2e`: 성공, 1 suite / 1 test
- `npm run build`: 성공

현재 `npm run lint`는 기존 `eslint.config.mjs`가 전체 주석 처리된 빈 config라 실패합니다. 임시로 설정을 켜 확인했을 때 기존 코드 전반에서 대량의 lint 문제가 드러나므로, lint 복구는 별도 브랜치에서 다룰 후속 과제로 분리했습니다.

## 로컬 DB/배포 관련 명령

```bash
npm run db:push
npm run db:migrate:dev
npm run db:migrate:status
npm run db:health
npm run railway:build
npm run railway:start
```

## 포트폴리오에서 볼 지점

- 큰 service/gateway 파일을 facade와 내부 service로 나누면서 public API/WebSocket 계약은 유지했습니다.
- LLM 호출, DB transaction, socket job lifecycle, sheet versioning을 서로 다른 경계로 분리했습니다.
- 실패한 기준선도 문서화하고, 각 단계에서 어떤 검증을 했는지 남겼습니다.
- 운영 로그에 남을 수 있는 raw LLM output debug log를 제거했습니다.

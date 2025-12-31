<div align="center">

#  Extion AI - Backend Server

<img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />
<img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
<img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" />
<img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" />
<img src="https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white" />
<img src="https://img.shields.io/badge/Google_Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white" />

### AI-Powered Excel Automation Platform

*Repetitive Excel tasks automated with intelligent AI agents*

[Website](https://www.extion.ai/) • [📂 Frontend Repo](https://github.com/JJJiL0ng/EXTION-web)

---

**🎯 120+ Global Users** • **🌍 Served in 15+ Countries** • **⚡ 4-Month Production Service**

</div>

---

##  Overview

**Extion AI**는 반복적인 엑셀 작업을 AI로 자동화하는 SaaS 플랫폼입니다. Google Gemini API와 LangChain을 활용한 지능형 에이전트가 데이터 가공, 정렬, 함수 적용 등을 자동으로 수행합니다.

###  Key Features

-  **AI Excel Agent**: 자연어로 엑셀 작업 자동화
  - 데이터 가공 및 정렬
  - 함수 자동 적용
  - 패턴 기반 데이터 처리
  
-  **Sheet Mapping Automation**: 두 시트 간 스크립트 기반 자동 매핑
  
-  **Global Service**: 국내 50+ / 해외 70+ 활성 사용자
  
-  **Production-Ready**: Railway 배포 및 실시간 서비스 운영 (2025.06 - 2025.10)

---

##  Architecture

```
┌─────────────────┐
│   Next.js App   │
│  (Vercel Host)  │
└────────┬────────┘
         │ REST API
         ▼
┌─────────────────┐      ┌──────────────────┐
│  NestJS Server  │◄────►│   PostgreSQL     │
│  (Railway Host) │      │  (Prisma ORM)    │
└────────┬────────┘      └──────────────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│    LangChain    │◄────►│   Gemini API     │
│   AI Pipeline   │      │  (GCP Service)   │
└─────────────────┘      └──────────────────┘
```

---

##  Tech Stack

### Backend Framework
- **NestJS**: Enterprise-grade Node.js framework
- **TypeScript**: Type-safe development
- **Prisma ORM**: Modern database toolkit

### AI & Automation
- **LangChain**: AI orchestration framework
- **Google Gemini API**: Advanced language model
- **Custom AI Agents**: Excel-specific automation logic

### Database & Infrastructure
- **PostgreSQL**: Robust relational database
- **Railway**: Cloud deployment platform
- **GCP**: Google Cloud Platform services

---

##  Project Structure

```
EXTION-server/
├── src/
│   ├── modules/
│   │   ├── auth/           # JWT 인증 및 사용자 관리
│   │   ├── excel/          # 엑셀 파일 처리 로직
│   │   ├── ai-agent/       # LangChain AI 에이전트
│   │   ├── mapping/        # 시트 매핑 자동화
│   │   └── file/           # 파일 업로드/다운로드
│   ├── common/             # 공통 유틸리티 및 필터
│   ├── config/             # 환경 설정
│   └── main.ts             # 애플리케이션 엔트리 포인트
├── prisma/
│   ├── schema.prisma       # 데이터베이스 스키마
│   └── migrations/         # DB 마이그레이션
├── test/                   # E2E 테스트
└── scripts/                # 배포 및 유틸리티 스크립트
```

---

##  Getting Started

### Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
PostgreSQL >= 14
```

### Installation

```bash
# Clone the repository
git clone https://github.com/JJJiL0ng/EXTION-server.git
cd EXTION-server

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate
```

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/extion"

# Authentication
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"

# AI Services
GEMINI_API_KEY="your-gemini-api-key"

# Server
PORT=3000
NODE_ENV="development"

# CORS (for production)
FRONTEND_URL="https://your-frontend-url.com"
```

### Development

```bash
# Development mode with hot-reload
npm run start:dev

# Production build
npm run build

# Production mode
npm run start:prod
```

### Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

---

##  Key Technical Achievements

### 1. **AI-Powered Automation Engine**
LangChain과 Gemini API를 활용한 지능형 엑셀 자동화 파이프라인 구축
- 자연어 명령을 실행 가능한 엑셀 작업으로 변환
- 컨텍스트 기반 데이터 처리 로직 자동 생성

### 2. **Scalable Microservices Architecture**
모듈식 NestJS 아키텍처로 확장 가능한 백엔드 구조 설계
- 각 기능별 독립적인 모듈 구성
- Prisma ORM을 통한 효율적인 데이터베이스 관리

### 3. **Global User Base**
4개월간 120+ 글로벌 사용자에게 안정적인 서비스 제공
- 국내 50+ 사용자
- 해외 70+ 사용자 (미국, 유럽, 아시아 등)

### 4. **Production Deployment**
Railway 플랫폼을 활용한 CI/CD 파이프라인 구축
- 자동 배포 및 모니터링
- Zero-downtime deployment

---

##  Security Features

- **JWT Authentication**: 토큰 기반 인증 시스템
- **Password Hashing**: bcrypt를 이용한 안전한 비밀번호 저장
- **CORS Protection**: 프론트엔드 도메인 화이트리스트
- **Rate Limiting**: API 요청 제한으로 DDoS 방어
- **Input Validation**: DTO 기반 요청 데이터 검증

---

##  Performance Optimization

- **Database Indexing**: 주요 쿼리 성능 최적화
- **Caching Strategy**: 자주 사용되는 데이터 캐싱
- **Async Processing**: 대용량 파일 처리 시 비동기 작업 큐 활용
- **Connection Pooling**: 데이터베이스 연결 풀 관리

---

##  Contributing

This is a portfolio project and is not actively maintained. However, feedback and suggestions are welcome!

---

##  License

This project is licensed under the MIT License.

---

##  Developer

**LEE JIHONG**

- GitHub: [@JJJiL0ng](https://github.com/JJJiL0ng)
- Portfolio: [Extion AI](https://www.extion.ai/)

---

##  Project Status

>  **Note**: This service was operational from June 2025 to October 2025 and is currently discontinued due to operational reasons. This repository is maintained for portfolio purposes.

---

<div align="center">

**Built with using NestJS, TypeScript, and LCEL**

 If you found this project interesting, please consider giving it a star!

</div>

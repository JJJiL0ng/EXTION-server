#!/bin/bash

# Railway 완전 자동화 배포 스크립트
set -e  # 오류 발생 시 스크립트 중단

echo "🚀 Extion Server - Railway 자동 배포 시작"
echo "환경: ${NODE_ENV:-production}"
echo "시간: $(date)"

# 1. 빌드 (Railway에서 이미 npm install 실행됨)
echo "🔨 애플리케이션 빌드 중..."
npm run build

# 3. 마이그레이션 (오류 시 자동 복구)
echo "🗃️ 데이터베이스 마이그레이션 중..."
if ! npm run db:migrate; then
    echo "⚠️ 마이그레이션 오류 감지. 자동 복구 시도 중..."
    
    # P3009 오류 해결 시도
    echo "🔧 실패한 마이그레이션 해결 중..."
    npx prisma migrate resolve --rolled-back 20250624130705_update_message_mode_enum || echo "이미 해결됨"
    
    # 마이그레이션 재시도
    echo "🔄 마이그레이션 재시도 중..."
    npm run db:migrate
fi

# 4. Prisma 클라이언트 재생성
echo "⚡ Prisma 클라이언트 생성 중..."
npm run db:generate

# 5. 최종 상태 확인
echo "✅ 마이그레이션 상태 확인..."
npm run db:migrate:status

# 6. 서버 시작
echo "🎯 서버 시작 중..."
npm run start:prod 
#!/bin/bash

# Railway 프로덕션 환경에서 P3009 마이그레이션 오류 해결 스크립트

echo "🔧 Extion Server - 마이그레이션 문제 해결 스크립트 시작"
echo "Environment: $NODE_ENV"
echo "Database URL: ${DATABASE_URL:0:30}..."

# 1. 현재 마이그레이션 상태 확인
echo "📊 현재 마이그레이션 상태 확인 중..."
npx prisma migrate status

# 2. 실패한 마이그레이션을 롤백된 것으로 표시
echo "🔄 실패한 마이그레이션 해결 시도 중..."
npx prisma migrate resolve --rolled-back 20250624130705_update_message_mode_enum || echo "이미 해결됨 또는 해당 없음"

# 3. 기존 데이터 변환 (enum 값 호환성 문제 해결)
echo "🔄 기존 데이터 enum 값 변환 중..."
npx prisma db execute --stdin <<EOF
-- 기존 DATAFIX를 DATA_FIX로 변환
UPDATE "Message" SET "mode" = 'DATA_FIX' WHERE "mode" = 'DATAFIX';

-- 기존 DATAGENERATION을 DATA_GENERATION으로 변환  
UPDATE "Message" SET "mode" = 'DATA_GENERATION' WHERE "mode" = 'DATAGENERATION';

-- 기존 ARTIFACT를 FUNCTION으로 변환 (또는 적절한 값으로)
UPDATE "Message" SET "mode" = 'FUNCTION' WHERE "mode" = 'ARTIFACT';

-- MessageType도 동일하게 처리
UPDATE "Message" SET "type" = 'DATA_GENERATION' WHERE "type" = 'DATAGENERATION';
UPDATE "Message" SET "type" = 'FUNCTION' WHERE "type" = 'ARTIFACT';
UPDATE "Message" SET "type" = 'DATA_EDIT' WHERE "type" = 'DATA_FIX';
EOF

# 4. 마이그레이션 재배포
echo "🚀 마이그레이션 재배포 중..."
npx prisma migrate deploy

# 5. Prisma 클라이언트 재생성
echo "⚡ Prisma 클라이언트 재생성 중..."
npx prisma generate

# 6. 최종 상태 확인
echo "✅ 최종 마이그레이션 상태 확인..."
npx prisma migrate status

echo "🎉 마이그레이션 문제 해결 완료!" 
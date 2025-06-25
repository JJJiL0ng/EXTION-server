# 🚨 프로덕션 환경 문제 해결 가이드

## 📋 목차
- [CORS 오류 해결](#cors-오류-해결)
- [마이그레이션 오류 해결](#마이그레이션-오류-해결)
- [Railway 배포 문제 해결](#railway-배포-문제-해결)

## 🌐 CORS 오류 해결

### 문제 상황
```
Access to fetch at 'https://extion-server-production.up.railway.app/spreadsheet/data/save' 
from origin 'https://extion.co' has been blocked by CORS policy
```

### 해결 방법

1. **허용된 Origin 확인**
   - `https://extion.co` ✅
   - `https://www.extion.co` ✅
   - `https://extion-beta.vercel.app` ✅

2. **CORS 설정 강화 완료**
   - Preflight 요청 처리 개선
   - 동적 Origin 검증 추가
   - 추가 헤더 허용

3. **디버깅 방법**
   ```bash
   # 서버 로그 확인
   curl -X OPTIONS https://extion-server-production.up.railway.app/spreadsheet/data/save \
        -H "Origin: https://extion.co" \
        -H "Access-Control-Request-Method: POST" \
        -v
   ```

## 🗃️ 마이그레이션 오류 해결

### P3009 오류: 실패한 마이그레이션 감지

#### Railway에서 자동 해결 (권장)
```bash
# Railway 콘솔에서 실행
./scripts/fix-migration.sh
```

#### 수동 해결 방법
```bash
# 1. 마이그레이션 상태 확인
npm run db:migrate:status

# 2. 실패한 마이그레이션 해결
npx prisma migrate resolve --rolled-back 20250624130705_update_message_mode_enum

# 3. 마이그레이션 재배포
npm run db:migrate

# 4. Prisma 클라이언트 재생성
npm run db:generate
```

#### 완전 초기화 (데이터 손실 주의!)
```bash
npm run db:migrate:reset
```

## 🚀 Railway 배포 문제 해결

### 1. 환경 변수 확인
```bash
# 필수 환경 변수
DATABASE_URL=postgresql://...
NODE_ENV=production
PORT=8080
```

### 2. 빌드 명령어 순서
```json
{
  "scripts": {
    "build": "nest build",
    "deploy": "npm run build && prisma migrate deploy && npm run start:prod"
  }
}
```

### 3. 서버 상태 확인
```bash
# 헬스 체크
curl https://extion-server-production.up.railway.app/health

# 마이그레이션 상태 확인
curl https://extion-server-production.up.railway.app/db-status
```

## 🔧 트러블슈팅 체크리스트

### CORS 문제
- [ ] Origin이 허용 목록에 있는지 확인
- [ ] Preflight 요청이 200으로 응답하는지 확인
- [ ] 필요한 헤더가 모두 허용되었는지 확인

### 마이그레이션 문제
- [ ] 데이터베이스 연결 상태 확인
- [ ] 실패한 마이그레이션 목록 확인
- [ ] Prisma 스키마와 DB 상태 동기화 확인

### 서버 응답 문제
- [ ] 서버가 정상적으로 시작되었는지 확인
- [ ] 포트 8080이 올바르게 바인딩되었는지 확인
- [ ] 로드 밸런서/프록시 설정 확인

## 📞 긴급 상황 대응

### 즉시 해결이 필요한 경우
1. Railway 콘솔에서 서비스 재시작
2. 마이그레이션 스크립트 실행: `./scripts/fix-migration.sh`
3. 로그 모니터링으로 문제 확인

### 연락처
- 개발팀: [연락처 정보]
- 긴급 상황: [긴급 연락처]

---

**⚠️ 주의사항**
- 프로덕션 환경에서는 항상 데이터 백업 후 작업
- 마이그레이션 롤백 시 데이터 손실 가능성 고려
- 변경 사항은 반드시 개발/스테이징 환경에서 먼저 테스트 
# 프론트엔드 API 목업 데이터

이 문서는 백엔드가 정상적으로 작동하기 위해 프론트엔드에서 보내야 하는 API 요청 데이터의 예시를 제공합니다.

## 1. 스프레드시트 생성 (POST /v2/table-data-json-save/create)

### 필수 헤더
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer {JWT_TOKEN}"
}
```

### 요청 본문 (Body)
```json
{
  "fileName": "사용자 데이터 분석",
  "spreadsheetId": "123e4567-e89b-12d3-a456-426614174000",
  "chatId": "456e7890-e89b-12d3-a456-426614174001",
  "initialData": {
    "version": "18.1.4",
    "sheets": {
      "Sheet1": {
        "name": "Sheet1",
        "data": {
          "dataTable": {
            "A1": {
              "value": "이름"
            },
            "B1": {
              "value": "나이"
            },
            "C1": {
              "value": "직업"
            },
            "A2": {
              "value": "홍길동"
            },
            "B2": {
              "value": 30
            },
            "C2": {
              "value": "개발자"
            }
          }
        }
      }
    }
  }
}
```

### 필드 설명
- `fileName`: 스프레드시트 파일명 (1-255자, 특수문자 제한)
- `spreadsheetId`: UUID v4 형식의 스프레드시트 고유 ID (프론트에서 생성)
- `chatId`: UUID v4 형식의 채팅 세션 ID (프론트에서 생성)
- `initialData`: 선택적, 초기 데이터 구조

### 빈 스프레드시트 생성 예시
```json
{
  "fileName": "새 스프레드시트",
  "spreadsheetId": "987e6543-e21b-12d3-a456-426614174002",
  "chatId": "654e3210-e21b-12d3-a456-426614174003"
}
```

## 2. 스프레드시트 로드 (POST /v2/table-data-json-save/load)

### 요청 본문
```json
{
  "spreadSheetId": "123e4567-e89b-12d3-a456-426614174000"
}
```

## 3. 델타 적용 (PUT /v2/table-data-json-save/delta)

### 셀 값 설정
```json
{
  "action": "SET_CELL_VALUE",
  "sheetName": "Sheet1",
  "cellAddress": "A1",
  "value": "새로운 값"
}
```

### 셀 수식 설정
```json
{
  "action": "SET_CELL_FORMULA",
  "sheetName": "Sheet1",
  "cellAddress": "D1",
  "formula": "=SUM(B1:C1)"
}
```

### 셀 스타일 설정
```json
{
  "action": "SET_CELL_STYLE",
  "sheetName": "Sheet1",
  "cellAddress": "A1",
  "style": {
    "backgroundColor": "#FF0000",
    "color": "#FFFFFF",
    "fontSize": 14,
    "fontWeight": "bold",
    "textAlign": "center"
  }
}
```

### 행 삽입
```json
{
  "action": "INSERT_ROWS",
  "sheetName": "Sheet1",
  "rowIndex": 2,
  "count": 1
}
```

## 4. 일괄 델타 적용 (PUT /v2/table-data-json-save/deltas/batch)

```json
{
  "deltas": [
    {
      "action": "SET_CELL_VALUE",
      "sheetName": "Sheet1",
      "cellAddress": "A3",
      "value": "김철수"
    },
    {
      "action": "SET_CELL_VALUE",
      "sheetName": "Sheet1",
      "cellAddress": "B3",
      "value": 25
    },
    {
      "action": "SET_CELL_STYLE",
      "sheetName": "Sheet1",
      "cellAddress": "A3",
      "style": {
        "fontWeight": "bold"
      }
    }
  ]
}
```

## 5. UUID 생성 예시 (JavaScript)

프론트엔드에서 UUID를 생성하는 방법:

```javascript
// 간단한 UUID v4 생성 함수
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 또는 crypto API 사용 (최신 브라우저)
function generateUUIDCrypto() {
  return crypto.randomUUID();
}

// 사용 예시
const spreadsheetId = generateUUID();
const chatId = generateUUID();

// API 호출
const createSpreadsheetData = {
  fileName: "새 프로젝트 데이터",
  spreadsheetId: spreadsheetId,
  chatId: chatId,
  initialData: {
    version: "18.1.4",
    sheets: {
      "Sheet1": {
        "name": "Sheet1",
        "data": {
          "dataTable": {}
        }
      }
    }
  }
};
```

## 6. 전체 워크플로우 예시

```javascript
// 1. UUID 생성
const spreadsheetId = generateUUID();
const chatId = generateUUID();

// 2. 스프레드시트 생성
const createResponse = await fetch('/v2/table-data-json-save/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userToken}`
  },
  body: JSON.stringify({
    fileName: "사용자 데이터",
    spreadsheetId: spreadsheetId,
    chatId: chatId
  })
});

// 3. 데이터 입력
await fetch('/v2/table-data-json-save/delta', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userToken}`
  },
  body: JSON.stringify({
    action: "SET_CELL_VALUE",
    sheetName: "Sheet1",
    cellAddress: "A1",
    value: "이름"
  })
});
```

## 7. 중요 참고사항

1. **UUID 형식**: 모든 ID는 UUID v4 형식이어야 합니다.
2. **파일명 제한**: 특수문자 `<>:"/\|?*` 및 제어문자는 사용할 수 없습니다.
3. **필수 필드**: `spreadsheetId`와 `chatId`는 반드시 프론트엔드에서 생성하여 전달해야 합니다.
4. **델타 순서**: 델타는 시간순으로 적용되므로 순서가 중요합니다.
5. **인증**: 모든 요청에는 유효한 JWT 토큰이 필요합니다.

## 8. 에러 처리

잘못된 요청 예시와 해당 에러:

### 잘못된 UUID 형식
```json
{
  "fileName": "테스트",
  "spreadsheetId": "invalid-uuid",
  "chatId": "another-invalid-uuid"
}
```
→ 400 Bad Request: "올바른 스프레드시트 ID 형식이 아닙니다."

### 필수 필드 누락
```json
{
  "fileName": "테스트"
  // spreadsheetId, chatId 누락
}
```
→ 400 Bad Request: 필수 필드 유효성 검사 실패

### 잘못된 파일명
```json
{
  "fileName": "파일<이름>",
  "spreadsheetId": "123e4567-e89b-12d3-a456-426614174000",
  "chatId": "456e7890-e89b-12d3-a456-426614174001"
}
```
→ 400 Bad Request: "파일명에 사용할 수 없는 문자가 포함되어 있습니다."

# 스프레드시트 데이터 처리 API 명세서

## 개요
이 문서는 스프레드시트 데이터 처리를 위한 최적화된 API 데이터 구조를 정의합니다. 기존의 중복 요소들을 제거하고 일반적인 채팅 형식과 유사하게 단순화되었습니다.

## 요청 데이터 구조 (ProcessDataDto)

### 기본 구조
```typescript
interface ProcessDataDto {
  userInput: string;           // 사용자 입력 메시지
  spreadsheetData: SpreadsheetData;  // 스프레드시트 데이터
  language: string;            // 언어 설정 (기본값: 'ko')
  userId: string;              // 사용자 ID
  chatId: string;              // 채팅 ID
}
```

### SpreadsheetData 구조
```typescript
interface SpreadsheetData {
  fileName: string;            // 파일명
  activeSheet: string;         // 활성 시트명
  spreadsheetId: string;       // 스프레드시트 ID
  sheets: SimpleSheetData[];   // 시트 데이터 배열
}
```

### SimpleSheetData 구조
```typescript
interface SimpleSheetData {
  name: string;                // 시트명
  headers: string[];           // 헤더 배열
  data: string[][];            // 데이터 배열 (2차원)
}
```

## 응답 데이터 구조 (DataFixResponseDto)

### 기본 구조
```typescript
interface DataFixResponseDto {
  success: boolean;            // 성공 여부
  editedData?: EditedDataDto;  // 편집된 데이터
  changes?: ChangesDto;        // 변경 사항
  explanation?: string;        // 설명
  sheetIndex?: number;         // 시트 인덱스
  error?: string;              // 오류 메시지
  
  // 메타데이터 (선택사항)
  fileName?: string;           // 파일명
  totalSheets?: number;        // 전체 시트 수
  activeSheetIndex?: number;   // 활성 시트 인덱스
}
```

### EditedDataDto 구조
```typescript
interface EditedDataDto {
  sheetName: string;           // 시트명
  headers: string[];           // 헤더 배열
  data: string[][];            // 편집된 데이터 (2차원 배열)
}
```

### ChangesDto 구조
```typescript
interface ChangesDto {
  type: 'sort' | 'filter' | 'modify' | 'transform';  // 변경 유형
  details: string;             // 변경 세부사항
}
```

## 예시

### 요청 예시
```json
{
  "userInput": "이름순으로 정렬해주세요",
  "spreadsheetData": {
    "fileName": "employees.xlsx",
    "activeSheet": "직원목록",
    "spreadsheetId": "gs0r8ivwDZjnGYKxDtih",
    "sheets": [
      {
        "name": "직원목록",
        "headers": ["이름", "부서", "직급", "급여"],
        "data": [
          ["김철수", "개발팀", "대리", "4500000"],
          ["이영희", "마케팅팀", "과장", "5000000"],
          ["박민수", "개발팀", "팀장", "6000000"]
        ]
      }
    ]
  },
  "language": "ko",
  "userId": "user123",
  "chatId": "chat456"
}
```

### 응답 예시
```json
{
  "success": true,
  "editedData": {
    "sheetName": "직원목록",
    "headers": ["이름", "부서", "직급", "급여"],
    "data": [
      ["김철수", "개발팀", "대리", "4500000"],
      ["박민수", "개발팀", "팀장", "6000000"],
      ["이영희", "마케팅팀", "과장", "5000000"]
    ]
  },
  "changes": {
    "type": "sort",
    "details": "이름 열을 기준으로 오름차순 정렬"
  },
  "explanation": "이름을 기준으로 데이터를 오름차순으로 정렬했습니다.",
  "sheetIndex": 0,
  "fileName": "employees.xlsx",
  "totalSheets": 2,
  "activeSheetIndex": 0
}
```

## 주요 개선사항

### 1. 중복 제거
- `extendedSheetContext`, `sheetsData`, `currentData`를 `spreadsheetData` 하나로 통합
- 불필요한 메타데이터 구조 단순화

### 2. 단순화된 시트 데이터
- `SimpleSheetData`로 시트 정보를 간소화
- 필수 정보만 포함: 시트명, 헤더, 데이터

### 3. 일관된 데이터 형식
- 모든 데이터를 문자열 배열로 통일
- 2차원 배열 구조로 데이터 처리 간소화

### 4. 명확한 타입 정의
- 각 필드의 역할과 타입을 명확히 정의
- 선택적 필드와 필수 필드 구분

## 변경 유형 (Changes Type)

### sort
- 데이터 정렬 작업
- 특정 열을 기준으로 오름차순/내림차순 정렬

### filter
- 데이터 필터링 작업
- 특정 조건에 맞는 행만 선택

### modify
- 데이터 수정 작업
- 값 변경, 행/열 추가/삭제

### transform
- 데이터 변환 작업
- 구조 변경, 계산 추가, 형식 변환

## 유효성 검사

### 필수 필드
- `userInput`: 사용자 입력은 필수
- `spreadsheetData`: 스프레드시트 데이터는 필수
- `userId`, `chatId`: 사용자 식별을 위해 필수

### 데이터 형식
- 모든 데이터는 문자열로 저장
- 빈 셀은 빈 문자열("")로 표현
- null이나 undefined 사용 금지

### 배열 구조
- `headers`: 1차원 문자열 배열
- `data`: 2차원 문자열 배열
- 각 데이터 행의 길이는 헤더 길이와 일치해야 함

## 에러 처리

### 일반적인 오류
- 필수 필드 누락
- 잘못된 데이터 형식
- 시트를 찾을 수 없음
- 데이터 처리 실패

### 오류 응답 예시
```json
{
  "success": false,
  "error": "시트를 찾을 수 없습니다.",
  "explanation": "요청한 시트명이 존재하지 않습니다."
}
```

이 명세서는 스프레드시트 데이터 처리 API의 표준화된 구조를 제공하며, 프론트엔드와 백엔드 간의 데이터 교환을 위한 가이드라인을 제시합니다. 
# API 응답 형식 변경 사항 (v2.1.0)

## 개요

백엔드 AI 응답 처리 로직을 개선하여 **완전한 구조화된 JSON 응답**을 제공하도록 변경했습니다. 이는 프론트엔드에서 더 풍부한 데이터를 활용할 수 있도록 하기 위함입니다.

## 변경된 엔드포인트

### `POST /v2/main-chat/stream` (SSE 스트리밍)

#### 🔴 기존 응답 형식 (Deprecated)
```json
{
  "chatId": "f8fc9f6e-447e-4f6b-82a6-8b7badb9c1b9",
  "timestamp": "2025-08-04T04:56:47.049Z",
  "message": "**SUM**\n\n지정된 범위의 모든 숫자 값을 합산\n\n**Syntax:** =SUM(A2:A357)",
  "intent": "excel_formula",
  "formulaDetails": {
    "name": "SUM",
    "description": "지정된 범위의 모든 숫자 값을 합산",
    "syntax": "=SUM(A2:A357)",
    "parameters": [...],
    "examples": []
  }
}
```

#### ✅ 새로운 응답 형식 (v2.1.0)
```json
{
  "success": true,
  "tokensUsed": 245,
  "responseTime": 1350,
  "model": "claude",
  "cached": false,
  "confidence": 0.95,
  "analysis": {
    "detectedOperation": "데이터 필터링",
    "dataRange": "A1:D6",
    "targetCells": "A1:D6",
    "operationType": "range_operation"
  },
  "formulaDetails": {
    "name": "HideRowFilter",
    "description": "SpreadJS의 HideRowFilter를 사용하여 특정 조건에 맞는 데이터만 표시합니다.",
    "syntax": "worksheet.rowFilter(new GC.Spread.Sheets.Filter.HideRowFilter(range))",
    "parameters": [
      {
        "name": "range",
        "description": "필터를 적용할 데이터 범위",
        "required": true,
        "example": "new GC.Spread.Sheets.Range(0, 0, 6, 4)"
      }
    ],
    "spreadjsCommand": "try {\n  worksheet.suspendPaint();\n  // 실제 실행 가능한 JavaScript 코드\n  worksheet.resumePaint();\n} catch(e) {\n  console.error('실행 오류:', e);\n}"
  },
  "implementation": {
    "steps": [
      "1단계: A1:D6 범위에 HideRowFilter 설정",
      "2단계: B열(부서)에 '개발팀' 텍스트 조건 생성",
      "3단계: 필터 조건 추가 및 적용",
      "4단계: 필터링 결과 확인"
    ],
    "cellLocations": {
      "source": "A1:D6",
      "target": "A1:D6",
      "description": "전체 데이터 범위에서 B열(부서)이 '개발팀'인 행만 표시"
    }
  },
  "chatId": "f8fc9f6e-447e-4f6b-82a6-8b7badb9c1b9",
  "timestamp": "2025-08-04T04:56:47.049Z"
}
```

## 주요 변경 사항

### 1. 새로 추가된 필드들

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `success` | boolean | 요청 처리 성공 여부 |
| `tokensUsed` | number | 사용된 토큰 수 |
| `responseTime` | number | 응답 시간 (ms) |
| `model` | string | 사용된 AI 모델 ("claude") |
| `cached` | boolean | 캐시된 응답 여부 |
| `confidence` | number | AI 응답 신뢰도 (0.0-1.0) |
| `analysis` | object | 요청 분석 정보 |
| `implementation` | object | 구현 관련 상세 정보 |

### 2. 기존 필드 변경사항

| 기존 필드 | 새 필드 | 변경 내용 |
|-----------|---------|-----------|
| `message` | ❌ 제거됨 | 텍스트 메시지는 더 이상 제공하지 않음 |
| `intent` | ❌ 제거됨 | `analysis.detectedOperation`으로 대체 |
| `formulaDetails.examples` | ❌ 제거됨 | 사용하지 않음 |

### 3. 향상된 필드들

#### `formulaDetails.spreadjsCommand` (핵심 개선사항)
- **기존**: 없음
- **신규**: 실제 실행 가능한 완전한 JavaScript 코드 제공
- **예시**:
```javascript
try {
  worksheet.suspendPaint();
  
  // 데이터 범위 설정 (A1:D6, 0-based index)
  var filterRange = new GC.Spread.Sheets.Range(0, 0, 6, 4);
  
  // HideRowFilter 생성 및 적용
  var hideRowFilter = new GC.Spread.Sheets.Filter.HideRowFilter(filterRange);
  worksheet.rowFilter(hideRowFilter);
  
  // 필터 조건 설정 및 실행
  var rowFilter = worksheet.rowFilter();
  rowFilter.addFilterItem(1, condition);
  rowFilter.filter(1);
  
  worksheet.resumePaint();
  console.log('필터링 완료');
  
} catch(e) {
  console.error('필터링 실행 중 오류:', e);
  worksheet.resumePaint();
}
```

## 의도별 응답 형식

### Excel Formula 응답
```typescript
interface ExcelFormulaResponse {
  success: boolean;
  tokensUsed: number;
  responseTime: number;
  model: string;
  cached: boolean;
  confidence: number;
  analysis: {
    detectedOperation: string;  // "계산", "집계", "데이터변환" 등
    dataRange: string;          // "A1:D10"
    targetCells: string;        // "E1" 또는 "E1:E10"
    operationType: 'single_cell' | 'multiple_cells' | 'range_operation';
  };
  formulaDetails: {
    name: string;               // 함수명
    description: string;        // 상세 설명
    syntax: string;            // 함수 문법
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      example: string;
    }>;
    spreadjsCommand: string;    // 🔥 실행 가능한 JavaScript 코드
  };
  implementation: {
    steps: string[];           // 실행 단계
    cellLocations: {
      source: string;          // 원본 데이터 범위
      target: string;          // 결과 셀 위치
      description: string;     // 작업 설명
    };
  };
  chatId: string;
  timestamp: string;
}
```

### Python Code Generator 응답
```typescript
interface PythonCodeResponse {
  success: boolean;
  tokensUsed: number;
  responseTime: number;
  model: string;
  cached: boolean;
  confidence: number;
  codeGenerator: {
    pythonCode: string;        // 완전한 실행 가능한 파이썬 코드
    explanation: string;       // 코드 설명
  };
  chatId: string;
  timestamp: string;
}
```

### Whole Data Transformation 응답
```typescript
interface WholeDataResponse {
  success: boolean;
  tokensUsed: number;
  responseTime: number;
  model: string;
  cached: boolean;
  confidence: number;
  dataTransformation: {
    transformedJsonData: string;  // 변환된 SpreadJS JSON 데이터
  };
  chatId: string;
  timestamp: string;
}
```

### General Help 응답
```typescript
interface GeneralHelpResponse {
  success: boolean;
  tokensUsed: number;
  responseTime: number;
  model: string;
  cached: boolean;
  confidence: number;
  generalHelp: {
    directAnswer: string;
    additionalResources?: Array<{
      title: string;
      description: string;
      link?: string;
    }>;
  };
  chatId: string;
  timestamp: string;
}
```

## 프론트엔드 마이그레이션 가이드

### 1. 타입 정의 업데이트
```typescript
// 기존 타입 정의를 위의 새로운 인터페이스로 교체

// 기존 (삭제 필요)
interface OldChatResponse {
  chatId: string;
  timestamp: string;
  message: string;        // ❌ 제거됨
  intent: string;         // ❌ 제거됨
  formulaDetails?: {...}; // ⚠️ 구조 변경됨
}

// 신규 (적용 필요)
interface NewChatResponse {
  success: boolean;       // ✅ 신규
  tokensUsed: number;     // ✅ 신규
  responseTime: number;   // ✅ 신규
  model: string;          // ✅ 신규
  cached: boolean;        // ✅ 신규
  confidence: number;     // ✅ 신규
  analysis?: {...};       // ✅ 신규
  formulaDetails?: {...}; // ⚠️ 구조 변경됨 (spreadjsCommand 추가)
  implementation?: {...}; // ✅ 신규
  chatId: string;
  timestamp: string;
}
```

### 2. 메시지 텍스트 처리 변경
```typescript
// 기존 방식 (사용 중단)
const displayMessage = response.message;

// 신규 방식 (권장)
const displayMessage = generateDisplayMessage(response);

function generateDisplayMessage(response: NewChatResponse): string {
  if (response.formulaDetails) {
    return `**${response.formulaDetails.name}**\n\n${response.formulaDetails.description}\n\n**Syntax:** ${response.formulaDetails.syntax}`;
  }
  
  if (response.codeGenerator) {
    return `**Python Code Generated:**\n\n\`\`\`python\n${response.codeGenerator.pythonCode}\n\`\`\`\n\n**Explanation:**\n${response.codeGenerator.explanation}`;
  }
  
  if (response.generalHelp) {
    return response.generalHelp.directAnswer;
  }
  
  return 'AI processing completed successfully.';
}
```

### 3. 실행 가능한 코드 활용
```typescript
// 새로운 기능: 실제 실행 가능한 SpreadJS 코드
if (response.formulaDetails?.spreadjsCommand) {
  // SpreadJS 워크시트에서 직접 실행 가능
  try {
    eval(response.formulaDetails.spreadjsCommand);
  } catch (error) {
    console.error('SpreadJS 코드 실행 오류:', error);
  }
}
```

### 4. 메타데이터 활용
```typescript
// 새로운 메타데이터 활용
const showPerformanceInfo = (response: NewChatResponse) => {
  console.log(`응답 시간: ${response.responseTime}ms`);
  console.log(`토큰 사용량: ${response.tokensUsed}`);
  console.log(`신뢰도: ${(response.confidence * 100).toFixed(1)}%`);
  console.log(`캐시 사용: ${response.cached ? 'Yes' : 'No'}`);
};
```

## 오류 처리 개선

### 응답 검증
```typescript
function validateResponse(response: any): response is NewChatResponse {
  return (
    typeof response === 'object' &&
    typeof response.success === 'boolean' &&
    typeof response.tokensUsed === 'number' &&
    typeof response.responseTime === 'number' &&
    typeof response.chatId === 'string' &&
    typeof response.timestamp === 'string'
  );
}

// 사용 예시
if (!validateResponse(response)) {
  console.error('Invalid response format:', response);
  return;
}
```

## 호환성 노트

- **Breaking Change**: 이 변경사항은 기존 프론트엔드 코드와 호환되지 않습니다.
- **마이그레이션 필수**: 모든 채팅 관련 컴포넌트를 업데이트해야 합니다.
- **이점**: 더 풍부한 데이터와 실행 가능한 코드 제공으로 UX 대폭 개선

## 문의사항

이 변경사항에 대한 질문이나 마이그레이션 도움이 필요한 경우, 백엔드 팀에 문의해주세요.
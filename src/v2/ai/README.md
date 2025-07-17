# LCEL 스트리밍 서비스 개선 사항

## 개요

이 프로젝트는 LangChain Expression Language (LCEL)을 기반으로 한 AI 분석 체인에 **실시간 스트리밍 기능**을 추가하여 사용자에게 중간 실행 상황을 전달할 수 있도록 개선한 서비스입니다.

## 주요 개선 사항

### 1. 스트리밍 타입 정의 확장
- `StreamUpdate`: 실시간 업데이트 데이터 구조
- `StreamUpdateType`: 업데이트 유형 (step_start, step_progress, step_complete, error, final_result)
- `StreamResult`: 스트리밍 결과 반환 타입

### 2. Runnable 클래스 스트리밍 지원
각 Runnable 클래스에 스트리밍 콜백 기능을 추가:
- `IntentAnalyzerRunnable`: 의도 분석 진행 상황 전송
- `PromptSelectorRunnable`: 프롬프트 선택 과정 전송
- `ResponseGeneratorRunnable`: 응답 생성 과정 전송

### 3. BasicAnalysisChain 스트리밍 메서드 구현
- `stream()`: AsyncIterable 기반 스트리밍
- `streamWithCallback()`: 실시간 콜백 기반 스트리밍
- `retryChainExecution()`: 재시도 메커니즘

### 4. 에러 처리 및 복구 메커니즘
- 단계별 에러 처리 및 폴백 로직
- 체인 상태 검증 및 자동 복구
- 지수 백오프 기반 재시도 메커니즘

## 사용법

### 기본 스트리밍 사용

```typescript
import { BasicAnalysisChain } from './chains/basic-analysis.chain';
import { ChainInput } from './types/chain.types';

const chain = new BasicAnalysisChain(llm);

const input: ChainInput = {
  userId: 'user123',
  question: '데이터 분석 요청',
  spreadSheetData: { /* 스프레드시트 데이터 */ }
};

// AsyncIterable 기반 스트리밍
const streamResult = await chain.stream(input);

if (streamResult.success) {
  for await (const update of streamResult.updates) {
    console.log('업데이트:', update);
  }
}
```

### 실시간 콜백 스트리밍

```typescript
// 실시간 콜백 기반 스트리밍 (WebSocket, SSE 등에 적합)
await chain.streamWithCallback(
  input,
  (update) => {
    // 실시간으로 클라이언트에게 업데이트 전송
    websocket.send(JSON.stringify(update));
  },
  (finalResult) => {
    // 완료 시 최종 결과 처리
    console.log('분석 완료!');
  },
  (error) => {
    // 에러 처리
    console.error('분석 실패:', error);
  }
);
```

### 재시도 메커니즘 사용

```typescript
// 최대 3번 재시도, 1초 지연
const result = await chain.retryChainExecution(input, 3, 1000);

if (result.success) {
  console.log('재시도 성공!');
} else {
  console.error('재시도 실패:', result.error);
}
```

## 스트리밍 업데이트 타입

### StreamUpdate 구조
```typescript
interface StreamUpdate {
  type: StreamUpdateType;          // 업데이트 타입
  step: string;                    // 현재 단계
  timestamp: number;               // 타임스탬프
  data?: Partial<ChainState>;      // 중간 데이터 (선택사항)
  progress?: {                     // 진행률 정보
    current: number;
    total: number;
    message?: string;
  };
  error?: string;                  // 에러 메시지 (선택사항)
}
```

### 업데이트 타입별 의미

1. **step_start**: 단계 시작 알림
2. **step_progress**: 단계 진행 중 업데이트
3. **step_complete**: 단계 완료 알림
4. **error**: 에러 발생 알림
5. **final_result**: 최종 결과 완료

## 처리 단계별 세부 사항

### 1. 의도 분석 (intent_analysis)
- 데이터 컨텍스트 생성
- 프롬프트 변수 준비
- AI 모델 의도 분석
- 결과 검증 및 파싱

### 2. 프롬프트 선택 (prompt_selection)
- 의도별 프롬프트 템플릿 선택
- 프롬프트 변수 준비
- 프롬프트 정보 생성

### 3. 응답 생성 (response_generation)
- 프롬프트 템플릿 생성
- AI 모델 체인 구성
- 응답 생성 및 후처리

## 에러 처리 및 복구

### 단계별 에러 처리
- 각 단계에서 에러 발생 시 적절한 폴백 메커니즘
- 스트리밍 업데이트로 에러 상황 실시간 전달
- 기본값으로 안전한 폴백 수행

### 체인 상태 검증
- 입력 데이터 검증
- 메타데이터 무결성 확인
- 의도 분석 결과 검증
- 응답 길이 제한 검증

### 재시도 메커니즘
- 지수 백오프 기반 재시도
- 최대 재시도 횟수 설정 가능
- 재시도 간격 조정 가능

## 성능 최적화

### 스트리밍 성능
- 최소한의 지연으로 실시간 업데이트 전송
- 메모리 효율적인 AsyncIterable 사용
- 불필요한 데이터 직렬화 최소화

### 에러 복구 최적화
- 빠른 폴백 메커니즘
- 중복 처리 방지
- 리소스 정리 자동화

## 사용 예제

자세한 사용 예제는 `examples/streaming-usage.example.ts` 파일을 참고하세요.

## 로깅 및 모니터링

### 로그 레벨
- **DEBUG**: 각 단계별 세부 진행 상황
- **INFO**: 체인 시작/완료 및 주요 이벤트
- **WARN**: 폴백 및 복구 상황
- **ERROR**: 실패 및 에러 상황

### 메트릭
- 처리 시간 측정
- 단계별 성능 추적
- 에러율 및 재시도 통계
- 토큰 사용량 모니터링

## 확장 가능성

### 추가 Runnable 지원
새로운 Runnable 클래스 추가 시 스트리밍 콜백 인터페이스 구현:

```typescript
class NewRunnable extends Runnable<Input, Output> {
  private streamCallback?: (update: StreamUpdate) => void;
  
  setStreamCallback(callback: (update: StreamUpdate) => void): void {
    this.streamCallback = callback;
  }
  
  async invoke(input: Input): Promise<Output> {
    this.streamCallback?.({
      type: 'step_start',
      step: 'new_process',
      timestamp: Date.now(),
      progress: { current: 0, total: 1, message: '새 프로세스 시작...' }
    });
    
    // 처리 로직...
    
    this.streamCallback?.({
      type: 'step_complete',
      step: 'new_process',
      timestamp: Date.now(),
      progress: { current: 1, total: 1, message: '새 프로세스 완료!' }
    });
    
    return result;
  }
}
```

### 다른 체인 타입 지원
- 새로운 체인 클래스에서 동일한 스트리밍 패턴 적용
- 공통 인터페이스를 통한 일관된 사용자 경험

## 트러블슈팅

### 자주 발생하는 문제

1. **스트리밍 업데이트가 전달되지 않음**
   - 콜백 함수가 올바르게 설정되었는지 확인
   - 네트워크 연결 상태 확인

2. **에러 후 복구되지 않음**
   - 폴백 메커니즘 로그 확인
   - 입력 데이터 유효성 검증

3. **성능 저하**
   - 스트리밍 지연 시간 조정
   - 불필요한 데이터 전송 최소화

### 디버깅 팁

- `getChainInfo()` 메서드로 체인 상태 확인
- 로그 레벨을 DEBUG로 설정하여 상세 정보 확인
- 메타데이터의 `processingSteps` 배열로 실행 경로 추적

## 결론

이 스트리밍 서비스 개선을 통해 사용자는 AI 분석 과정을 실시간으로 확인할 수 있으며, 더 나은 사용자 경험과 투명성을 제공합니다. 강력한 에러 처리 및 복구 메커니즘을 통해 안정적인 서비스 운영이 가능합니다.
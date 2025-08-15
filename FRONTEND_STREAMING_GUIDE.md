# Frontend Real-time Token Streaming Integration Guide

백엔드의 Gemini 실시간 토큰 스트리밍을 프론트엔드에서 연결하기 위한 완전한 가이드입니다.

## 📡 SSE 이벤트 타입 정의

### TypeScript 타입 정의

```typescript
// SSE 이벤트 타입들
export type SSEEventType = 
  | 'chat_started'           // 채팅 시작
  | 'ai_processing_started'  // AI 처리 시작
  | 'ai_token'              // 실시간 토큰 스트리밍 ⭐ 핵심
  | 'ai_step_start'         // 단계 시작
  | 'ai_step_complete'      // 단계 완료
  | 'chat_response'         // 최종 응답
  | 'chat_completed'        // 채팅 완료
  | 'error';                // 에러 발생

// 기본 SSE 이벤트 구조
export interface SSEEvent {
  type: SSEEventType;
  timestamp: string;
  chatId: string;
  messageId?: string;
}

// 채팅 시작 이벤트
export interface ChatStartedEvent extends SSEEvent {
  type: 'chat_started';
  data: {
    chatId: string;
    messageId: string;
    timestamp: string;
  };
}

// AI 처리 시작 이벤트
export interface AIProcessingStartedEvent extends SSEEvent {
  type: 'ai_processing_started';
  data: {
    chatId: string;
    userMessageId: string;
    timestamp: string;
  };
}

// 🔥 실시간 토큰 스트리밍 이벤트 (가장 중요)
export interface AITokenEvent extends SSEEvent {
  type: 'ai_token';
  data: {
    chatId: string;
    userMessageId: string;
    token: string;              // 현재 받은 토큰
    partialResponse: string;    // 누적된 부분 응답
    tokenCount: number;         // 현재까지 받은 토큰 수
    isFinal: boolean;          // 최종 토큰 여부
    timestamp: string;
  };
}

// 단계 시작 이벤트
export interface AIStepStartEvent extends SSEEvent {
  type: 'ai_step_start';
  data: {
    chatId: string;
    userMessageId: string;
    step: string;
    timestamp: string;
  };
}

// 단계 완료 이벤트
export interface AIStepCompleteEvent extends SSEEvent {
  type: 'ai_step_complete';
  data: {
    chatId: string;
    userMessageId: string;
    step: string;
    timestamp: string;
  };
}

// 최종 응답 이벤트
export interface ChatResponseEvent extends SSEEvent {
  type: 'chat_response';
  data: {
    // 백엔드 응답 타입에 따라 달라질 수 있음
    success: boolean;
    tokensUsed: number;
    responseTime: number;
    model: string;
    cached: boolean;
    confidence: number;
    // 실제 응답 데이터...
  };
}

// 채팅 완료 이벤트
export interface ChatCompletedEvent extends SSEEvent {
  type: 'chat_completed';
  data: {
    chatId: string;
    assistantMessageId: string;
    timestamp: string;
  };
}

// 에러 이벤트
export interface ErrorEvent extends SSEEvent {
  type: 'error';
  data: {
    error: string;
    details?: string;
    timestamp: string;
  };
}

// 통합 이벤트 타입
export type StreamingEvent = 
  | ChatStartedEvent
  | AIProcessingStartedEvent
  | AITokenEvent
  | AIStepStartEvent
  | AIStepCompleteEvent
  | ChatResponseEvent
  | ChatCompletedEvent
  | ErrorEvent;
```

## 🔌 SSE 연결 및 이벤트 핸들러

### 기본 연결 클래스

```typescript
export interface StreamingChatOptions {
  baseUrl?: string;
  onChatStarted?: (event: ChatStartedEvent) => void;
  onAIProcessingStarted?: (event: AIProcessingStartedEvent) => void;
  onToken?: (event: AITokenEvent) => void;          // 🔥 실시간 토큰 처리
  onStepStart?: (event: AIStepStartEvent) => void;
  onStepComplete?: (event: AIStepCompleteEvent) => void;
  onChatResponse?: (event: ChatResponseEvent) => void;
  onChatCompleted?: (event: ChatCompletedEvent) => void;
  onError?: (event: ErrorEvent) => void;
  onConnectionError?: (error: Error) => void;
}

export interface ChatRequest {
  userId: string;
  chatId?: string;
  spreadsheetId?: string;
  chatInputMessage: string;
}

export class StreamingChatClient {
  private eventSource: EventSource | null = null;
  private options: StreamingChatOptions;
  private baseUrl: string;

  constructor(options: StreamingChatOptions = {}) {
    this.options = options;
    this.baseUrl = options.baseUrl || '/api/v2/main-chat';
  }

  /**
   * 스트리밍 채팅 시작
   */
  async startChat(request: ChatRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // POST 요청으로 스트리밍 시작
        fetch(`${this.baseUrl}/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify(request),
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          // EventSource 대신 직접 스트림 처리
          this.handleStreamResponse(response, resolve, reject);
        })
        .catch(error => {
          this.options.onConnectionError?.(error);
          reject(error);
        });
      } catch (error) {
        this.options.onConnectionError?.(error as Error);
        reject(error);
      }
    });
  }

  /**
   * 스트림 응답 처리
   */
  private async handleStreamResponse(
    response: Response, 
    resolve: () => void, 
    reject: (error: Error) => void
  ) {
    const reader = response.body?.getReader();
    if (!reader) {
      reject(new Error('Failed to get response reader'));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          resolve();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        // SSE 이벤트 파싱 및 처리
        const events = this.parseSSEEvents(buffer);
        buffer = events.remainingBuffer;
        
        for (const event of events.parsedEvents) {
          this.handleEvent(event);
        }
      }
    } catch (error) {
      this.options.onConnectionError?.(error as Error);
      reject(error as Error);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * SSE 이벤트 파싱
   */
  private parseSSEEvents(buffer: string): {
    parsedEvents: StreamingEvent[];
    remainingBuffer: string;
  } {
    const events: StreamingEvent[] = [];
    const lines = buffer.split('\n\n');
    
    // 마지막 라인은 불완전할 수 있으므로 버퍼에 유지
    const remainingBuffer = lines.pop() || '';
    
    for (const eventText of lines) {
      if (!eventText.trim()) continue;
      
      try {
        const event = this.parseSSEEvent(eventText);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        console.warn('Failed to parse SSE event:', error, eventText);
      }
    }
    
    return { parsedEvents: events, remainingBuffer };
  }

  /**
   * 개별 SSE 이벤트 파싱
   */
  private parseSSEEvent(eventText: string): StreamingEvent | null {
    const lines = eventText.trim().split('\n');
    let eventType = '';
    let eventData = '';
    
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.substring(7);
      } else if (line.startsWith('data: ')) {
        eventData = line.substring(6);
      }
    }
    
    if (!eventType || !eventData) {
      return null;
    }
    
    try {
      const data = JSON.parse(eventData);
      return {
        type: eventType as SSEEventType,
        data,
        timestamp: data.timestamp,
        chatId: data.chatId,
        messageId: data.messageId || data.userMessageId,
      } as StreamingEvent;
    } catch (error) {
      console.error('Failed to parse event data:', error);
      return null;
    }
  }

  /**
   * 이벤트 타입별 처리
   */
  private handleEvent(event: StreamingEvent): void {
    switch (event.type) {
      case 'chat_started':
        this.options.onChatStarted?.(event as ChatStartedEvent);
        break;
      case 'ai_processing_started':
        this.options.onAIProcessingStarted?.(event as AIProcessingStartedEvent);
        break;
      case 'ai_token':
        // 🔥 실시간 토큰 처리 - 가장 중요!
        this.options.onToken?.(event as AITokenEvent);
        break;
      case 'ai_step_start':
        this.options.onStepStart?.(event as AIStepStartEvent);
        break;
      case 'ai_step_complete':
        this.options.onStepComplete?.(event as AIStepCompleteEvent);
        break;
      case 'chat_response':
        this.options.onChatResponse?.(event as ChatResponseEvent);
        break;
      case 'chat_completed':
        this.options.onChatCompleted?.(event as ChatCompletedEvent);
        break;
      case 'error':
        this.options.onError?.(event as ErrorEvent);
        break;
      default:
        console.warn('Unknown event type:', event.type);
    }
  }

  /**
   * 연결 종료
   */
  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }
}
```

## 🎯 React 컴포넌트 사용 예제

### React Hook

```typescript
import { useState, useCallback, useRef } from 'react';

export interface UseStreamingChatResult {
  isConnected: boolean;
  isProcessing: boolean;
  currentResponse: string;     // 🔥 실시간으로 업데이트되는 응답
  tokenCount: number;
  error: string | null;
  startChat: (request: ChatRequest) => Promise<void>;
  disconnect: () => void;
}

export function useStreamingChat(): UseStreamingChatResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [tokenCount, setTokenCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const clientRef = useRef<StreamingChatClient | null>(null);

  const startChat = useCallback(async (request: ChatRequest) => {
    setError(null);
    setCurrentResponse('');
    setTokenCount(0);
    setIsProcessing(true);
    
    // 이전 연결 정리
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    // 새 클라이언트 생성
    clientRef.current = new StreamingChatClient({
      onChatStarted: (event) => {
        console.log('Chat started:', event.data.chatId);
        setIsConnected(true);
      },
      
      onAIProcessingStarted: (event) => {
        console.log('AI processing started');
        setIsProcessing(true);
      },
      
      // 🔥 실시간 토큰 처리 - 핵심 로직!
      onToken: (event) => {
        const { token, partialResponse, tokenCount: count, isFinal } = event.data;
        
        // UI에 실시간으로 텍스트 업데이트
        setCurrentResponse(partialResponse);
        setTokenCount(count);
        
        // 최종 토큰인 경우 추가 처리
        if (isFinal) {
          console.log('Final response received:', partialResponse);
        }
      },
      
      onStepStart: (event) => {
        console.log('Step started:', event.data.step);
      },
      
      onStepComplete: (event) => {
        console.log('Step completed:', event.data.step);
      },
      
      onChatResponse: (event) => {
        console.log('Chat response received:', event.data);
      },
      
      onChatCompleted: (event) => {
        console.log('Chat completed');
        setIsProcessing(false);
        setIsConnected(false);
      },
      
      onError: (event) => {
        console.error('Chat error:', event.data.error);
        setError(event.data.error);
        setIsProcessing(false);
        setIsConnected(false);
      },
      
      onConnectionError: (error) => {
        console.error('Connection error:', error);
        setError(error.message);
        setIsProcessing(false);
        setIsConnected(false);
      },
    });

    try {
      await clientRef.current.startChat(request);
    } catch (err) {
      console.error('Failed to start chat:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsProcessing(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setIsConnected(false);
    setIsProcessing(false);
  }, []);

  return {
    isConnected,
    isProcessing,
    currentResponse,  // 🔥 실시간 업데이트되는 응답
    tokenCount,
    error,
    startChat,
    disconnect,
  };
}
```

### React 컴포넌트 예제

```typescript
import React, { useState } from 'react';

export function StreamingChatComponent() {
  const [inputMessage, setInputMessage] = useState('');
  const [userId] = useState('user-123'); // 실제로는 인증에서 가져올 것
  const [spreadsheetId] = useState('sheet-456');
  
  const {
    isConnected,
    isProcessing,
    currentResponse,
    tokenCount,
    error,
    startChat,
    disconnect,
  } = useStreamingChat();

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isProcessing) return;

    const request: ChatRequest = {
      userId,
      spreadsheetId,
      chatInputMessage: inputMessage,
    };

    await startChat(request);
    setInputMessage('');
  };

  return (
    <div className="streaming-chat">
      <div className="chat-status">
        <span className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '연결됨' : '연결 안됨'}
        </span>
        {isProcessing && <span className="processing">처리 중...</span>}
        {tokenCount > 0 && <span className="token-count">토큰: {tokenCount}</span>}
      </div>

      {/* 🔥 실시간으로 업데이트되는 응답 영역 */}
      <div className="response-area">
        {currentResponse && (
          <div className="current-response">
            <div className="response-text">
              {currentResponse}
              {isProcessing && <span className="cursor">|</span>}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          오류: {error}
        </div>
      )}

      <div className="input-area">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="메시지를 입력하세요..."
          disabled={isProcessing}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <button 
          onClick={handleSendMessage}
          disabled={!inputMessage.trim() || isProcessing}
        >
          {isProcessing ? '처리중...' : '전송'}
        </button>
        {isConnected && (
          <button onClick={disconnect}>연결 해제</button>
        )}
      </div>
    </div>
  );
}
```

## 🎨 CSS 스타일 예제

```css
.streaming-chat {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.chat-status {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  font-size: 14px;
}

.status.connected {
  color: green;
}

.status.disconnected {
  color: red;
}

.processing {
  color: orange;
}

.token-count {
  color: blue;
}

.response-area {
  min-height: 200px;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  background-color: #f9f9f9;
}

.current-response {
  font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
  line-height: 1.6;
}

.response-text {
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* 🔥 타이핑 커서 애니메이션 */
.cursor {
  animation: blink 1s infinite;
  color: #007bff;
  font-weight: bold;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.error-message {
  color: red;
  background-color: #ffebee;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.input-area {
  display: flex;
  gap: 10px;
}

.input-area input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
}

.input-area button {
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.input-area button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
```

## 🔧 핵심 포인트

### 1. **실시간 토큰 처리가 핵심**
- `onToken` 콜백에서 `partialResponse`를 UI에 즉시 반영
- `isFinal`로 응답 완료 여부 확인

### 2. **연결 관리**
- 컴포넌트 언마운트 시 `disconnect()` 호출
- 에러 발생 시 자동 정리

### 3. **사용자 경험**
- 타이핑 커서 애니메이션으로 실시간 느낌 강화
- 토큰 카운트로 진행 상황 표시

### 4. **에러 처리**
- 연결 에러와 채팅 에러를 구분하여 처리
- 사용자에게 명확한 피드백 제공

이제 ChatGPT처럼 **실시간으로 텍스트가 생성되는** 스트리밍 채팅이 완성됩니다! 🚀


### curl 명령어 사용시 예시

ijihong@ijihong-ui-MacBookAir ~ % curl -X POST -N -H "Content-Type: application/json" -H "Accept: text/event-stream" -H "Cache-Control: no-cache" -H "Connection: keep-alive" -d '{"chatInputMessage": " 단가의 총합","spreadsheetId": "1dd8bfbe-4292-41ac-9a1b-c2c8d0f548eb","chatId": "36ac9a44-ca20-4cfd-a42e-d7ccc48a91d4","userId": "guest_0dd992dd-555c-4d3f-9fb5-a0d89193e70a","timestamp": "2025-01-15T10:30:00.000Z"}' http://localhost:8080/v2/main-chat/stream
event: chat_started
data: {"chatId":"36ac9a44-ca20-4cfd-a42e-d7ccc48a91d4","messageId":"cmecw4fqm00151c1hmp8h4k29","timestamp":"2025-08-15T13:55:11.698Z"}

event: ai_processing_started
data: {"chatId":"36ac9a44-ca20-4cfd-a42e-d7ccc48a91d4","userMessageId":"cmecw4fqm00151c1hmp8h4k29","timestamp":"2025-08-15T13:55:11.712Z"}

event: chat_response
data: {"success":true,"tokensUsed":0,"responseTime":4273,"model":"claude","cached":false,"confidence":0.95,"analysis":{"detectedOperation":"단가(F열)의 총합 계산","dataRange":"A1:G51","targetCells":"G52","operationType":"single_cell"},"formulaDetails":{"name":"SUM","description":"단가 열의 합계를 계산합니다.","syntax":"=SUM(F2:F51)","parameters":[{"name":"range","description":"합계를 계산할 셀 범위","required":true,"example":"F2:F51"}],"spreadjsCommand":"worksheet.setFormula(51, 6, '=SUM(F2:F51)', GC.Spread.Sheets.SheetArea.viewport);"},"implementation":{"steps":["1단계: F열의 단가 데이터 범위를 확인합니다 (F2:F51).","2단계: SUM 함수를 사용하여 단가 열의 합계를 계산합니다.","3단계: 계산된 합계를 G52 셀에 표시합니다."],"cellLocations":{"source":"F2:F51","target":"G52","description":"단가 열의 총 합계를 계산하여 G52 셀에 표시합니다."}},"chatId":"36ac9a44-ca20-4cfd-a42e-d7ccc48a91d4","timestamp":"2025-08-15T13:55:15.994Z"}

event: chat_completed
data: {"chatId":"36ac9a44-ca20-4cfd-a42e-d7ccc48a91d4","assistantMessageId":"cmecw4j2s00171c1hw88dcntb","timestamp":"2025-08-15T13:55:15.994Z"}

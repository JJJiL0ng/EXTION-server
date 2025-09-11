# AI Chat Database Storage Architecture Report

## Executive Summary

본 레포트는 AI Chat 시스템에서 사용자 메시지(`userQuestionMessage`)와 AI 응답(`aiChatRes`)을 Prisma를 통해 PostgreSQL의 JSONB 형식으로 저장하기 위한 아키텍처 설계 및 구현 방안을 제시합니다.

## Current State Analysis

### 기존 Prisma Schema 분석

현재 스키마는 이미 Chat/Message 구조가 잘 설계되어 있으며, JSONB 지원을 위한 수정이 필요합니다:

```prisma
Chat {
  id           String     @id @default(cuid())
  title        String
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  messageCount Int        @default(0)
  status       ChatStatus @default(ACTIVE)
  spreadSheetId String?   // 스프레드시트와 연결
  userId        String
  messages      Message[]
}

Message {
  id           String      @id @default(cuid())
  content      String      @db.Text
  createdAt    DateTime    @default(now())
  role         MessageRole
  type         MessageType @default(TEXT)
  metadata     Json?       @db.JsonB  // JSONB로 변경 필요
  sheetContext Json?       @db.JsonB  // JSONB로 변경 필요
  chatId       String
}

enum MessageRole {
  USER, ASSISTANT, SYSTEM
}

enum MessageType {
  TEXT, ANALYSIS, SUGGESTION, ERROR
}
```

### 필요한 스키마 변경사항

```prisma
// schema.prisma 수정 필요 부분
model Message {
  id           String      @id @default(cuid())
  content      String      @db.Text
  createdAt    DateTime    @default(now())
  role         MessageRole
  type         MessageType @default(TEXT)
  
  // JSONB 명시적 지정
  metadata     Json?       @db.JsonB  // AI 응답 전체 데이터 저장
  sheetContext Json?       @db.JsonB  // 스프레드시트 컨텍스트
  
  chatId String
  chat   Chat   @relation(fields: [chatId], references: [id], onDelete: Cascade)
  
  @@index([chatId, createdAt])
  // JSONB 검색을 위한 GIN 인덱스 추가 권장
  @@index([metadata], type: Gin)
  @@index([sheetContext], type: Gin)
}

### 현재 AI Chat Response 구조 분석

**aiChatApiRes 구조:**
```typescript
interface aiChatApiRes {
  jobId: string;
  taskManagerOutput: TaskManagerOutput;
  dataEditChatRes: dataEditChatRes;
}

interface TaskManagerOutput {
  intent: Intent;
  reason: string;
  tasks: Task[];
}

interface dataEditChatRes {
  dataEditCommands: dataEditCommand[];
}
```

**dataEditCommand 상세 구조:**
```typescript
interface dataEditCommand {
  sheetName: string;
  commandType: dataEditCommandType;
  range: string;
  detailedCommand: string | StyleCommand;
}
```

## Recommended Architecture

### 1. Message Storage Strategy

#### User Message Storage (JSONB)
```typescript
// 사용자 메시지 저장 시
{
  role: "USER",
  type: "TEXT", 
  content: aiReq.userQuestionMessage, // 사용자가 입력한 질문
  metadata: {
    // 요청 메타데이터 (JSONB)
    jobId: aiReq.jobId,
    chatMode: aiReq.chatMode,
    requestTimestamp: new Date().toISOString(),
    websocketClientId: aiReq.websocketClientId,
    messageSource: "user_input"
  },
  sheetContext: {
    // 스프레드시트 컨텍스트 (JSONB)
    spreadsheetId: aiReq.spreadsheetId,
    parsedSheetNames: aiReq.parsedSheetNames
  }
}
```

#### AI Response Storage (JSONB)
```typescript
// AI 응답 저장 시 - 전체 aiChatRes를 JSONB로 저장
{
  role: "ASSISTANT",
  type: "ANALYSIS",
  content: aiChatRes.taskManagerOutput.reason, // 사용자 친화적 설명
  metadata: {
    // 전체 AI 응답을 JSONB로 저장
    aiChatResponse: {
      jobId: aiChatRes.jobId,
      taskManagerOutput: aiChatRes.taskManagerOutput,
      dataEditChatRes: aiChatRes.dataEditChatRes
    },
    // 빠른 검색을 위한 요약 정보
    summary: {
      intent: aiChatRes.taskManagerOutput.intent,
      taskCount: aiChatRes.taskManagerOutput.tasks.length,
      commandCount: aiChatRes.dataEditChatRes.dataEditCommands.length,
      executionTime: executionTime,
      responseTimestamp: new Date().toISOString()
    }
  },
  sheetContext: {
    // 영향받은 스프레드시트 정보 (JSONB)
    spreadsheetId: originalRequest.spreadsheetId,
    parsedSheetNames: originalRequest.parsedSheetNames,
    affectedSheets: extractAffectedSheets(aiChatRes.dataEditChatRes.dataEditCommands),
    commandSummary: aiChatRes.dataEditChatRes.dataEditCommands.map(cmd => ({
      sheetName: cmd.sheetName,
      commandType: cmd.commandType,
      range: cmd.range
    }))
  }
}
```

### 2. Enhanced Schema Design

현재 스키마에 추가할 새로운 MessageType을 제안합니다:

```prisma
enum MessageType {
  TEXT        // 일반 텍스트
  ANALYSIS    // AI 분석 결과
  SUGGESTION  // AI 제안
  ERROR       // 오류 메시지
  
  // 새로 추가할 타입들
  TASK_PLAN   // Task Manager 계획
  DATA_EDIT   // 데이터 편집 결과
  SYSTEM_INFO // 시스템 정보/로그
}
```

### 3. Storage Service Architecture

```typescript
// src/v2/ai-chat/services/chat-message-storage.service.ts

@Injectable()
export class ChatMessageStorageService {
  constructor(private prisma: PrismaService) {}

  // 사용자 메시지 저장 (JSONB)
  async saveUserMessage(aiReq: aiChatApiReq): Promise<string> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Chat 존재 확인/생성
      await this.ensureChatExists(tx, aiReq);
      
      // 2. 사용자 메시지 저장
      const message = await tx.message.create({
        data: {
          content: aiReq.userQuestionMessage,
          role: 'USER',
          type: 'TEXT',
          chatId: aiReq.chatId,
          metadata: {
            // 요청 정보를 JSONB로 저장
            jobId: aiReq.jobId,
            chatMode: aiReq.chatMode,
            requestTimestamp: new Date().toISOString(),
            websocketClientId: aiReq.websocketClientId,
            messageSource: "user_input"
          },
          sheetContext: {
            // 스프레드시트 컨텍스트를 JSONB로 저장
            spreadsheetId: aiReq.spreadsheetId,
            parsedSheetNames: aiReq.parsedSheetNames
          }
        }
      });

      // 3. Chat 메시지 카운트 업데이트
      await tx.chat.update({
        where: { id: aiReq.chatId },
        data: { 
          messageCount: { increment: 1 },
          updatedAt: new Date()
        }
      });

      return message.id;
    });
  }

  // AI 응답 저장 (통합 JSONB 저장)
  async saveAIResponse(
    chatId: string, 
    aiChatRes: aiChatApiRes, 
    executionTime: number,
    originalRequest: aiChatApiReq
  ): Promise<string> {
    return await this.prisma.$transaction(async (tx) => {
      // 전체 AI 응답을 하나의 메시지로 저장
      const message = await tx.message.create({
        data: {
          content: aiChatRes.taskManagerOutput.reason, // 사용자 친화적 설명
          role: 'ASSISTANT',
          type: 'ANALYSIS',
          chatId,
          metadata: {
            // 전체 aiChatRes를 JSONB로 저장
            aiChatResponse: {
              jobId: aiChatRes.jobId,
              taskManagerOutput: aiChatRes.taskManagerOutput,
              dataEditChatRes: aiChatRes.dataEditChatRes
            },
            // 빠른 검색을 위한 요약 정보
            summary: {
              intent: aiChatRes.taskManagerOutput.intent,
              taskCount: aiChatRes.taskManagerOutput.tasks?.length || 0,
              commandCount: aiChatRes.dataEditChatRes?.dataEditCommands?.length || 0,
              executionTime,
              responseTimestamp: new Date().toISOString()
            }
          },
          sheetContext: {
            // 영향받은 스프레드시트 정보를 JSONB로 저장
            spreadsheetId: originalRequest.spreadsheetId,
            parsedSheetNames: originalRequest.parsedSheetNames,
            affectedSheets: this.extractAffectedSheets(aiChatRes.dataEditChatRes?.dataEditCommands || []),
            commandSummary: (aiChatRes.dataEditChatRes?.dataEditCommands || []).map(cmd => ({
              sheetName: cmd.sheetName,
              commandType: cmd.commandType,
              range: cmd.range
            }))
          }
        }
      });

      // Chat 업데이트
      await tx.chat.update({
        where: { id: chatId },
        data: { 
          messageCount: { increment: 1 },
          updatedAt: new Date()
        }
      });

      return message.id;
    });
  }

  // 유틸리티 메서드들
  private buildUserMessageMetadata(aiReq: aiChatApiReq) {
    return {
      jobId: aiReq.jobId,
      chatMode: aiReq.chatMode,
      requestTimestamp: new Date().toISOString(),
      websocketClientId: aiReq.websocketClientId,
      messageSource: 'user_input'
    };
  }

  private buildSheetContext(aiReq: aiChatApiReq) {
    return {
      spreadsheetId: aiReq.spreadsheetId,
      parsedSheetNames: aiReq.parsedSheetNames,
      contextTimestamp: new Date().toISOString()
    };
  }

  private extractAffectedSheets(commands: dataEditCommand[]): string[] {
    return [...new Set(commands.map(cmd => cmd.sheetName))];
  }

  private extractCommandTypes(commands: dataEditCommand[]): string[] {
    return [...new Set(commands.map(cmd => cmd.commandType))];
  }
}
```

### 4. Gateway Integration Points

```typescript
// ai-chat.gateway.ts 수정사항

@SubscribeMessage('start_ai_job')
async handleStartAiJob(client: Socket, payload: aiChatApiReq): Promise<void> {
  try {
    // ✅ 1. 사용자 메시지 즉시 저장
    const userMessageId = await this.chatMessageStorageService.saveUserMessage(payload);
    
    // 기존 로직...
    const dataContext = await this.aiChatService.loadParsedSpreadsheetData(/*...*/);
    const { plan } = await this.aiChatService.planTasks(/*...*/);
    
    // 클라이언트에게 계획 전송
    this.server.to(client.id).emit('ai_job_planned', { jobId: payload.jobId, plan });
    
    // 작업 실행
    const { results } = await this.aiChatService.runPlannedTasks(/*...*/);
    const executionTime = Date.now() - startTime;
    
    // ✅ 2. AI 응답 저장
    const aiResponse: aiChatApiRes = {
      jobId: payload.jobId,
      taskManagerOutput: plan,
      dataEditChatRes: { dataEditCommands: results }
    };
    
    const responseMessageIds = await this.chatMessageStorageService.saveAIResponse(
      payload.chatId,
      aiResponse,
      executionTime,
      payload
    );
    
    // 클라이언트에게 결과 전송
    this.server.to(client.id).emit('ai_tasks_executed', {
      jobId: payload.jobId,
      dataEditChatRes: { dataEditCommands: results },
      messageIds: responseMessageIds, // 저장된 메시지 ID들 포함
      executionTime
    });
    
  } catch (error) {
    // ✅ 3. 에러도 메시지로 저장
    await this.chatMessageStorageService.saveErrorMessage(
      payload.chatId,
      error,
      payload.jobId
    );
    // 에러 처리...
  }
}
```

## Data Retrieval Architecture

### 1. Message Retrieval Service

```typescript
@Injectable()
export class ChatHistoryService {
  constructor(private prisma: PrismaService) {}

  // 채팅 히스토리 조회
  async getChatHistory(
    chatId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<ChatHistoryResponse> {
    const skip = (page - 1) * limit;

    const [messages, totalCount] = await Promise.all([
      this.prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        select: {
          id: true,
          content: true,
          role: true,
          type: true,
          createdAt: true,
          metadata: true,
          sheetContext: true
        }
      }),
      this.prisma.message.count({ where: { chatId } })
    ]);

    return {
      messages: messages.map(this.transformMessageForUI),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount
      }
    };
  }

  // UI를 위한 메시지 변환 (JSONB 기반)
  private transformMessageForUI(message: any): UIMessage {
    const baseMessage = {
      id: message.id,
      role: message.role,
      type: message.type,
      createdAt: message.createdAt
    };

    if (message.role === 'USER') {
      return {
        ...baseMessage,
        text: message.content,
        jobId: message.metadata?.jobId,
        chatMode: message.metadata?.chatMode,
        sheetContext: message.sheetContext
      };
    } else if (message.role === 'ASSISTANT' && message.metadata?.aiChatResponse) {
      // JSONB에서 전체 AI 응답 추출
      const aiChatResponse = message.metadata.aiChatResponse;
      const summary = message.metadata.summary;
      
      return {
        ...baseMessage,
        text: message.content, // 사용자 친화적 설명
        aiResponse: {
          jobId: aiChatResponse.jobId,
          taskManagerOutput: aiChatResponse.taskManagerOutput,
          dataEditChatRes: aiChatResponse.dataEditChatRes,
          executionSummary: {
            intent: summary.intent,
            taskCount: summary.taskCount,
            commandCount: summary.commandCount,
            executionTime: summary.executionTime,
            affectedSheets: message.sheetContext?.affectedSheets || [],
            commandSummary: message.sheetContext?.commandSummary || []
          }
        }
      };
    }

    return {
      ...baseMessage,
      text: message.content,
      metadata: message.metadata
    };
  }
  
  // JSONB 필드에서 특정 데이터 추출
  async extractAIResponseData(messageId: string): Promise<any> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        metadata: true,
        sheetContext: true
      }
    });
    
    if (message?.metadata?.aiChatResponse) {
      return {
        fullResponse: message.metadata.aiChatResponse,
        summary: message.metadata.summary,
        sheetContext: message.sheetContext
      };
    }
    
    return null;
  }
}
```

### 2. REST API for History

```typescript
@Controller('api/v2/chat')
export class ChatHistoryController {
  constructor(private chatHistoryService: ChatHistoryService) {}

  @Get(':chatId/messages')
  async getChatMessages(
    @Param('chatId') chatId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.chatHistoryService.getChatHistory(
      chatId, 
      page || 1, 
      limit || 50
    );
  }

  @Get(':chatId/summary')
  async getChatSummary(@Param('chatId') chatId: string) {
    return this.chatHistoryService.getChatSummary(chatId);
  }
}
```

## Performance & Scalability Considerations

### 1. Database Optimization (JSONB 최적화)

```sql
-- 메시지 조회 성능을 위한 인덱스
CREATE INDEX CONCURRENTLY idx_message_chat_created 
ON "Message" (chat_id, created_at);

-- JSONB 메타데이터 검색을 위한 GIN 인덱스
CREATE INDEX CONCURRENTLY idx_message_metadata_gin 
ON "Message" USING gin (metadata);

-- JSONB 시트컨텍스트 검색을 위한 GIN 인덱스
CREATE INDEX CONCURRENTLY idx_message_sheetcontext_gin 
ON "Message" USING gin (sheet_context);

-- 특정 JSONB 경로에 대한 B-tree 인덱스 (빠른 정확 검색)
CREATE INDEX CONCURRENTLY idx_message_jobid 
ON "Message" USING btree ((metadata->>'jobId')) 
WHERE metadata ? 'jobId';

CREATE INDEX CONCURRENTLY idx_message_intent 
ON "Message" USING btree ((metadata->'summary'->>'intent')) 
WHERE metadata->'summary' ? 'intent';

CREATE INDEX CONCURRENTLY idx_message_spreadsheet 
ON "Message" USING btree ((sheet_context->>'spreadsheetId')) 
WHERE sheet_context ? 'spreadsheetId';

-- 복합 JSONB 검색 인덱스
CREATE INDEX CONCURRENTLY idx_message_ai_response 
ON "Message" USING gin ((metadata->'aiChatResponse')) 
WHERE role = 'ASSISTANT';
```

### 2. JSONB 쿼리 최적화 예시

```typescript
// 특정 jobId로 메시지 검색
async findMessagesByJobId(jobId: string) {
  return this.prisma.message.findMany({
    where: {
      metadata: {
        path: ['jobId'],
        equals: jobId
      }
    }
  });
}

// 특정 intent로 AI 응답 검색  
async findMessagesByIntent(intent: string) {
  return this.prisma.message.findMany({
    where: {
      role: 'ASSISTANT',
      metadata: {
        path: ['summary', 'intent'],
        equals: intent
      }
    }
  });
}

// 특정 스프레드시트의 모든 메시지 검색
async findMessagesBySpreadsheet(spreadsheetId: string) {
  return this.prisma.message.findMany({
    where: {
      sheetContext: {
        path: ['spreadsheetId'],
        equals: spreadsheetId
      }
    },
    orderBy: { createdAt: 'asc' }
  });
}

// 복잡한 JSONB 쿼리 - Raw SQL 사용
async findComplexAIResponses(filters: any) {
  return this.prisma.$queryRaw`
    SELECT id, content, metadata, sheet_context, created_at
    FROM "Message" 
    WHERE role = 'ASSISTANT'
      AND metadata->'summary'->>'commandCount'::int > ${filters.minCommands}
      AND metadata->'summary'->>'executionTime'::int < ${filters.maxExecutionTime}
      AND sheet_context->'affectedSheets' @> ${JSON.stringify([filters.sheetName])}
    ORDER BY created_at DESC
    LIMIT ${filters.limit}
  `;
}
```

### 2. Content Size Management

```typescript
// 큰 응답 처리를 위한 압축 전략
private async saveWithCompression(
  content: string, 
  threshold: number = 50000
): Promise<string> {
  if (content.length < threshold) {
    return content;
  }

  // 큰 데이터는 압축해서 저장
  const compressed = await this.compressionService.compress(content);
  return compressed;
}

// 조회 시 압축 해제
private async getWithDecompression(content: string): Promise<string> {
  if (this.compressionService.isCompressed(content)) {
    return await this.compressionService.decompress(content);
  }
  return content;
}
```

### 3. Caching Strategy

```typescript
@Injectable()
export class ChatCacheService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private chatHistoryService: ChatHistoryService
  ) {}

  async getCachedChatHistory(chatId: string, page: number): Promise<any> {
    const cacheKey = `chat:${chatId}:page:${page}`;
    
    let cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this.chatHistoryService.getChatHistory(chatId, page);
    await this.cacheManager.set(cacheKey, data, { ttl: 300 }); // 5분 캐시
    
    return data;
  }
}
```

## Implementation Roadmap

### Phase 1: Core Storage Implementation
1. ✅ `ChatMessageStorageService` 구현
2. ✅ Gateway integration 포인트 수정
3. ✅ 사용자/AI 메시지 저장 로직 추가
4. ✅ 에러 처리 및 로깅

### Phase 2: Retrieval & API
1. ✅ `ChatHistoryService` 구현
2. ✅ REST API 컨트롤러 추가
3. ✅ 메시지 변환 로직 구현
4. ✅ 페이지네이션 및 필터링

### Phase 3: Performance & Optimization
1. ✅ 데이터베이스 인덱스 최적화
2. ✅ 압축 및 크기 관리 로직
3. ✅ 캐싱 전략 구현
4. ✅ 모니터링 및 분석 도구

### Phase 4: Advanced Features
1. 채팅 검색 기능
2. 메시지 내보내기 기능
3. 분석 대시보드
4. 자동 제목 생성

## Security & Privacy Considerations

### 1. Data Privacy
```typescript
// 민감한 데이터 필터링
private sanitizeContent(content: string, messageType: MessageType): string {
  if (messageType === 'ERROR') {
    // 에러 메시지에서 민감한 정보 제거
    return content.replace(/password|token|key|secret/gi, '[REDACTED]');
  }
  return content;
}
```

### 2. Access Control
```typescript
// 메시지 접근 권한 확인
async validateMessageAccess(userId: string, chatId: string): Promise<boolean> {
  const chat = await this.prisma.chat.findFirst({
    where: { 
      id: chatId, 
      userId: userId 
    }
  });
  return !!chat;
}
```

## Monitoring & Analytics

### 1. Usage Metrics
```typescript
// 사용 통계 수집
async collectUsageMetrics(userId: string): Promise<UsageStats> {
  return {
    totalChats: await this.prisma.chat.count({ where: { userId } }),
    totalMessages: await this.prisma.message.count({
      where: { chat: { userId } }
    }),
    messagesByType: await this.prisma.message.groupBy({
      by: ['type'],
      where: { chat: { userId } },
      _count: true
    }),
    avgResponseTime: await this.calculateAvgResponseTime(userId),
    mostUsedFeatures: await this.getMostUsedFeatures(userId)
  };
}
```

### 2. Error Tracking
```typescript
// 에러 패턴 분석
async analyzeErrorPatterns(days: number = 7): Promise<ErrorAnalysis> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return {
    errorCount: await this.prisma.message.count({
      where: { 
        type: 'ERROR',
        createdAt: { gte: since }
      }
    }),
    errorsByType: await this.getErrorsByType(since),
    recoveryRate: await this.calculateRecoveryRate(since)
  };
}
```

## Conclusion

이 아키텍처를 통해 다음을 달성할 수 있습니다:

1. **완전한 대화 기록**: 모든 사용자 입력과 AI 응답의 영구 보존
2. **구조화된 저장**: 메타데이터와 컨텍스트를 포함한 체계적 데이터 관리
3. **확장성**: 대량의 메시지 처리와 빠른 조회를 위한 최적화된 구조
4. **분석 가능성**: 사용 패턴 분석과 시스템 개선을 위한 데이터 수집
5. **보안성**: 민감한 정보 보호와 접근 권한 관리

이 설계는 현재의 Chat/Message 스키마를 최대한 활용하면서도 AI Chat 시스템의 특수한 요구사항을 충족하는 효율적인 저장 및 조회 시스템을 제공합니다.
import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AiChatService } from './ai-chat.service';

import type { aiChatApiReq, aiChatApiRes, filteredSheetReturns, PreviousChatMessage, rollbackMessageReq, rollbackMessageRes } from './types/aiChat.types';
import type { TaskManagerOutput } from 'src/v2/ai-agent/types/taskManager.types';
import { Intent } from 'src/v2/ai-agent/types/taskManager.types';

import { TableDataJsonSaveService } from 'src/v2/sheet/_table-data-json-save/table-data-json-save.service';
import { AiAgentService } from 'src/v2/ai-agent/ai-agent.service';
import { AddNewVersionSpreadSheetData } from 'src/v2/sheet/types/spreadsheet.types';
import { getCorsOrigins } from 'src/common/config/app-config';
import { emptySheetData } from './emptySheet.json';
import { AiChatJobRegistryService } from './services/ai-chat-job-registry.service';
import { AiChatRateLimitService } from './services/ai-chat-rate-limit.service';
import { AI_CHAT_EVENTS } from './events/ai-chat-events';
@WebSocketGateway({
  cors: {
    origin: getCorsOrigins(process.env),
    credentials: true,
    methods: ['GET', 'POST']
  },
})
export class AiChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AiChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly tableDataJsonSaveService: TableDataJsonSaveService,
    private readonly aiAgentService: AiAgentService,
    private readonly jobRegistryService: AiChatJobRegistryService,
    private readonly rateLimitService: AiChatRateLimitService,
  ) { }


  //====================
  // 프로덕션에서는 지울 예정

  // 클라이언트가 연결되었을 때
  handleConnection(client: Socket) {
    this.logger.log(`클라이언트 연결: ${client.id}`);
  }

  // 클라이언트 연결이 끊겼을 때
  handleDisconnect(client: Socket) {
    this.logger.log(`클라이언트 연결 해제: ${client.id}`);

    // 연결이 끊어진 클라이언트의 진행 중인 작업 정리
    this.cleanupClientJobs(client.id);
  }

  // ===================

  /**
   * 클라이언트의 진행 중인 작업들을 정리합니다.
   */
  private cleanupClientJobs(clientId: string) {
    const deletedJobIds = this.jobRegistryService.deleteByClientId(clientId);

    for (const jobId of deletedJobIds) {
      this.logger.warn(`연결 해제로 인한 작업 정리: ${jobId}`);
    }

    if (deletedJobIds.length > 0) {
      this.logger.log(`클라이언트 ${clientId}의 ${deletedJobIds.length}개 작업이 정리되었습니다.`);
    }
  }

  /**
   * 클라이언트로부터 새로운 AI 작업을 시작하라는 요청을 받습니다.
   */
  @SubscribeMessage('start_ai_job')
  async handleStartAiJob(
    client: Socket,
    payload: aiChatApiReq,
  ): Promise<void> {
    this.logger.log(`AI 작업 시작 요청 - 클라이언트: ${client.id}, 스프레드시트: ${payload.spreadsheetId}`);

    try {
      // 입력 데이터 검증
      this.logger.log(`Received payload - parsedSheetNames: ${JSON.stringify(payload.parsedSheetNames)}, type: ${typeof payload.parsedSheetNames}`);

      if (!payload.spreadsheetId || !payload.chatId || !payload.userId || !payload.jobId) {
        this.logger.error(`필수 파라미터 누락 - 클라이언트: ${client.id}`);
        this.server.to(client.id).emit(AI_CHAT_EVENTS.AI_JOB_ERROR, {
          message: 'MISSING_REQUIRED_PARAMETERS',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      // Rate Limiting 검증
      const clientIp = (client.handshake.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || client.handshake.address
        || 'unknown';

      const rateLimitCheck = this.rateLimitService.check(payload.userId, clientIp);
      if (rateLimitCheck.blocked) {
        this.logger.warn(`Rate Limit 차단 - 사용자: ${payload.userId}, IP: ${clientIp}, 이유: ${rateLimitCheck.reason}`);
        this.server.to(client.id).emit(AI_CHAT_EVENTS.AI_JOB_ERROR, {
          message: rateLimitCheck.reason,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: rateLimitCheck.retryAfter,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      const aiReq: aiChatApiReq = {
        websocketClientId: client.id,
        spreadsheetId: payload.spreadsheetId,
        chatId: payload.chatId,
        chatSessionId: payload.chatSessionId,
        userChatSessionBranchId: payload.userChatSessionBranchId,
        userId: payload.userId,
        chatMode: payload.chatMode ?? 'agent',
        userQuestionMessage: payload.userQuestionMessage,
        parsedSheetNames: payload.parsedSheetNames ?? [],
        jobId: payload.jobId,
        spreadSheetVersionId: payload.spreadSheetVersionId,
        newVersionSpreadSheetData: payload.newVersionSpreadSheetData,
        editLockVersion: payload.editLockVersion, // 낙관적 잠금을 위한 버전 번호
        aiModel: payload.aiModel, // 사용할 AI 모델 이름
        isEmptySheet: payload.isEmptySheet // 시트가 비어있는지 여부
      };

      let fileName: string | undefined;

      if (aiReq.isEmptySheet === true) {
        // 빈 시트인 경우 newVersionSpreadSheetData가 없으면 emptySheetData 사용
        const spreadSheetData = aiReq.newVersionSpreadSheetData ?? emptySheetData;
        
        // 파일명 생성
        fileName = await this.aiAgentService.fileNameMaker(spreadSheetData);
                
        // 스프레드시트 생성
        await this.tableDataJsonSaveService.createSpreadSheet({
          fileName: fileName,
          spreadsheetId: aiReq.spreadsheetId,
          chatId: aiReq.chatId,
          userId: aiReq.userId,
          jsonData: spreadSheetData
        });
        
        this.logger.log(`빈 스프레드시트 및 Chat 생성 완료 - fileName: ${fileName}, chatId: ${aiReq.chatId}`);
      }

      this.logger.log(`aiReq created - parsedSheetNames: ${JSON.stringify(aiReq.parsedSheetNames)}, length: ${aiReq.parsedSheetNames.length}`);

      // // chatsessionId가 없으면 첫번째 채팅인거라 이전 메시지 컨텍스트가 없음을 의미
      let previousMessages;
      if (aiReq.chatSessionId) {
        previousMessages = await this.aiChatService.loadMultiturnMessages(aiReq.chatId, aiReq.chatSessionId);
      }
      else {
        previousMessages = '{ 사용자의 첫번째 질문입니다. 이전 대화 내용이 없습니다 } ';
      }

      if (aiReq.chatSessionId == null) {
        // crypto.randomUUID()로 새로 생성
        aiReq.chatSessionId = 'chat_session_' + crypto.randomUUID();
      }

      // // 이전 메시지 불러오기 todo: 첫번째 채팅일때는 작동하지 않도록 세팅
      // const previousMessages = await this.aiChatService.loadMultiturnMessages(aiReq.chatId, aiReq.chatSessionId);

      const dataContext = aiReq.newVersionSpreadSheetData
        ? await this.aiChatService.parseNewVersionSpreadSheetData(aiReq.parsedSheetNames, aiReq.newVersionSpreadSheetData)
        : await this.aiChatService.loadParsedSpreadsheetData(aiReq.spreadsheetId, aiReq.parsedSheetNames, aiReq.userId, aiReq.spreadSheetVersionId);

      // 1) 계획 수립
      const { plan } = await this.aiChatService.planTasks(aiReq, dataContext!, previousMessages!);

      // 2) 클라이언트에게 계획 전송

      this.server.to(client.id).emit(AI_CHAT_EVENTS.AI_JOB_PLANNED, {
        jobId: payload.jobId,
        plan,
      });

      await this.executeJobDirectly(aiReq, plan, dataContext!, previousMessages!, client.id, fileName);

    } catch (err) {
      this.logger.error(`AI 작업 시작 실패 - 클라이언트: ${client.id}, 에러: ${err instanceof Error ? err.message : 'Unknown error'}`, err instanceof Error ? err.stack : undefined);

      // 운영 환경에서는 구체적인 에러 메시지 숨김
      const message = process.env.NODE_ENV === 'production'
        ? 'AI_JOB_START_FAILED'
        : (err instanceof Error ? err.message : 'Unknown error');

      this.server.to(client.id).emit(AI_CHAT_EVENTS.AI_JOB_ERROR, {
        message,
        code: 'JOB_START_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /*
  * 롤백 로직, 클라이언트로 부터 롤백 되었음을 알림 받고 롤백 타겟 메시지를 보내기 이전으로 상태를 되돌림(데이터를 지우진 않고 포인터를 수정함), 이후 클라이언트에 롤백 타겟 메시지 보내기 전의 시트 데이터 보내줌
  */
  @SubscribeMessage('rollback_message')
  async handleRollbackMessage(
    client: Socket,
    payload: rollbackMessageReq
  ): Promise<void> {
    const clientId = client.id;
    this.logger.log(`롤백 요청 수신 - 클라이언트: ${clientId}, payload:`, payload);

    try {
      // 입력 데이터 검증
      if (!payload.spreadSheetId || !payload.chatSessionId || !payload.chatSessionBranchId || !payload.userId) {
        this.logger.error(`롤백 필수 파라미터 누락 - 클라이언트: ${clientId}`);
        this.server.to(clientId).emit(AI_CHAT_EVENTS.ROLLBACK_MESSAGE_ERROR, {
          message: 'MISSING_REQUIRED_PARAMETERS',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      this.logger.log(`롤백 처리 시작 - spreadSheetId: ${payload.spreadSheetId}, chatSessionId: ${payload.chatSessionId}, chatSessionBranchId: ${payload.chatSessionBranchId}`);

      const rollbackMessage = await this.aiChatService.rollPreviousMessage(payload.spreadSheetId, payload.chatSessionId, payload.chatSessionBranchId);
      this.logger.log(`롤백 메시지 처리 완료:`, rollbackMessage);

      const spreadSheetData = await this.tableDataJsonSaveService.loadWholeTableDataJson(payload.spreadSheetId, payload.userId, rollbackMessage.spreadSheetVersionId);
      this.logger.log(`스프레드시트 데이터 로드 완료 - versionId: ${rollbackMessage.spreadSheetVersionId}`);

      const rollbackMessageRes: rollbackMessageRes = {
        parentChatSessionBranchId: rollbackMessage.lastestBranchID,
        spreadSheetVersionId: rollbackMessage.spreadSheetVersionId,
        editLockVersion: rollbackMessage.editLockVersion,
        spreadSheetData: spreadSheetData,
      }

      this.logger.log(`롤백 응답 전송 - 클라이언트: ${clientId}`);
      this.server.to(clientId).emit(AI_CHAT_EVENTS.ROLLBACK_MESSAGE_RESPONSE, rollbackMessageRes);

    } catch (err) {
      this.logger.error(`롤백 처리 실패 - 클라이언트: ${clientId}, 에러: ${err instanceof Error ? err.message : 'Unknown error'}`, err instanceof Error ? err.stack : undefined);

      const message = process.env.NODE_ENV === 'production'
        ? 'ROLLBACK_FAILED'
        : (err instanceof Error ? err.message : 'Unknown error');

      this.server.to(clientId).emit(AI_CHAT_EVENTS.ROLLBACK_MESSAGE_ERROR, {
        message,
        code: 'ROLLBACK_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 클라이언트로부터 이전 Task의 성공/실패 피드백을 받습니다.
   */
  @SubscribeMessage('acknowledge_task')
  async handleAcknowledgeTask(client: Socket, payload: { jobId: string; feedback: 'SUCCESS' | 'FAILURE' }): Promise<void> {
    const { jobId, feedback } = payload;
    this.logger.log(`작업 피드백 수신 - ID: ${jobId}, 피드백: ${feedback}, 클라이언트: ${client.id}`);

    try {
      // 입력 검증
      if (!jobId || !feedback || !['SUCCESS', 'FAILURE'].includes(feedback)) {
        this.logger.error(`잘못된 피드백 데이터 - 클라이언트: ${client.id}, 작업ID: ${jobId}, 피드백: ${feedback}`);
        this.server.to(client.id).emit(AI_CHAT_EVENTS.AI_JOB_ERROR, {
          jobId,
          message: 'INVALID_FEEDBACK_DATA',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const job = this.jobRegistryService.get(jobId);
      if (!job) {
        this.logger.warn(`존재하지 않는 작업ID - ID: ${jobId}, 클라이언트: ${client.id}`);
        this.server.to(client.id).emit(AI_CHAT_EVENTS.AI_JOB_ERROR, {
          jobId,
          message: 'INVALID_JOB_ID',
          code: 'JOB_NOT_FOUND',
        });
        return;
      }

      // 클라이언트 소유권 확인
      if (job.clientId !== client.id) {
        this.logger.error(`작업 소유권 불일치 - 작업ID: ${jobId}, 요청 클라이언트: ${client.id}, 소유 클라이언트: ${job.clientId}`);
        this.server.to(client.id).emit(AI_CHAT_EVENTS.AI_JOB_ERROR, {
          jobId,
          message: 'UNAUTHORIZED_JOB_ACCESS',
          code: 'PERMISSION_ERROR',
        });
        return;
      }

      if (feedback === 'SUCCESS') {
        this.logger.log(`작업 실행 계속 - ID: ${jobId}`);

        // dataContext 재조회 (메모리 절약)
        const dataContext = job.aiReq.newVersionSpreadSheetData
          ? await this.aiChatService.parseNewVersionSpreadSheetData(job.aiReq.parsedSheetNames, job.aiReq.newVersionSpreadSheetData)
          : await this.aiChatService.loadParsedSpreadsheetData(job.aiReq.spreadsheetId, job.aiReq.parsedSheetNames, job.aiReq.userId, job.aiReq.spreadSheetVersionId);

        await this.executeJobDirectly(job.aiReq, job.plan, dataContext!, job.previousMessages, job.clientId, job.fileName);
      } else {
        // 실행 취소
        this.logger.warn(`작업 취소됨 - ID: ${jobId}`);
        this.server.to(job.clientId).emit(AI_CHAT_EVENTS.AI_JOB_CANCELLED, { jobId });
      }

      // feedback 처리 후 job 삭제
      this.jobRegistryService.delete(jobId);
    } catch (err) {
      this.logger.error(`작업 피드백 처리 실패 - 작업ID: ${jobId}, 에러: ${err instanceof Error ? err.message : 'Unknown error'}`, err instanceof Error ? err.stack : undefined);

      const message = process.env.NODE_ENV === 'production'
        ? 'FEEDBACK_PROCESSING_FAILED'
        : (err instanceof Error ? err.message : 'Unknown error');

      this.server.to(client.id).emit(AI_CHAT_EVENTS.AI_JOB_ERROR, {
        jobId,
        message,
        code: 'FEEDBACK_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  }


  private async executeJobDirectly(
    aiReq: aiChatApiReq,
    plan: TaskManagerOutput,
    dataContext: filteredSheetReturns,
    previousMessages: PreviousChatMessage[],
    clientId: string,
    fileName?: string
  ) {
    const executionStartTime = Date.now();

    this.logger.log(`작업 실행 시작 - 클라이언트: ${clientId}, fileName: ${fileName}`);

    try {
      // 1. AI 작업 실행
      this.logger.log(`AI 작업 처리 시작 - 태스크 수: ${plan.tasks?.length || 0}, intent: ${plan.intent}`);

      // intent 값 정규화 (대소문자 통일)
      const normalizedIntent = typeof plan.intent === 'string'
        ? plan.intent.toLowerCase()
        : plan.intent;

      let results: any[] = [];

      if (normalizedIntent === Intent.DATA_EDIT || normalizedIntent === 'data_edit') {
        const aiResults = await this.aiChatService.runPlannedTasks(aiReq, plan, dataContext, previousMessages);
        results = aiResults.results;
      } else if (normalizedIntent === Intent.GENERAL_HELP || normalizedIntent === 'general_help') {
        // general_help의 경우 기본 dataEditCommands 설정
        results = [{
          type: 'general_response',
          message: '일반적인 도움말 응답',
          timestamp: new Date().toISOString(),
          success: true
        }];
        this.logger.log(`일반 도움말 처리 완료 - intent: ${plan.intent}`);
      } else {
        this.logger.warn(`알 수 없는 intent: ${plan.intent}, 기본 처리 적용`);
        results = [{
          type: 'unknown_intent',
          message: '알 수 없는 요청 유형',
          timestamp: new Date().toISOString(),
          success: false
        }];
      }
      
      const executionTime = Date.now() - executionStartTime;
      this.logger.log(`작업 실행 완료 - 소요시간: ${executionTime}ms, 결과 수: ${results?.length || 0}, intent: ${plan.intent}`);

      // 2. 🔥 DB에 모든 변경사항을 먼저 저장 (트랜잭션으로 원자성 보장)
      const dbResults = await this.processSyncDbOperations(aiReq, plan, results);

      // 3. ✅ DB 저장이 성공한 후에만 클라이언트에 응답 전송
      this.logger.log(`클라이언트 응답 전송 준비 - fileName: ${fileName}`);
      this.server.to(clientId).emit(AI_CHAT_EVENTS.AI_TASKS_EXECUTED, {
        jobId: aiReq.jobId,
        chatSessionId: aiReq.chatSessionId, // 프론트엔드에서 다음 요청에 사용할 수 있도록 반환
        dataEditChatRes: {
          dataEditCommands: results,
        },
        fileName: fileName,
        // 실제 DB에서 생성된 ID들 반환
        spreadSheetVersionId: dbResults.actualSpreadSheetVersionId,
        editLockVersion: dbResults.newEditLockVersion, // 다음 요청에서 사용할 새로운 버전
        messageId: dbResults.messageId,
        executionTime,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`클라이언트 응답 전송 완료 - jobId: ${aiReq.jobId}, actualVersionId: ${dbResults.actualSpreadSheetVersionId}, fileName: ${fileName}`);

    } catch (err) {
      const executionTime = Date.now() - executionStartTime;
      this.logger.error(`작업 실행 실패 - 소요시간: ${executionTime}ms, 에러: ${err instanceof Error ? err.message : 'Unknown error'}`, err instanceof Error ? err.stack : undefined);

      // 운영 환경에서는 구체적인 에러 메시지 숨김
      const message = process.env.NODE_ENV === 'production'
        ? 'JOB_EXECUTION_FAILED'
        : (err instanceof Error ? err.message : 'Unknown error');

      this.server.to(clientId).emit(AI_CHAT_EVENTS.AI_JOB_ERROR, {
        jobId: aiReq.jobId,
        message,
        code: 'EXECUTION_ERROR',
        executionTime,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 🔥 DB에 모든 변경사항을 동기적으로 저장합니다 (데이터 일관성 보장)
   * 클라이언트 응답 전에 반드시 완료되어야 하는 중요한 작업
   */
  private async processSyncDbOperations(
    aiReq: aiChatApiReq,
    plan: TaskManagerOutput,
    results: any[]
  ): Promise<{
    actualSpreadSheetVersionId: string | null;
    messageId: string;
    newEditLockVersion: number;
  }> {
    this.logger.log(`동기 DB 작업 시작 - jobId: ${aiReq.jobId}`);

    try {
      // 🔥 1. 사용자 메시지 먼저 저장 (AI 처리 전 사용자 입력 기록)
      await this.aiChatService.saveUserMessage(aiReq);
      this.logger.log(`사용자 메시지 저장 완료 - jobId: ${aiReq.jobId}`);

      let actualSpreadSheetVersionId: string | null = null;
      let newEditLockVersion: number;

      // 2. 새 버전 스프레드시트 데이터 저장 (조건부)
      if (aiReq.newVersionSpreadSheetData) {
        // 현재 스프레드시트의 headVersionId 조회
        const existenceResult = await this.tableDataJsonSaveService.checkSheetDataExistence(
          aiReq.spreadsheetId,
          aiReq.userId
        );

        if (existenceResult.exists && existenceResult.headVersionId) {
          // 실제 editLockVersion 사용 (프론트엔드에서 제공된 값 또는 기본값)
          const editLockVersion = aiReq.editLockVersion || 1;

          this.logger.log(`스프레드시트 저장 시작 - editLockVersion: ${editLockVersion}, headVersionId: ${existenceResult.headVersionId}`);

          const addNewVersionSpreadSheetData: AddNewVersionSpreadSheetData = {
            spreadSheetId: aiReq.spreadsheetId,
            userId: aiReq.userId,
            headVersionId: existenceResult.headVersionId,
            editLockVersion,
            jsonData: aiReq.newVersionSpreadSheetData,
          };

          const saveResult = await this.tableDataJsonSaveService.addNewVersionSpreadSheetData(addNewVersionSpreadSheetData);

          actualSpreadSheetVersionId = saveResult.headVersionId; // 실제 DB에서 생성된 새 버전 ID
          newEditLockVersion = editLockVersion + 1; // 다음 편집을 위한 새로운 버전

          this.logger.log(`스프레드시트 저장 완료 - actualVersionId: ${actualSpreadSheetVersionId}, newEditLockVersion: ${newEditLockVersion}`);
        } else {
          throw new Error(`SpreadSheet not found: ${aiReq.spreadsheetId}`);
        }
      } else {
        // 스프레드시트 데이터 변경이 없는 경우, 현재 버전을 그대로 사용
        newEditLockVersion = (aiReq.editLockVersion || 1) + 1;
      }

      // 3. AI 응답 메시지 저장 (실제 스프레드시트 버전 ID 사용)
      const aiChatRes: aiChatApiRes = {
        jobId: aiReq.jobId,
        chatSessionId: aiReq.chatSessionId!, // null이 아님이 보장됨
        taskManagerOutput: plan,
        dataEditChatRes: {
          dataEditCommands: results,
        },
        spreadSheetVersionId: actualSpreadSheetVersionId || '', // 실제 DB에서 생성된 ID 사용
        editLockVersion: aiReq.editLockVersion || 1, // 낙관적 잠금을 위한 버전 번호
      };

      if (!aiReq.chatSessionId) {
        throw new Error('chatSessionId is required to save assistant message');
      }

      const messageId = await this.aiChatService.saveAssistantMessage(
        aiReq.chatId,
        aiReq.chatSessionId, // 프론트엔드에서 지정한 채팅 세션 ID
        aiChatRes,
        actualSpreadSheetVersionId // 실제 스프레드시트 버전 ID 연결
      );

      this.logger.log(`AI 응답 메시지 저장 완료 - messageId: ${messageId}, linkedVersionId: ${actualSpreadSheetVersionId}`);

      const dbResults = {
        actualSpreadSheetVersionId,
        messageId,
        newEditLockVersion,
      };

      this.logger.log(`동기 DB 작업 완료 - jobId: ${aiReq.jobId}, actualVersionId: ${dbResults.actualSpreadSheetVersionId}, newEditLockVersion: ${dbResults.newEditLockVersion}`);
      return dbResults;

    } catch (error) {
      this.logger.error(`동기 DB 작업 실패 - jobId: ${aiReq.jobId}, ${error instanceof Error ? error.message : error}`);
      throw error; // 상위로 전파하여 클라이언트에 에러 응답
    }
  }


  /**
   * 오래된 작업들을 정리합니다 (메모리 누수 방지)
   * 5분마다 자동 실행되어 30분 이상 된 작업을 정리합니다.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  private cleanupOldJobs() {
    const now = Date.now();
    const maxJobAge = 30 * 60 * 1000; // 30분
    const expiredJobs = this.jobRegistryService.deleteExpiredJobs(maxJobAge, now);

    for (const job of expiredJobs) {
      this.logger.warn(`오래된 작업 정리 - ID: ${job.jobId}, 생성시간: ${new Date(job.createdAt).toISOString()}`);

      // 클라이언트에게 타임아웃 알림
      this.server.to(job.clientId).emit(AI_CHAT_EVENTS.AI_JOB_TIMEOUT, {
        jobId: job.jobId,
        message: 'JOB_TIMEOUT',
      });
    }

    if (expiredJobs.length > 0) {
      this.logger.log(`${expiredJobs.length}개의 오래된 작업이 정리되었습니다.`);
    }
  }

  /**
   * Rate Limiting 추적 데이터를 정리합니다 (메모리 누수 방지)
   * 10분마다 자동 실행되어 오래된 추적 데이터와 차단 기록을 정리합니다.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  private cleanupRateLimitTracking() {
    const { userCleanedCount, ipCleanedCount } = this.rateLimitService.cleanup();

    if (userCleanedCount > 0 || ipCleanedCount > 0) {
      this.logger.log(`Rate Limit 추적 데이터 정리 완료 - 사용자: ${userCleanedCount}개, IP: ${ipCleanedCount}개`);
    }
  }
}

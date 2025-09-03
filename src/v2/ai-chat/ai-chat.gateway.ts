import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

import { AiChatService } from './ai-chat.service';

import { SpreadSheetStructure } from '../sheet/types/spreadsheet.types';
import type { aiChatApiReq } from './types/aiChat.types';
import type { TaskManagerOutput } from 'src/v2/ai-agent/types/taskManager.types';


@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
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
  ) { }

  // 간단한 메모리 상태 저장 (jobId -> 상태)
  private jobs = new Map<
    string,
    {
      aiReq: aiChatApiReq;
      plan: TaskManagerOutput;
      clientId: string;
      createdAt: number;
      dataContext: SpreadSheetStructure;
    }
  >();

  private genJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }


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
    let cleanedJobsCount = 0;
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.clientId === clientId) {
        this.jobs.delete(jobId);
        cleanedJobsCount++;
        this.logger.warn(`연결 해제로 인한 작업 정리: ${jobId}`);
      }
    }
    
    if (cleanedJobsCount > 0) {
      this.logger.log(`클라이언트 ${clientId}의 ${cleanedJobsCount}개 작업이 정리되었습니다.`);
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
    const startTime = Date.now();
    this.logger.log(`AI 작업 시작 요청 - 클라이언트: ${client.id}, 스프레드시트: ${payload.spreadsheetId}`);
    
    try {
      // 입력 데이터 검증
      if (!payload.spreadsheetId || !payload.chatId || !payload.userId) {
        this.logger.error(`필수 파라미터 누락 - 클라이언트: ${client.id}`);
        this.server.to(client.id).emit('ai_job_error', {
          message: 'MISSING_REQUIRED_PARAMETERS',
          code: 'VALIDATION_ERROR',
        });
        return;
      }
      const aiReq: aiChatApiReq = {
        websocketClientId: client.id,
        spreadsheetId: payload.spreadsheetId,
        chatId: payload.chatId,
        userId: payload.userId,
        chatMode: payload.chatMode ?? 'agent',
        userQuestionMessage: payload.userQuestionMessage,
        parsedSheetNames: [],
        jobId: payload.jobId,
      };

      const dataContext = await this.aiChatService.loadParsedSpreadsheetData(aiReq.spreadsheetId, aiReq.parsedSheetNames, aiReq.userId);

      // 1) 계획 수립
      const { plan } = await this.aiChatService.planTasks(aiReq, dataContext);

      // 2) job 생성 및 클라이언트에게 계획 전송
      const jobId = this.genJobId();
      this.jobs.set(jobId, {
        aiReq,
        plan,
        clientId: client.id,
        createdAt: Date.now(),
        dataContext,
      });

      this.server.to(client.id).emit('ai_job_planned', {
        jobId,
        plan,
      });

      // 3) agent 모드라면 즉시 실행
      if (aiReq.chatMode === 'agent') {
        await this.executeJob(jobId);
      }
    } catch (err) {
      this.logger.error(`AI 작업 시작 실패 - 클라이언트: ${client.id}, 에러: ${err instanceof Error ? err.message : 'Unknown error'}`, err instanceof Error ? err.stack : undefined);
      
      // 운영 환경에서는 구체적인 에러 메시지 숨김
      const message = process.env.NODE_ENV === 'production' 
        ? 'AI_JOB_START_FAILED' 
        : (err instanceof Error ? err.message : 'Unknown error');
        
      this.server.to(client.id).emit('ai_job_error', {
        message,
        code: 'JOB_START_ERROR',
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
        this.server.to(client.id).emit('ai_job_error', {
          jobId,
          message: 'INVALID_FEEDBACK_DATA',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const job = this.jobs.get(jobId);
      if (!job) {
        this.logger.warn(`존재하지 않는 작업ID - ID: ${jobId}, 클라이언트: ${client.id}`);
        this.server.to(client.id).emit('ai_job_error', {
          jobId,
          message: 'INVALID_JOB_ID',
          code: 'JOB_NOT_FOUND',
        });
        return;
      }

      // 클라이언트 소유권 확인
      if (job.clientId !== client.id) {
        this.logger.error(`작업 소유권 불일치 - 작업ID: ${jobId}, 요청 클라이언트: ${client.id}, 소유 클라이언트: ${job.clientId}`);
        this.server.to(client.id).emit('ai_job_error', {
          jobId,
          message: 'UNAUTHORIZED_JOB_ACCESS',
          code: 'PERMISSION_ERROR',
        });
        return;
      }

      if (feedback === 'SUCCESS') {
        this.logger.log(`작업 실행 계속 - ID: ${jobId}`);
        await this.executeJob(jobId);
      } else {
        // 실행 취소
        this.logger.warn(`작업 취소됨 - ID: ${jobId}`);
        this.jobs.delete(jobId);
        this.server.to(job.clientId).emit('ai_job_cancelled', { jobId });
      }
    } catch (err) {
      this.logger.error(`작업 피드백 처리 실패 - 작업ID: ${jobId}, 에러: ${err instanceof Error ? err.message : 'Unknown error'}`, err instanceof Error ? err.stack : undefined);
      
      const message = process.env.NODE_ENV === 'production' 
        ? 'FEEDBACK_PROCESSING_FAILED' 
        : (err instanceof Error ? err.message : 'Unknown error');
        
      this.server.to(client.id).emit('ai_job_error', {
        jobId,
        message,
        code: 'FEEDBACK_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async executeJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) {
      this.logger.warn(`실행하려는 작업이 존재하지 않음 - ID: ${jobId}`);
      return;
    }

    const { aiReq, plan, clientId, dataContext } = job;
    const executionStartTime = Date.now();
    
    this.logger.log(`작업 실행 시작 - ID: ${jobId}, 클라이언트: ${clientId}`);
    
    try {
      // 데이터 컨텍스트 검증
      if (!dataContext) {
        this.logger.error(`스프레드시트 데이터 누락 - 작업ID: ${jobId}`);
        this.server.to(clientId).emit('ai_job_error', {
          jobId,
          message: 'INVALID_SPREADSHEET_DATA',
          code: 'DATA_ERROR',
        });
        return;
      }

      // 작업 실행
      this.logger.log(`AI 작업 처리 시작 - ID: ${jobId}, 태스크 수: ${plan.tasks?.length || 0}`);
      const { results } = await this.aiChatService.runPlannedTasks(plan, aiReq, dataContext);

      const executionTime = Date.now() - executionStartTime;
      this.logger.log(`작업 실행 완료 - ID: ${jobId}, 소요시간: ${executionTime}ms, 결과 수: ${results?.length || 0}`);

      // runPlannedTasks는 dataEditCommand[]를 반환(배열)하므로 프론트가 쓰기 쉽게 래핑
      this.server.to(clientId).emit('ai_tasks_executed', {
        jobId,
        dataEditChatRes: {
          dataEditCommands: results,
        },
        executionTime,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const executionTime = Date.now() - executionStartTime;
      this.logger.error(`작업 실행 실패 - ID: ${jobId}, 소요시간: ${executionTime}ms, 에러: ${err instanceof Error ? err.message : 'Unknown error'}`, err instanceof Error ? err.stack : undefined);
      
      // 운영 환경에서는 구체적인 에러 메시지 숨김
      const message = process.env.NODE_ENV === 'production' 
        ? 'JOB_EXECUTION_FAILED' 
        : (err instanceof Error ? err.message : 'Unknown error');
        
      this.server.to(clientId).emit('ai_job_error', {
        jobId,
        message,
        code: 'EXECUTION_ERROR',
        executionTime,
        timestamp: new Date().toISOString(),
      });
    } finally {
      // 완료/실패 시 정리
      this.jobs.delete(jobId);
      this.logger.log(`작업 정리 완료 - ID: ${jobId}`);
    }
  }

  /**
   * 오래된 작업들을 정리합니다 (메모리 누수 방지)
   * 실제 운영 환경에서는 cron job이나 스케줄러를 통해 정기적으로 호출해야 합니다.
   * TODO: 스케줄러(@nestjs/schedule)를 사용해서 정기적으로 실행하도록 구현 필요
   */
  private cleanupOldJobs() {
    const now = Date.now();
    const maxJobAge = 30 * 60 * 1000; // 30분
    let cleanedCount = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (now - job.createdAt > maxJobAge) {
        this.jobs.delete(jobId);
        cleanedCount++;
        this.logger.warn(`오래된 작업 정리 - ID: ${jobId}, 생성시간: ${new Date(job.createdAt).toISOString()}`);
        
        // 클라이언트에게 타임아웃 알림
        this.server.to(job.clientId).emit('ai_job_timeout', {
          jobId,
          message: 'JOB_TIMEOUT',
        });
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`${cleanedCount}개의 오래된 작업이 정리되었습니다.`);
    }
  }
}
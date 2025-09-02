import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { AiChatService } from './ai-chat.service';
import { TableDataJsonSaveService } from '../sheet/_table-data-json-save/table-data-json-save.service';

import { SpreadSheetStructure } from '../sheet/types/spreadsheet.types';
import type { aiChatApiReq } from './types/aiChat.types';
import type { TaskManagerOutput } from 'src/v2/ai-agent/types/taskManager.types';


@WebSocketGateway({ cors: true })
export class AiChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly tableDataJsonSaveService: TableDataJsonSaveService,
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

  // 클라이언트가 연결되었을 때
  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  // 클라이언트 연결이 끊겼을 때
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  /**
   * 클라이언트로부터 새로운 AI 작업을 시작하라는 요청을 받습니다.
   */
  @SubscribeMessage('start_ai_job')
  async handleStartAiJob(
    client: Socket,
    payload: {
      question?: string;
      userQuestionMessage?: string;
      spreadsheetId: string;
      chatId: string;
      userId: string;
      chatMode?: 'agent' | 'edit';
      // dataContext 등 확장 필드는 서비스 내부에서 필요시 사용하도록 남겨둠
      [key: string]: any;
    },
  ): Promise<void> {
    try {
      const aiReq: aiChatApiReq = {
        clientId: client.id,
        spreadsheetId: payload.spreadsheetId,
        chatId: payload.chatId,
        userId: payload.userId,
        chatMode: payload.chatMode ?? 'agent',
        userQuestionMessage: payload.userQuestionMessage ?? payload.question ?? '',
        parsedSheetNames: [],
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
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.server.to(client.id).emit('ai_job_error', {
        message,
      });
    }
  }

  /**
   * 클라이언트로부터 이전 Task의 성공/실패 피드백을 받습니다.
   */
  @SubscribeMessage('acknowledge_task')
  async handleAcknowledgeTask(client: Socket, payload: { jobId: string; feedback: 'SUCCESS' | 'FAILURE' }): Promise<void> {
    const { jobId, feedback } = payload;
    // 서비스에 피드백을 전달하고 다음 Task 실행을 위임합니다.
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        this.server.to(client.id).emit('ai_job_error', {
          jobId,
          message: 'INVALID_JOB_ID',
        });
        return;
      }

      if (feedback === 'SUCCESS') {
        await this.executeJob(jobId);
      } else {
        // 실행 취소
        this.jobs.delete(jobId);
        this.server.to(job.clientId).emit('ai_job_cancelled', { jobId });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.server.to(client.id).emit('ai_job_error', {
        jobId,
        message,
      });
    }
  }

  private async executeJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    

    const { aiReq, plan, clientId, dataContext } = job;
    try {
      if (!dataContext) {
        this.server.to(clientId).emit('ai_job_error', {
          jobId,
          message: 'INVALID_SPREADSHEET_DATA',
        });
        return;
      }
      const { results } = await this.aiChatService.runPlannedTasks(plan, aiReq, dataContext);

      // runPlannedTasks는 dataEditCommand[]를 반환(배열)하므로 프론트가 쓰기 쉽게 래핑
      this.server.to(clientId).emit('ai_tasks_executed', {
        jobId,
        dataEditChatRes: {
          dataEditCommands: results,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.server.to(clientId).emit('ai_job_error', {
        jobId,
        message,
      });
    } finally {
      // 완료/실패 시 정리
      this.jobs.delete(jobId);
    }
  }
}
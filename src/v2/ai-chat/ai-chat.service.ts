import { Injectable, Logger } from '@nestjs/common';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { aiChatApiReq } from './types/aiChat.types';
import { TaskManagerOutput } from 'src/v2/ai-agent/types/taskManager.types';
import { SpreadSheetStructure, createSafeError } from '../sheet/types/spreadsheet.types';
import { PrismaService } from '../prisma/prisma.service';


// import { RedisService } from '...'; // Redis와 같은 상태 저장소 서비스

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly prisma: PrismaService,
    // private readonly redisService: RedisService,
  ) {}

  /**
  * 계획을 수립합니다
  */
  async planTasks(aiChatApiReq: aiChatApiReq, dataContext: SpreadSheetStructure) {
    // 1. Task Manager를 호출하여 전체 계획을 수립합니다.
    const plan = await this.aiAgentService.runTaskManager(
      aiChatApiReq.userQuestionMessage,
      dataContext
    );

    return {
      plan
    };
  }

  async runPlannedTasks(TaskManagerOutput: TaskManagerOutput, aiChatApiReq: aiChatApiReq, dataContext: SpreadSheetStructure) {
    // 1. 계획된 모든 Task를 순차적으로 실행합니다.
    const results = await Promise.all(
      TaskManagerOutput.tasks.map((task) => {
        return this.aiAgentService.runSingleTask(task, aiChatApiReq.userQuestionMessage, dataContext, 'small');
      })
    );

    return {
      results
    };
  }

  async loadParsedSpreadsheetData(
      spreadsheetId: string,
      parsedSheetNames: string[],
      userId?: string
    ): Promise<SpreadSheetStructure> {
      if (!spreadsheetId || !parsedSheetNames || parsedSheetNames.length === 0 || !userId) {
        this.logger.log(`Missing parameters for spreadsheet loading - spreadsheetId: ${spreadsheetId}, parsedSheetNames: ${parsedSheetNames?.length || 0}, userId: ${userId}`);
        throw new Error('Missing parameters');
      }
  
      try {
        this.logger.log(`Loading spreadsheet data from JSONB for id: ${spreadsheetId}, sheets: ${parsedSheetNames.join(', ')}, user: ${userId}`);
        
        // SpreadSheetData에서 JSONB 데이터 조회
        const spreadSheetData = await this.prisma.spreadSheetData.findFirst({
          where: {
            spreadSheet: {
              id: spreadsheetId,
              userId: userId,
              status: 'ACTIVE'
            }
          },
          orderBy: {
            savedAt: 'desc'
          }
        });
  
        if (!spreadSheetData || !(spreadSheetData as any).data) {
          this.logger.warn(`No JSONB data found for spreadsheet: ${spreadsheetId}`);
          return Promise.reject(new Error('No sheets found'));
        }
  
        const fullData = (spreadSheetData as any).data as SpreadSheetStructure;
        
        if (!fullData.sheets) {
          this.logger.warn(`No sheets found in JSONB data for spreadsheet: ${spreadsheetId}`);
          return Promise.reject(new Error('No sheets found'));
        }
  
        // 요청된 시트들이 존재하는지 확인 (로깅 목적)
        let foundSheetCount = 0;
        const availableSheets = Object.keys(fullData.sheets);
        
        for (const sheetName of parsedSheetNames) {
          if (fullData.sheets[sheetName]) {
            foundSheetCount++;
            this.logger.log(`Found requested sheet: ${sheetName} in JSONB data`);
          } else {
            this.logger.warn(`Requested sheet '${sheetName}' not found in JSONB data. Available sheets: ${availableSheets.join(', ')}`);
          }
        }
        
        if (foundSheetCount === 0) {
          this.logger.warn(`None of the requested sheets were found for spreadsheet: ${spreadsheetId}`);
          throw new Error('No requested sheets found');
        }
  
        // 전체 스프레드시트 데이터를 그대로 반환 (렌더링을 위해)
        this.logger.log(`Successfully loaded full spreadsheet data with ${availableSheets.length} total sheets (${foundSheetCount}/${parsedSheetNames.length} requested sheets found): ${availableSheets.join(', ')}`);
        
        return fullData;
  
      } catch (error) {
        const safeError = createSafeError(error);
        this.logger.error(`Failed to load parsed spreadsheet data: ${safeError.message}`, safeError.details);
        return Promise.reject(safeError);
      }
    }
}
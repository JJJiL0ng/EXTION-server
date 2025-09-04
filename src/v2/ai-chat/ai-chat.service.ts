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
    userId: string
  ): Promise<SpreadSheetStructure | null> {
    console.log(`[DEBUG] loadParsedSpreadsheetData START - spreadsheetId: ${spreadsheetId}, parsedSheetNames: ${JSON.stringify(parsedSheetNames)}, userId: ${userId}`);
    this.logger.log(`loadParsedSpreadsheetData called with - spreadsheetId: ${spreadsheetId}, parsedSheetNames: ${JSON.stringify(parsedSheetNames)}, userId: ${userId}`);
    
    if (!spreadsheetId || !userId) {
      console.log(`[DEBUG] Missing required parameters - spreadsheetId: ${spreadsheetId}, userId: ${userId}`);
      this.logger.warn(`Missing required parameters - spreadsheetId: ${spreadsheetId}, userId: ${userId}`);
      return null;
    }
    
    // parsedSheetNames가 비어있는 경우 경고만 하고 계속 진행
    if (!parsedSheetNames || parsedSheetNames.length === 0) {
      console.log(`[DEBUG] parsedSheetNames is empty, continuing anyway`);
      this.logger.warn(`parsedSheetNames is empty or null - will load all available sheets. parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);
    }

    try {
      this.logger.log(`Loading spreadsheet data from JSONB for id: ${spreadsheetId}, sheets: ${parsedSheetNames?.join(', ') || 'ALL'}, user: ${userId}`);
      
      // SpreadSheetData에서 JSONB 데이터 조회
      this.logger.log(`Querying SpreadSheetData for spreadsheet: ${spreadsheetId}, user: ${userId}`);
      
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

      this.logger.log(`SpreadSheetData query result:`, {
        found: !!spreadSheetData,
        hasData: !!(spreadSheetData as any)?.data,
        dataType: typeof (spreadSheetData as any)?.data
      });

      if (!spreadSheetData || !(spreadSheetData as any).data) {
        this.logger.warn(`No JSONB data found for spreadsheet: ${spreadsheetId}. SpreadSheetData exists: ${!!spreadSheetData}`);
        return null;
      }

      let rawData = (spreadSheetData as any).data;
      
      // 데이터가 문자열로 저장된 경우 JSON 파싱
      if (typeof rawData === 'string') {
        try {
          console.log(`[DEBUG] Parsing JSON string data for ${spreadsheetId}`);
          rawData = JSON.parse(rawData);
          this.logger.log(`Successfully parsed JSON string data for ${spreadsheetId}`);
        } catch (parseError) {
          this.logger.error(`Failed to parse JSON string data for ${spreadsheetId}:`, parseError);
          return null;
        }
      }
      
      // 실제 데이터 구조에 따라 sheets 접근 경로 수정
      let fullData: SpreadSheetStructure;
      let sheets: any;
      
      console.log(`[DEBUG] rawData keys after parsing:`, Object.keys(rawData));
      
      if (rawData.spreadsheetData?.sheets) {
        // 데이터가 spreadsheetData.sheets 구조인 경우
        sheets = rawData.spreadsheetData.sheets;
        fullData = rawData.spreadsheetData;
        this.logger.log(`Using spreadsheetData.sheets structure for ${spreadsheetId}`);
      } else if (rawData.sheets) {
        // 데이터가 직접 sheets 구조인 경우
        sheets = rawData.sheets;
        fullData = rawData;
        this.logger.log(`Using direct sheets structure for ${spreadsheetId}`);
      } else {
        this.logger.warn(`No sheets found in JSONB data for spreadsheet: ${spreadsheetId}. Available keys:`, Object.keys(rawData));
        return null;
      }
      
      this.logger.log(`Found sheets:`, Object.keys(sheets));

      // 요청된 시트들이 존재하는지 확인 (로깅 목적)
      let foundSheetCount = 0;
      const availableSheets = Object.keys(sheets);
      
      if (parsedSheetNames && parsedSheetNames.length > 0) {
        for (const sheetName of parsedSheetNames) {
          if (sheets[sheetName]) {
            foundSheetCount++;
            this.logger.log(`Found requested sheet: ${sheetName} in JSONB data`);
          } else {
            this.logger.warn(`Requested sheet '${sheetName}' not found in JSONB data. Available sheets: ${availableSheets.join(', ')}`);
          }
        }
      } else {
        // parsedSheetNames가 없으면 모든 시트를 사용
        foundSheetCount = availableSheets.length;
        this.logger.log(`No specific sheets requested, using all available sheets: ${availableSheets.join(', ')}`);
      }
      
      if (foundSheetCount === 0) {
        this.logger.warn(`None of the requested sheets were found for spreadsheet: ${spreadsheetId}`);
        return null;
      }

      // fullData에 sheets 속성 설정 (SpreadSheetStructure 인터페이스 호환성을 위해)
      fullData.sheets = sheets;
      
      // 전체 스프레드시트 데이터를 그대로 반환 (렌더링을 위해)
      const requestedSheetCount = parsedSheetNames?.length || 0;
      this.logger.log(`Successfully loaded full spreadsheet data with ${availableSheets.length} total sheets (${foundSheetCount}/${requestedSheetCount} requested sheets found): ${availableSheets.join(', ')}`);
      
      return fullData;

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to load parsed spreadsheet data: ${safeError.message}`, safeError.details);
      return null;
    }
  }
}


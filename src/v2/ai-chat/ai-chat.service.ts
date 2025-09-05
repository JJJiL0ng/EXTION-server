import { Injectable, Logger } from '@nestjs/common';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { aiChatApiReq } from './types/aiChat.types';
import { TaskManagerOutput } from 'src/v2/ai-agent/types/taskManager.types';
import { SpreadSheetStructure, createSafeError } from '../sheet/types/spreadsheet.types';
import { PrismaService } from '../prisma/prisma.service';


// import { RedisService } from '...'; // Redis와 같은 상태 저장소 서비스

 export interface filteredSheetReturns {
    [sheetName: string]: any;
  }

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
  async planTasks(aiChatApiReq: aiChatApiReq, dataContext: filteredSheetReturns) {
    // 1. Task Manager를 호출하여 전체 계획을 수립합니다.
    const plan = await this.aiAgentService.runTaskManager(
      aiChatApiReq.userQuestionMessage,
      dataContext
    );

    return {
      plan
    };
  }

  async runPlannedTasks(TaskManagerOutput: TaskManagerOutput, aiChatApiReq: aiChatApiReq, dataContext: filteredSheetReturns) {
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
  ): Promise<filteredSheetReturns | null> {
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

      // 요청된 시트들만 필터링하여 반환
      let foundSheetCount = 0;
      const availableSheets = Object.keys(sheets);
      let filteredSheets: { [sheetName: string]: any } = {};
      
      if (parsedSheetNames && parsedSheetNames.length > 0) {
        // 특정 시트들만 요청된 경우 - 해당 시트들만 필터링
        console.log(`[DEBUG] Filtering sheets - requested: ${JSON.stringify(parsedSheetNames)}, available: ${JSON.stringify(availableSheets)}`);
        
        for (const sheetName of parsedSheetNames) {
          if (sheets[sheetName]) {
            filteredSheets[sheetName] = sheets[sheetName];
            foundSheetCount++;
            this.logger.log(`Found and included requested sheet: ${sheetName} in filtered data`);
          } else {
            this.logger.warn(`Requested sheet '${sheetName}' not found in JSONB data. Available sheets: ${availableSheets.join(', ')}`);
          }
        }
        
        if (foundSheetCount === 0) {
          this.logger.warn(`None of the requested sheets were found for spreadsheet: ${spreadsheetId}`);
          return null;
        }
        
        this.logger.log(`Successfully filtered ${foundSheetCount}/${parsedSheetNames.length} requested sheets: ${Object.keys(filteredSheets).join(', ')}`);
      } else {
        // parsedSheetNames가 없으면 모든 시트를 사용
        filteredSheets = sheets;
        foundSheetCount = availableSheets.length;
        this.logger.log(`No specific sheets requested, using all available sheets: ${availableSheets.join(', ')}`);
      }

      // fullData에 필터링된 sheets 속성 설정
      fullData.sheets = filteredSheets;
      
      const requestedSheetCount = parsedSheetNames?.length || availableSheets.length;
      this.logger.log(`Successfully loaded spreadsheet data with ${Object.keys(filteredSheets).length} sheets (${foundSheetCount}/${requestedSheetCount} requested): ${Object.keys(filteredSheets).join(', ')}`);
      
      // return fullData;
      return fullData.sheets;
    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to load parsed spreadsheet data: ${safeError.message}`, safeError.details);
      return null;
    }
  }
}


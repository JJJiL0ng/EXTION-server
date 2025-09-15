import { Injectable, Logger } from '@nestjs/common';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { aiChatApiReq, aiChatApiRes, previousMessagesContent } from './types/aiChat.types';
import { TaskManagerOutput } from 'src/v2/ai-agent/types/taskManager.types';
import { createSafeError } from '../sheet/types/spreadsheet.types';
import { PrismaService } from '../prisma/prisma.service';
import { filteredSheetReturns, PreviousChatMessage, ChatHistory, UserPreviousMessage, AiPreviousMessage } from './types/aiChat.types';

/**
 * aiChatApiRes 타입 가드 함수
 * @param obj - 검증할 객체
 * @returns aiChatApiRes 타입인지 여부
 */
function isAiChatApiRes(obj: any): obj is aiChatApiRes {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.jobId === 'string' &&
    obj.taskManagerOutput &&
    typeof obj.taskManagerOutput === 'object' &&
    obj.dataEditChatRes &&
    typeof obj.dataEditChatRes === 'object'
  );
}

/**
 * JsonValue를 aiChatApiRes로 안전하게 변환하는 함수
 * @param jsonValue - Prisma JsonValue
 * @returns aiChatApiRes 또는 null
 */
function parseAiChatApiRes(jsonValue: any): aiChatApiRes | null {
  if (!jsonValue) {
    return null;
  }

  try {
    // JsonValue가 이미 객체인 경우와 문자열인 경우 모두 처리
    const obj = typeof jsonValue === 'string' ? JSON.parse(jsonValue) : jsonValue;

    if (isAiChatApiRes(obj)) {
      return obj;
    }

    return null;
  } catch (error) {
    return null;
  }
}

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly prisma: PrismaService,
    // private readonly redisService: RedisService,
  ) { }

  /**
  * 계획을 수립합니다
  */
  async planTasks(aiChatApiReq: aiChatApiReq, dataContext: filteredSheetReturns, previousMessages: PreviousChatMessage[]) {
    // 1. Task Manager를 호출하여 전체 계획을 수립합니다.
    const plan = await this.aiAgentService.runTaskManager(
      aiChatApiReq.userQuestionMessage,
      dataContext,
      previousMessages
    );

    return {
      plan
    };
  }

  async runPlannedTasks(TaskManagerOutput: TaskManagerOutput, dataContext: filteredSheetReturns, previousMessages: PreviousChatMessage[]) {
    // 1. 계획된 모든 Task를 순차적으로 실행합니다.
    const results = await Promise.all(
      TaskManagerOutput.tasks.map((task) => {
        // return this.aiAgentService.runSingleTask(task, aiChatApiReq.userQuestionMessage, dataContext, 'small');
        return this.aiAgentService.runSingleTask(previousMessages, task, task.description, dataContext, 'small');
      })
    );

    return {
      results
    };
  }

  async loadParsedSpreadsheetData(
    spreadsheetId: string,
    parsedSheetNames: string[],
    userId: string,
    spreadsheetVersionNumber: number
  ): Promise<filteredSheetReturns | null> {
    console.log(`[DEBUG] loadParsedSpreadsheetData START - spreadsheetId: ${spreadsheetId}, parsedSheetNames: ${JSON.stringify(parsedSheetNames)}, userId: ${userId}, versionNumber: ${spreadsheetVersionNumber}`);
    this.logger.log(`loadParsedSpreadsheetData called with - spreadsheetId: ${spreadsheetId}, parsedSheetNames: ${JSON.stringify(parsedSheetNames)}, userId: ${userId}, versionNumber: ${spreadsheetVersionNumber}`);

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

      // 특정 버전이 지정되었으면 그 버전을, 없으면 최신 버전을 가져오기
      const whereClause: any = {
        spreadSheet: {
          id: spreadsheetId,
          userId: userId,
          status: 'ACTIVE'
        }
      };

      // 특정 버전 번호가 지정되었으면 해당 버전을 조회
      if (spreadsheetVersionNumber !== undefined) {
        whereClause.spreadSheetVersionNumber = spreadsheetVersionNumber;
      }

      const spreadSheetVersionData = await this.prisma.spreadSheetVersionData.findFirst({
        where: whereClause,
        orderBy: spreadsheetVersionNumber !== undefined
          ? undefined
          : { spreadSheetVersionNumber: 'desc' } // 특정 버전이 아니면 최신 버전 가져오기
      });

      this.logger.log(`SpreadSheetVersionData query result:`, {
        found: !!spreadSheetVersionData,
        hasData: !!(spreadSheetVersionData as any)?.data,
        dataType: typeof (spreadSheetVersionData as any)?.data
      });

      if (!spreadSheetVersionData || !(spreadSheetVersionData as any).data) {
        this.logger.warn(`No JSONB data found for spreadsheet: ${spreadsheetId}. SpreadSheetVersionData exists: ${!!spreadSheetVersionData}`);
        return null;
      }

      let rawData = (spreadSheetVersionData as any).data;

      // 실제 데이터 구조에 따라 sheets 접근 경로 수정
      let fullData: Record<string, any>;
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

  async parseNewVersionSpreadSheetData(
    parsedSheetNames: string[],
    newVersionSpreadSheetData: Record<string, any>,
  ): Promise<filteredSheetReturns | null> {
    console.log(`[DEBUG] parseNewVersionSpreadSheetData START - parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);
    this.logger.log(`parseNewVersionSpreadSheetData called with - parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);

    if (!newVersionSpreadSheetData) {
      console.log(`[DEBUG] newVersionSpreadSheetData is null or undefined`);
      this.logger.warn(`newVersionSpreadSheetData is null or undefined`);
      return null;
    }

    // parsedSheetNames가 비어있는 경우 경고만 하고 계속 진행
    if (!parsedSheetNames || parsedSheetNames.length === 0) {
      console.log(`[DEBUG] parsedSheetNames is empty, continuing anyway`);
      this.logger.warn(`parsedSheetNames is empty or null - will load all available sheets. parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);
    }

    try {
      this.logger.log(`Parsing new version spreadsheet data, sheets: ${parsedSheetNames?.join(', ') || 'ALL'}`);

      let rawData = newVersionSpreadSheetData;

      // 실제 데이터 구조에 따라 sheets 접근 경로 수정
      let fullData: Record<string, any>;
      let sheets: any;

      console.log(`[DEBUG] rawData keys after parsing:`, Object.keys(rawData));

      if (rawData.spreadsheetData?.sheets) {
        // 데이터가 spreadsheetData.sheets 구조인 경우
        sheets = rawData.spreadsheetData.sheets;
        fullData = rawData.spreadsheetData;
        this.logger.log(`Using spreadsheetData.sheets structure`);
      } else if (rawData.sheets) {
        // 데이터가 직접 sheets 구조인 경우
        sheets = rawData.sheets;
        fullData = rawData;
        this.logger.log(`Using direct sheets structure`);
      } else {
        this.logger.warn(`No sheets found in newVersionSpreadSheetData. Available keys:`, Object.keys(rawData));
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
            this.logger.warn(`Requested sheet '${sheetName}' not found in newVersionSpreadSheetData. Available sheets: ${availableSheets.join(', ')}`);
          }
        }

        if (foundSheetCount === 0) {
          this.logger.warn(`None of the requested sheets were found in new version data`);
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
      this.logger.log(`Successfully parsed new version spreadsheet data with ${Object.keys(filteredSheets).length} sheets (${foundSheetCount}/${requestedSheetCount} requested): ${Object.keys(filteredSheets).join(', ')}`);

      return fullData.sheets;
    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to parse new version spreadsheet data: ${safeError.message}`, safeError.details);
      return null;
    }
  }

  /**
   * 사용자 메시지를 데이터베이스에 저장합니다
   * @param aiReq - AI 채팅 요청 객체
   * @returns 저장된 메시지 ID
   */
  async saveUserMessage(aiReq: aiChatApiReq): Promise<string> {
    try {
      this.logger.log(`사용자 메시지 저장 시작 - chatId: ${aiReq.chatId}, userId: ${aiReq.userId}`);

      return await this.prisma.$transaction(async (tx) => {
        // 1. Chat 존재 확인 및 생성
        const existingChat = await tx.chat.findUnique({
          where: { id: aiReq.chatId }
        });

        if (!existingChat) {
          // Chat이 없으면 새로 생성
          await tx.chat.create({
            data: {
              id: aiReq.chatId,
              title: '새 채팅', // 기본 제목
              userId: aiReq.userId,
              spreadSheetId: aiReq.spreadsheetId,
              messageCount: 0
            }
          });
          this.logger.log(`새 채팅 생성됨 - chatId: ${aiReq.chatId}`);
        }

        // 2. 사용자 메시지 저장 (metadata 없이)
        const message = await tx.message.create({
          data: {
            content: aiReq.userQuestionMessage,
            role: 'USER',
            type: 'TEXT',
            chatId: aiReq.chatId,
            // metadata는 사용자 메시지에서는 저장하지 않음
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

        this.logger.log(`사용자 메시지 저장 완료 - messageId: ${message.id}`);
        return message.id;
      });

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`사용자 메시지 저장 실패: ${safeError.message}`, safeError.details);
      throw new Error(`사용자 메시지 저장 실패: ${safeError.message}`);
    }
  }

  /**
   * AI(Assistant) 메시지를 데이터베이스에 저장합니다
   * @param chatId - 채팅 ID
   * @param aiChatRes - AI 채팅 응답 객체 (전체)
   * @returns 저장된 메시지 ID
   */
  async saveAssistantMessage(
    chatId: string,
    aiChatRes: aiChatApiRes,
  ): Promise<string> {
    try {
      this.logger.log(`AI 응답 메시지 저장 시작 - chatId: ${chatId}, jobId: ${aiChatRes.jobId}`);

      // aiChatApiRes 타입 검증
      if (!isAiChatApiRes(aiChatRes)) {
        throw new Error('유효하지 않은 aiChatApiRes 데이터입니다');
      }

      return await this.prisma.$transaction(async (tx) => {
        // AI 응답 메시지 저장
        const message = await tx.message.create({
          data: {
            content: aiChatRes.taskManagerOutput.reason, // 사용자 친화적 설명
            role: 'ASSISTANT',
            type: 'SUGGESTION',
            chatId,
            aiChatRes: aiChatRes as unknown as any // 타입 안전성을 위한 unknown을 통한 변환
          }
        });

        // Chat 메시지 카운트 업데이트
        await tx.chat.update({
          where: { id: chatId },
          data: {
            messageCount: { increment: 1 },
            updatedAt: new Date()
          }
        });

        this.logger.log(`AI 응답 메시지 저장 완료 - messageId: ${message.id}`);
        return message.id;
      });

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`AI 응답 메시지 저장 실패: ${safeError.message}`, safeError.details);
      throw new Error(`AI 응답 메시지 저장 실패: ${safeError.message}`);
    }
  }
  /**
   * 멀티턴 AI를 위해 최근 10개의 메시지를 불러옵니다 (사용자 5개, 어시스턴트 5개)
   * @param chatId - 채팅 ID
   * @returns 시간순으로 정렬된 ChatHistory 배열
   */
  async loadMultiturnMessages(chatId: string): Promise<ChatHistory> {
    try {
      this.logger.log(`멀티턴 메시지 로드 시작 - chatId: ${chatId}`);

      // 최근 10개 메시지 조회 (사용자 메시지 5개, 어시스턴트 메시지 5개를 합쳐서)
      const messages = await this.prisma.message.findMany({
        where: {
          chatId: chatId
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 10
      });

      if (!messages || messages.length === 0) {
        this.logger.log(`채팅에서 메시지를 찾을 수 없음 - chatId: ${chatId}`);
        return [];
      }

      // 메시지를 시간순으로 정렬 (오래된 것부터)
      const sortedMessages = messages.reverse();

      // 타입에 맞게 변환
      const chatHistory: ChatHistory = sortedMessages.map(message => {
        if (message.role === 'USER') {
          const userMessage: UserPreviousMessage = {
            role: 'user',
            userQuestionMessage: message.content
          };
          return userMessage;
        } else if (message.role === 'ASSISTANT' && message.aiChatRes) {
          // aiChatRes 타입 안전성 검증
          const parsedAiChatRes = parseAiChatApiRes(message.aiChatRes);

          if (parsedAiChatRes) {
            const assistantMessage: AiPreviousMessage = {
              role: 'assistant',
              aiChatRes: parsedAiChatRes
            };
            return assistantMessage;
          } else {
            // aiChatRes 파싱 실패 시 경고 로그 출력하고 사용자 메시지로 폴백
            this.logger.warn(`aiChatRes 파싱 실패 - messageId: ${message.id}, chatId: ${chatId}`);
            const userMessage: UserPreviousMessage = {
              role: 'user',
              userQuestionMessage: message.content
            };
            return userMessage;
          }
        } else {
          // SYSTEM 메시지나 aiChatRes가 없는 ASSISTANT 메시지는 사용자 메시지로 처리
          const userMessage: UserPreviousMessage = {
            role: 'user',
            userQuestionMessage: message.content
          };
          return userMessage;
        }
      });

      this.logger.log(`멀티턴 메시지 로드 완료 - 총 ${chatHistory.length}개 메시지`);
      return chatHistory;

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`멀티턴 메시지 로드 실패: ${safeError.message}`, safeError.details);
      throw new Error(`멀티턴 메시지 로드 실패: ${safeError.message}`);
    }
  }

  async loadUserAiChatHistory(chatId: string, userId: string): Promise<previousMessagesContent[] | null> {
    try {
      this.logger.log(`채팅 히스토리 로드 시작 - chatId: ${chatId}, userId: ${userId}`);

      // 1. Chat 존재 및 권한 확인
      const chat = await this.prisma.chat.findFirst({
        where: {
          id: chatId,
          userId: userId,
          status: 'ACTIVE'
        }
      });

      if (!chat) {
        this.logger.warn(`채팅을 찾을 수 없거나 권한이 없음 - chatId: ${chatId}, userId: ${userId}`);
        return null;
      }

      // 2. 최대 50개의 메시지를 시간순으로 가져오기 (가장 최근 50개)
      const messages = await this.prisma.message.findMany({
        where: {
          chatId: chatId,
          role: {
            in: ['USER', 'ASSISTANT']
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 50,
        select: {
          role: true,
          content: true,
          aiChatRes: true,
          createdAt: true
        }
      });

      if (messages.length === 0) {
        this.logger.log(`채팅 히스토리가 비어있음 - chatId: ${chatId}`);
        return [];
      }

      // 3. 시간순으로 정렬 (오래된 것부터)
      messages.reverse();

      // 4. 첫 번째 메시지가 user 메시지가 되도록 조정
      let startIndex = 0;
      if (messages.length > 0 && messages[0].role === 'ASSISTANT') {
        startIndex = 1;
      }

      // 5. previousMessagesContent 형태로 변환
      const chatHistory: previousMessagesContent[] = [];

      for (let i = startIndex; i < messages.length; i++) {
        const message = messages[i];

        if (message.role === 'USER') {
          chatHistory.push({
            role: 'user',
            content: message.content
          });
        } else if (message.role === 'ASSISTANT') {
          // aiChatRes에서 적절한 content 추출
          chatHistory.push({
            role: 'assistant',
            content: message.content
          });
        }
      }

      this.logger.log(`채팅 히스토리 로드 완료 - ${chatHistory.length}개 메시지, 첫 메시지 role: ${chatHistory[0]?.role || 'none'}`);
      return chatHistory;

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`채팅 히스토리 로드 실패 - chatId: ${chatId}, userId: ${userId}: ${safeError.message}`, safeError.details);
      return null;
    }
  }


}


import { Injectable, Logger } from '@nestjs/common';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { aiChatApiReq, aiChatApiRes, previousMessagesContent } from './types/aiChat.types';
import { TaskManagerOutput } from 'src/v2/ai-agent/types/taskManager.types';
import { createSafeError } from '../sheet/types/spreadsheet.types';
import { PrismaService } from '../prisma/prisma.service';
import { filteredSheetReturns, PreviousChatMessage, ChatHistory, UserPreviousMessage, AiPreviousMessage } from './types/aiChat.types';
import { SpreadSheet, SpreadSheetVersionData } from '@prisma/client';
import { ChatSession } from '@google/generative-ai';

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

  async runPlannedTasks(aiChatApiReq: aiChatApiReq, TaskManagerOutput: TaskManagerOutput, dataContext: filteredSheetReturns, previousMessages: PreviousChatMessage[]) {
    // 1. 계획된 모든 Task를 순차적으로 실행합니다.
    const results = await Promise.all(
      TaskManagerOutput.tasks.map((task) => {
        return this.aiAgentService.runSingleTask(previousMessages, task, aiChatApiReq.userQuestionMessage, dataContext, aiChatApiReq.aiModel);
        // return this.aiAgentService.runSingleTask(previousMessages, task, task.description, dataContext, 'small');
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
    spreadSheetVersionId?: string
  ): Promise<filteredSheetReturns | null> {
    // console.log(`[DEBUG] loadParsedSpreadsheetData START - spreadsheetId: ${spreadsheetId}, parsedSheetNames: ${JSON.stringify(parsedSheetNames)}, userId: ${userId}, versionId: ${spreadSheetVersionId}`);
    this.logger.log(`loadParsedSpreadsheetData called with - spreadsheetId: ${spreadsheetId}, parsedSheetNames: ${JSON.stringify(parsedSheetNames)}, userId: ${userId}, versionId: ${spreadSheetVersionId}`);

    if (!spreadsheetId || !userId) {
      // console.log(`[DEBUG] Missing required parameters - spreadsheetId: ${spreadsheetId}, userId: ${userId}`);
      this.logger.warn(`Missing required parameters - spreadsheetId: ${spreadsheetId}, userId: ${userId}`);
      return null;
    }

    // parsedSheetNames가 비어있는 경우 경고만 하고 계속 진행
    if (!parsedSheetNames || parsedSheetNames.length === 0) {
      // console.log(`[DEBUG] parsedSheetNames is empty, continuing anyway`);
      this.logger.warn(`parsedSheetNames is empty or null - will load all available sheets. parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);
    }

    try {
      this.logger.log(`Loading spreadsheet data from JSONB for id: ${spreadsheetId}, sheets: ${parsedSheetNames?.join(', ') || 'ALL'}, user: ${userId}`);

      // 1. 먼저 스프레드시트와 권한 확인
      const spreadSheet = await this.prisma.spreadSheet.findFirst({
        where: {
          id: spreadsheetId,
          userId: userId,
          status: 'ACTIVE'
        }
      });

      if (!spreadSheet) {
        this.logger.warn(`SpreadSheet not found or access denied - spreadsheetId: ${spreadsheetId}, userId: ${userId}`);
        return null;
      }

      // 2. 버전 ID 결정 (제공되지 않으면 헤드 버전 사용)
      const targetVersionId = spreadSheetVersionId || spreadSheet.headVersionId;

      if (!targetVersionId) {
        this.logger.warn(`No version available for spreadsheet: ${spreadsheetId}`);
        return null;
      }

      // 3. 해당 버전의 데이터 조회
      const spreadSheetVersionData = await this.prisma.spreadSheetVersionData.findUnique({
        where: {
          id: targetVersionId
        }
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

      // console.log(`[DEBUG] rawData keys after parsing:`, Object.keys(rawData));

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
        // console.log(`[DEBUG] Filtering sheets - requested: ${JSON.stringify(parsedSheetNames)}, available: ${JSON.stringify(availableSheets)}`);

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
    // console.log(`[DEBUG] parseNewVersionSpreadSheetData START - parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);
    this.logger.log(`parseNewVersionSpreadSheetData called with - parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);

    if (!newVersionSpreadSheetData) {
      // console.log(`[DEBUG] newVersionSpreadSheetData is null or undefined`);
      this.logger.warn(`newVersionSpreadSheetData is null or undefined`);
      return null;
    }

    // parsedSheetNames가 비어있는 경우 경고만 하고 계속 진행
    if (!parsedSheetNames || parsedSheetNames.length === 0) {
      // console.log(`[DEBUG] parsedSheetNames is empty, continuing anyway`);
      this.logger.warn(`parsedSheetNames is empty or null - will load all available sheets. parsedSheetNames: ${JSON.stringify(parsedSheetNames)}`);
    }

    try {
      this.logger.log(`Parsing new version spreadsheet data, sheets: ${parsedSheetNames?.join(', ') || 'ALL'}`);

      let rawData = newVersionSpreadSheetData;

      // 실제 데이터 구조에 따라 sheets 접근 경로 수정
      let fullData: Record<string, any>;
      let sheets: any;

      // console.log(`[DEBUG] rawData keys after parsing:`, Object.keys(rawData));

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
        // console.log(`[DEBUG] Filtering sheets - requested: ${JSON.stringify(parsedSheetNames)}, available: ${JSON.stringify(availableSheets)}`);

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
   * 사용자 메시지를 데이터베이스에 저장합니다 (새로운 3계층 구조)
   * @param aiReq - AI 채팅 요청 객체
   * @returns 저장된 메시지 ID
   */
  async saveUserMessage(aiReq: aiChatApiReq): Promise<string> {
    try {
      this.logger.log(`사용자 메시지 저장 시작 - chatId: ${aiReq.chatId}, userId: ${aiReq.userId}, userChatSessionBranchId: ${aiReq.userChatSessionBranchId}`);
      this.logger.log(`🔍 DEBUG: aiReq.spreadSheetVersionId = ${aiReq.spreadSheetVersionId} (type: ${typeof aiReq.spreadSheetVersionId})`);

      return await this.prisma.$transaction(async (tx) => {
        if (!aiReq.chatSessionId) {
          throw new Error('chatSessionId is required to save user message');
        }

        // 1. 세션 확인 또는 생성
        const { session } = await this.getOrCreateActiveBranch(aiReq.chatId, aiReq.chatSessionId, tx);

        // 2. 첫 번째 채팅인지 확인 (세션에 메시지가 있는지 확인)
        const existingMessages = await tx.message.findMany({
          where: {
            chatSessionBranch: {
              chatSessionId: session.id
            }
          }
        });

        let targetBranchId: string;

        if (existingMessages.length === 0) {
          // 첫 번째 채팅인 경우
          this.logger.log(`첫 번째 채팅 - 부모 노드 생성 후 자식 노드를 userChatSessionBranchId로 생성`);

          // 2-1. 부모 노드(node A) 생성
          this.logger.log(`🔍 DEBUG: 부모 브랜치 생성 - spreadSheetVersionId: ${aiReq.spreadSheetVersionId}, 조건: ${!!aiReq.spreadSheetVersionId}`);
          const parentBranch = await tx.chatSessionBranch.create({
            data: {
              chatSessionId: session.id,
              parentBranchId: null, // 루트 노드
              ...(aiReq.spreadSheetVersionId && { spreadSheetVersionId: aiReq.spreadSheetVersionId }) // 현재 스프레드시트 버전 저장
            }
          });
          this.logger.log(`🔍 DEBUG: 부모 브랜치 생성 완료 - id: ${parentBranch.id}, spreadSheetVersionId: ${(parentBranch as any).spreadSheetVersionId}`);

          // 2-2. 자식 노드(node B)를 userChatSessionBranchId로 생성
          this.logger.log(`🔍 DEBUG: 자식 브랜치 생성 - spreadSheetVersionId: ${aiReq.spreadSheetVersionId}, 조건: ${!!aiReq.spreadSheetVersionId}`);
          const childBranch = await tx.chatSessionBranch.create({
            data: {
              id: aiReq.userChatSessionBranchId, // 프론트에서 제공한 ID 사용
              chatSessionId: session.id,
              parentBranchId: parentBranch.id, // 부모 노드를 참조
              ...(aiReq.spreadSheetVersionId && { spreadSheetVersionId: aiReq.spreadSheetVersionId }) // 현재 스프레드시트 버전 저장
            }
          });
          this.logger.log(`🔍 DEBUG: 자식 브랜치 생성 완료 - id: ${childBranch.id}, spreadSheetVersionId: ${(childBranch as any).spreadSheetVersionId}`);

          targetBranchId = childBranch.id;

          // 2-3. 세션의 latestBranchId를 자식 노드로 업데이트
          await tx.chatSession.update({
            where: { id: session.id },
            data: { latestBranchId: childBranch.id }
          });

          this.logger.log(`첫 번째 채팅 브랜치 생성 완료 - parentId: ${parentBranch.id}, childId: ${childBranch.id}`);
        } else {
          // 첫 번째가 아닌 채팅인 경우
          this.logger.log(`후속 채팅 - userChatSessionBranchId를 브랜치 ID로 직접 사용`);

          // 기존 브랜치가 존재하는지 확인
          const existingBranch = await tx.chatSessionBranch.findUnique({
            where: { id: aiReq.userChatSessionBranchId }
          });

          if (!existingBranch) {
            // 브랜치가 없으면 새로 생성 (기존 로직과 동일하지만 ID 지정)
            const currentBranch = await tx.chatSessionBranch.findUnique({
              where: { id: session.latestBranchId }
            });

            if (!currentBranch) {
              throw new Error('Current branch not found');
            }

            this.logger.log(`🔍 DEBUG: 후속 브랜치 생성 - spreadSheetVersionId: ${aiReq.spreadSheetVersionId}, 조건: ${!!aiReq.spreadSheetVersionId}`);
            const newBranch = await tx.chatSessionBranch.create({
              data: {
                id: aiReq.userChatSessionBranchId, // 프론트에서 제공한 ID 사용
                chatSessionId: session.id,
                parentBranchId: currentBranch.id,
                ...(aiReq.spreadSheetVersionId && { spreadSheetVersionId: aiReq.spreadSheetVersionId }) // 현재 스프레드시트 버전 저장
              }
            });
            this.logger.log(`🔍 DEBUG: 후속 브랜치 생성 완료 - id: ${newBranch.id}, spreadSheetVersionId: ${(newBranch as any).spreadSheetVersionId}`);

            targetBranchId = newBranch.id;

            // 세션의 latestBranchId 업데이트
            await tx.chatSession.update({
              where: { id: session.id },
              data: { latestBranchId: newBranch.id }
            });

            this.logger.log(`후속 채팅 브랜치 생성 완료 - branchId: ${newBranch.id}`);
          } else {
            // 이미 존재하는 브랜치를 사용
            targetBranchId = existingBranch.id;
            this.logger.log(`기존 브랜치 사용 - branchId: ${existingBranch.id}`);
          }
        }

        // 3. 사용자 메시지 저장
        const message = await tx.message.create({
          data: {
            content: aiReq.userQuestionMessage,
            role: 'USER',
            type: 'TEXT',
            chatSessionBranchId: targetBranchId
          }
        });

        this.logger.log(`사용자 메시지 저장 완료 - messageId: ${message.id}, branchId: ${targetBranchId}, beforeSheetVersionId: ${aiReq.spreadSheetVersionId || 'none'}`);
        return message.id;
      });

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`사용자 메시지 저장 실패: ${safeError.message}`, safeError.details);
      throw new Error(`사용자 메시지 저장 실패: ${safeError.message}`);
    }
  }

  /**
   * AI(Assistant) 메시지를 데이터베이스에 저장합니다 (새로운 3계층 구조)
   * @param chatId - 채팅 ID
   * @param aiChatRes - AI 채팅 응답 객체 (전체)
   * @param spreadSheetVersionId - 프론트엔드에서 적용된 새 스프레드시트 버전 ID (선택적)
   *                             - null/undefined: 스프레드시트 변경 없음 또는 아직 적용 전
   *                             - string: 프론트에서 적용 완료된 새 버전 ID
   * @returns 저장된 메시지 ID
   */
  async saveAssistantMessage(
    chatId: string,
    chatSessionId: string,
    aiChatRes: aiChatApiRes,
    spreadSheetVersionId: string | null
  ): Promise<string> {
    try {
      this.logger.log(`AI 응답 메시지 저장 시작 - chatId: ${chatId}, jobId: ${aiChatRes.jobId}`);

      // aiChatApiRes 타입 검증
      if (!isAiChatApiRes(aiChatRes)) {
        throw new Error('유효하지 않은 aiChatApiRes 데이터입니다');
      }

      return await this.prisma.$transaction(async (tx) => {
        // 1. 프론트엔드에서 지정한 세션의 활성 브랜치 가져오기
        const { session, branch: currentBranch } = await this.getOrCreateActiveBranch(chatId, chatSessionId, tx);

        // 2. AI 응답을 위한 새로운 브랜치 생성 (기존 방식대로 항상 새 브랜치)
        const newBranch = await tx.chatSessionBranch.create({
          data: {
            chatSessionId: session.id,
            parentBranchId: currentBranch.id, // 현재 브랜치를 부모로 설정
            ...(spreadSheetVersionId && { spreadSheetVersionId }) // AI 처리 결과로 생성된 새 스프레드시트 버전 ID 저장 (조건부)
          }
        });

        // 3. AI 메시지 저장 (spreadSheetVersionId는 브랜치에 저장됨)
        const message = await tx.message.create({
          data: {
            content: aiChatRes.taskManagerOutput.reason, // 사용자 친화적 설명
            role: 'ASSISTANT',
            type: 'SUGGESTION',
            chatSessionBranchId: newBranch.id,
            aiChatRes: aiChatRes as unknown as any, // 타입 안전성을 위한 unknown을 통한 변환
          }
        });

        // 4. ChatSession의 latestBranchId 업데이트
        await tx.chatSession.update({
          where: { id: session.id },
          data: { latestBranchId: newBranch.id }
        });

        this.logger.log(`AI 응답 메시지 저장 완료 - messageId: ${message.id}, branchId: ${newBranch.id}, afterSheetVersionId: ${spreadSheetVersionId || 'none'}`);
        return message.id;
      });

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`AI 응답 메시지 저장 실패: ${safeError.message}`, safeError.details);
      throw new Error(`AI 응답 메시지 저장 실패: ${safeError.message}`);
    }
  }
  /**
   * 멀티턴 AI를 위해 최근 10개의 메시지를 불러옵니다 (새로운 3계층 구조)
   * @param chatId - 채팅 ID
   * @param chatSessionId - 채팅 세션 ID 
   * @returns 시간순으로 정렬된 ChatHistory 배열
   */
  async loadMultiturnMessages(chatId: string, chatSessionId: string): Promise<ChatHistory> {
    try {
      this.logger.log(`멀티턴 메시지 로드 시작 - chatId: ${chatId}`);

      // 🔥 올바른 브랜치 계보 추적으로 메시지 수집
      const messagesInOrder = await this.getMessagesFromActiveBranchLineage(chatId, chatSessionId);

      if (messagesInOrder.length === 0) {
        this.logger.log(`메시지를 찾을 수 없음 - chatId: ${chatId}`);
        return [];
      }

      // 타입에 맞게 변환
      const chatHistory: ChatHistory = messagesInOrder.map(message => {
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

  async loadUserAiChatHistory(chatId: string, userId: string, chatSessionId?: string): Promise<previousMessagesContent[] | null> {
    try {
      this.logger.log(`채팅 히스토리 로드 시작 - chatId: ${chatId}, userId: ${userId}`);

      // 1. Chat 존재 및 권한 확인
      const chat = await this.prisma.chat.findFirst({
        where: {
          id: chatId,
          userId: userId
        }
      });

      if (!chat) {
        this.logger.warn(`채팅을 찾을 수 없거나 권한이 없음 - chatId: ${chatId}, userId: ${userId}`);
        return null;
      }

      // 2. 🔥 올바른 브랜치 계보 추적으로 메시지 수집 (최대 50개)
      const messagesFromLineage = await this.getMessagesFromActiveBranchLineage(chatId, chatSessionId);

      if (messagesFromLineage.length === 0) {
        this.logger.log(`채팅 히스토리가 비어있음 - chatId: ${chatId}`);
        return [];
      }

      // USER와 ASSISTANT 메시지만 필터링하고 최대 50개로 제한
      const messages = messagesFromLineage
        .filter(msg => ['USER', 'ASSISTANT'].includes(msg.role))
        .slice(-50); // 최근 50개만

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

  async rollPreviousMessage(spreadSheetId: string, chatSessionId: string, chatSessionBranchId: string): Promise< {spreadSheetVersionId: string; lastestBranchID: string; editLockVersion: number; } > {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 현재 브랜치 조회
      const currentBranch = await tx.chatSessionBranch.findUnique({
        where: { id: chatSessionBranchId },
        select: {
          parentBranchId: true,
          chatSessionId: true
        }
      });

      if (!currentBranch) {
        throw new Error(`ChatSessionBranch with id ${chatSessionBranchId} not found`);
      }

      if (!currentBranch.parentBranchId) {
        throw new Error(`Cannot roll back: ChatSessionBranch ${chatSessionBranchId} has no parent branch`);
      }

      // 2. 부모 브랜치 조회
      const parentBranch = await tx.chatSessionBranch.findUnique({
        where: { id: currentBranch.parentBranchId },
        select: {
          id: true,
          spreadSheetVersionId: true
        }
      });

      if (!parentBranch) {
        throw new Error(`Parent branch with id ${currentBranch.parentBranchId} not found`);
      }

      // 3. ChatSession의 latestBranchId를 부모 브랜치로 업데이트
      await tx.chatSession.update({
        where: { id: chatSessionId },
        data: { latestBranchId: parentBranch.id }
      });

      // 4. SpreadSheet의 editLockVersion을 1 증가
      const updatedSpreadSheet = await tx.spreadSheet.update({
        where: { id: spreadSheetId },
        data: { editLockVersion: { increment: 1 } },
        select: { editLockVersion: true }
      });

      // 5. 부모 브랜치의 spreadSheetVersionId, latestBranchId, editLockVersion 반환
      return {
        spreadSheetVersionId: parentBranch.spreadSheetVersionId || "",
        lastestBranchID: parentBranch.id,
        editLockVersion: updatedSpreadSheet.editLockVersion
      };
    });
  } 





//=========== Private Methods ===========


  /**
   * 🔥 올바른 브랜치 계보 추적: 지정된 세션의 활성 브랜치에서 시작하여 부모 브랜치를 따라가며 메시지 수집
   * @param chatId - 채팅 ID
   * @param chatSessionId - 프론트엔드에서 지정한 채팅 세션 ID (선택적)
   * @returns 계보 순서대로 정렬된 메시지 배열
   */
  private async getMessagesFromActiveBranchLineage(chatId: string, chatSessionId?: string): Promise<any[]> {
    try {
      // 1. 세션 ID 결정: 프론트에서 지정했으면 그것을 사용, 아니면 최신 세션 사용
      let targetSessionId = chatSessionId;

      if (!targetSessionId) {
        const basicChat = await this.prisma.chat.findUnique({
          where: { id: chatId },
          select: { latestChatSessionId: true }
        });
        // latestChatSessionId may be string | null; convert null to undefined to match targetSessionId's type
        targetSessionId = basicChat?.latestChatSessionId ?? undefined;
      }

      if (!targetSessionId) {
        this.logger.log(`활성 채팅 세션이 없음 - chatId: ${chatId}, chatSessionId: ${chatSessionId}`);
        return [];
      }

      // 2. 지정된 세션과 브랜치 정보 조회
      const session = await this.prisma.chatSession.findFirst({
        where: {
          id: targetSessionId,
          chatId: chatId // 보안: 해당 chat에 속한 세션인지 확인
        },
        include: {
          branches: {
            include: {
              messages: {
                orderBy: { createdAt: 'asc' }
              }
            }
          }
        }
      });

      if (!session) {
        this.logger.log(`지정된 채팅 세션을 찾을 수 없음 - chatId: ${chatId}, sessionId: ${targetSessionId}`);
        return [];
      }

      if (!session.latestBranchId) {
        this.logger.log(`활성 브랜치가 없음 - chatId: ${chatId}, sessionId: ${session.id}`);
        return [];
      }

      // 3. 🔥 브랜치 계보 추적: latestBranchId부터 parentBranchId를 따라가며 수집
      const branchLineage: string[] = [];
      let currentBranchId: string | null = session.latestBranchId;

      while (currentBranchId) {
        branchLineage.unshift(currentBranchId); // 앞쪽에 추가하여 올바른 순서 유지

        // 현재 브랜치의 부모 찾기
        const currentBranch = session.branches.find(b => b.id === currentBranchId);
        currentBranchId = currentBranch?.parentBranchId || null;
      }

      this.logger.log(`브랜치 계보 추적 완료 - chatId: ${chatId}, sessionId: ${targetSessionId}, 브랜치 순서: ${branchLineage.join(' -> ')}`);

      // 4. 계보 순서대로 메시지 수집
      const orderedMessages: any[] = [];
      for (const branchId of branchLineage) {
        const branch = session.branches.find(b => b.id === branchId);
        if (branch) {
          orderedMessages.push(...branch.messages);
        }
      }

      // 4. 전체 메시지를 시간순으로 정렬하고 최근 10개만 반환
      return orderedMessages
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-10);

    } catch (error) {
      this.logger.error(`브랜치 계보 추적 실패 - chatId: ${chatId}: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * 프론트엔드에서 지정한 ChatSession을 사용하여 활성 브랜치를 가져오거나 생성합니다
   * @param chatId - 채팅 ID
   * @param chatSessionId - 프론트엔드에서 지정한 채팅 세션 ID
   * @returns 지정된 세션의 활성 브랜치 정보
   */
  private async getOrCreateActiveBranch(chatId: string, chatSessionId: string, tx: any): Promise<{
    chat: any;
    session: any;
    branch: any;
  }> {
    // 1. Chat 확인
    const chat = await tx.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    // 2. 🔥 프론트엔드에서 지정한 ChatSession 직접 사용
    let session: any = await tx.chatSession.findFirst({
      where: {
        id: chatSessionId,
        chatId: chatId // 보안: 해당 chat에 속한 세션인지 확인
      }
    });

    if (!session) {
      // 지정한 세션이 없으면 새로 생성
      session = await tx.chatSession.create({
        data: {
          id: chatSessionId, // 프론트엔드에서 제공한 ID 직접 사용
          chatId: chatId,
          name: '새 대화',
        }
      });

      // latestChatSessionId도 업데이트
      await tx.chat.update({
        where: { id: chatId },
        data: { latestChatSessionId: session.id }
      });

      this.logger.log(`새 ChatSession 생성됨 (프론트 지정 ID) - sessionId: ${session.id}`);
    }

    // 3. 현재 활성 ChatSessionBranch 확인 또는 생성
    let branch: any = null;
    if (session.latestBranchId) {
      branch = await tx.chatSessionBranch.findUnique({
        where: { id: session.latestBranchId }
      });
    }

    if (!branch) {
      branch = await tx.chatSessionBranch.create({
        data: {
          chatSessionId: session.id,
          parentBranchId: null
          // 초기 브랜치는 스프레드시트 버전 정보 없음 (getOrCreateActiveBranch에서는 aiReq가 없음)
        }
      });

      await tx.chatSession.update({
        where: { id: session.id },
        data: { latestBranchId: branch.id }
      });

      this.logger.log(`새 ChatSessionBranch 생성됨 - branchId: ${branch.id}`);
    }

    return { chat, session, branch };
  }
}


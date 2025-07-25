// src/v2/chatting/_main-chat/main-chat.service.ts

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MainAiService } from '../../ai/_main-ai-service/main-ai.service';
import { TableDataCacheService } from '../../cache/_table-data-cache/table-data-cache.service';
import { 
  MainChatRequestDto 
} from './dto/main-chat-req.dto';
import { 
  ChatResponseDto, 
  ChatIntentType,
  ExcelFormulaResponseDto,
  PythonCodeGeneratorResponseDto,
  WholeDataResponseDto,
  GeneralHelpResponseDto
} from './dto/main-chat-res.dto';
import { 
  BaseAiRequestResult,
  ExcelFormulaResult,
  PythonCodeGeneratorResult,
  WholeDataResult,
  GeneralHelpResult
} from '../../ai/_types/ai-request-result.types';
import { StreamUpdate } from '../../ai/_types/chain.types';
import { SpreadSheetStructure, createSafeError } from '../../sheet/types/spreadsheet.types';
import { Subject, Observable } from 'rxjs';
import { MessageRole, MessageType, ChatStatus } from '@prisma/client';

@Injectable()
export class MainChatService {
  private readonly logger = new Logger(MainChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mainAiService: MainAiService,
    private readonly cacheService: TableDataCacheService,
  ) {}

  /**
   * SSE 스트리밍 채팅 처리 - 메인 엔드포인트
   */
  async streamChat(
    request: MainChatRequestDto,
  ): Promise<Observable<string>> {
    const subject = new Subject<string>();
    
    try {
      this.logger.log(
        `Starting SSE chat stream for user: ${request.userId}, ` +
        `chatId: ${request.chatId || 'new'}, ` +
        `message: "${request.chatInputMessage.substring(0, 50)}..."`
      );

      // 1. 채팅 및 사용자 메시지 생성/저장
      const { chat, userMessage } = await this.createChatAndUserMessage(request, request.userId);

      // SSE 연결 시작 이벤트
      this.sendSSEEvent(subject, 'chat_started', {
        chatId: chat.id,
        messageId: userMessage.id,
        timestamp: new Date().toISOString()
      });

      // 2. 스프레드시트 데이터 로드 (있는 경우)
      const spreadsheetData = await this.loadSpreadsheetData(request.spreadsheetId, request.userId);

      // 3. AI 스트리밍 처리 시작
      this.processAIStreaming(
        chat.id,
        userMessage.id,
        request.chatInputMessage,
        spreadsheetData,
        request.userId,
        subject
      );

      return subject.asObservable();

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to start chat stream: ${safeError.message}`, safeError.details);
      
      this.sendSSEEvent(subject, 'error', {
        error: safeError.message,
        timestamp: new Date().toISOString()
      });
      
      subject.complete();
      return subject.asObservable();
    }
  }

  /**
   * 기존 채팅 기록 조회
   */
  async getChatHistory(
    chatId: string,
    userId: string,
    limit: number = 50,
    offset: number = 0
  ) {
    try {
      // 채팅 소유권 확인
      const chat = await this.prisma.chat.findFirst({
        where: {
          id: chatId,
          userId,
          status: ChatStatus.ACTIVE
        }
      });

      if (!chat) {
        throw new NotFoundException('Chat not found or access denied');
      }

      // 메시지 조회
      const messages = await this.prisma.message.findMany({
        where: {
          chatId
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: limit,
        skip: offset,
        select: {
          id: true,
          content: true,
          role: true,
          type: true,
          createdAt: true,
          metadata: true,
          sheetContext: true
        }
      });

      return {
        chatId,
        title: chat.title,
        messageCount: chat.messageCount,
        messages,
        hasMore: messages.length === limit
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to get chat history: ${safeError.message}`, safeError.details);
      throw new BadRequestException(safeError.message);
    }
  }

  /**
   * 사용자 채팅 목록 조회
   */
  async getUserChats(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ) {
    try {
      const chats = await this.prisma.chat.findMany({
        where: {
          userId,
          status: ChatStatus.ACTIVE
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: limit,
        skip: offset,
        select: {
          id: true,
          title: true,
          messageCount: true,
          createdAt: true,
          updatedAt: true,
          spreadSheetId: true,
          spreadSheet: {
            select: {
              fileName: true
            }
          }
        }
      });

      return {
        chats,
        hasMore: chats.length === limit
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to get user chats: ${safeError.message}`, safeError.details);
      throw new BadRequestException(safeError.message);
    }
  }

  // ==============================================================
  // Private Helper Methods
  // ==============================================================

  /**
   * 채팅 및 사용자 메시지 생성/저장
   */
  private async createChatAndUserMessage(
    request: MainChatRequestDto,
    userId: string
  ) {
    return await this.prisma.$transaction(async (tx) => {
      // 채팅 생성 또는 조회
      let chat: any;
      if (request.chatId) {
        // 기존 채팅 조회
        chat = await tx.chat.findFirst({
          where: {
            id: request.chatId,
            userId,
            status: ChatStatus.ACTIVE
          }
        });
        
        if (!chat) {
          throw new NotFoundException('Chat not found or access denied');
        }
      } else {
        // 새 채팅 생성
        const title = this.generateChatTitle(request.chatInputMessage);
        chat = await tx.chat.create({
          data: {
            title,
            userId,
            spreadSheetId: request.spreadsheetId || null,
            messageCount: 0,
            status: ChatStatus.ACTIVE
          }
        });
      }
      
      // 사용자 메시지 저장
      const userMessage = await tx.message.create({
        data: {
          content: request.chatInputMessage,
          role: MessageRole.USER,
          type: MessageType.TEXT,
          chatId: chat.id,
          metadata: {
            sheetContext: request.spreadsheetId ? {
              spreadsheetId: request.spreadsheetId,
              timestamp: request.timestamp
            } : null
          },
          createdAt: new Date(request.timestamp),
        }
      });

      // 채팅 메시지 카운트 업데이트
      await tx.chat.update({
        where: { id: chat.id },
        data: {
          messageCount: { increment: 1 },
          updatedAt: new Date()
        }
      });

      return { chat, userMessage };
    });
  }

  /**
   * 스프레드시트 데이터 로드
   */
  private async loadSpreadsheetData(
    spreadsheetId?: string,
    userId?: string
  ): Promise<SpreadSheetStructure | null> {
    if (!spreadsheetId || !userId) {
      return null;
    }

    try {
      // 스프레드시트 접근 권한 확인
      const spreadsheet = await this.prisma.spreadSheet.findFirst({
        where: {
          id: spreadsheetId,
          userId
        },
        include: {
          data: true
        }
      });

      if (!spreadsheet?.data) {
        this.logger.warn(`Spreadsheet not found or no data: ${spreadsheetId}`);
        return null;
      }

      // 캐시에서 구조화된 데이터 조회
      const cachedData = await this.cacheService.getGPTReadyData(
        userId,
        {
          version: '1.0',
          sheets: {},
          id: spreadsheet.id,
          fileName: spreadsheet.fileName
        } as SpreadSheetStructure,
        {
          includeFormulas: true,
          includeStyles: false,
          maxSheets: 5
        }
      );

      // cachedData.data가 있으면 SpreadSheetStructure 형식으로 변환
      if (cachedData.data && typeof cachedData.data === 'object') {
        // GPTReadyData의 Map을 객체로 변환
        const sheetsObj: { [sheetName: string]: any } = {};
        if (cachedData.data.sheets instanceof Map) {
          for (const [sheetName, sheetData] of cachedData.data.sheets.entries()) {
            sheetsObj[sheetName] = sheetData;
          }
        }

        return {
          version: '1.0', // 기본 버전
          sheets: sheetsObj,
          id: spreadsheet.id,
          fileName: spreadsheet.fileName,
          totalCells: cachedData.data.totalCells,
          dataHash: cachedData.data.dataHash,
          parsedAt: cachedData.data.parsedAt
        } as SpreadSheetStructure;
      }
      
      return null;

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to load spreadsheet data: ${safeError.message}`, safeError.details);
      return null;
    }
  }

  /**
   * AI 스트리밍 처리 (비동기)
   */
  private async processAIStreaming(
    chatId: string,
    userMessageId: string,
    question: string,
    spreadsheetData: SpreadSheetStructure | null,
    userId: string,
    subject: Subject<string>
  ): Promise<void> {

    try {
      // AI 처리 시작 이벤트
      this.sendSSEEvent(subject, 'ai_processing_started', {
        chatId,
        userMessageId,
        timestamp: new Date().toISOString()
      });

      // 기본 스프레드시트 구조 (없으면 빈 구조체)
      const finalSpreadsheetData: SpreadSheetStructure = spreadsheetData || {
        version: '1.0',
        sheets: {},
        id: 'temp',
        fileName: 'no-file'
      };

      // AI 스트리밍 실행
      await this.mainAiService.realtimeSpreadSheetAiAgent(
        userId,
        finalSpreadsheetData,
        question,
        (update: StreamUpdate) => {
          // 실시간 AI 처리 상태 전송
          this.sendSSEEvent(subject, 'ai_update', {
            chatId,
            userMessageId,
            step: update.step,
            progress: update.progress,
            timestamp: new Date().toISOString(),
            updateType: update.type
          });
        },
        async (result: BaseAiRequestResult) => {
          // AI 처리 완료 - 응답 저장 및 전송
          try {
            const assistantMessage = await this.saveAssistantMessage(
              chatId,
              result,
              spreadsheetData ? { spreadsheetId: spreadsheetData.id } : null
            );
            // assistantMessageId 저장은 필요시 사용

            // 타입별 응답 생성
            const typedResponse = this.createTypedResponse(result, chatId, assistantMessage.id);

            // 최종 응답 전송
            this.sendSSEEvent(subject, 'chat_response', typedResponse);
            this.sendSSEEvent(subject, 'chat_completed', {
              chatId,
              assistantMessageId: assistantMessage.id,
              timestamp: new Date().toISOString()
            });

          } catch (saveError) {
            const safeError = createSafeError(saveError);
            this.logger.error(`Failed to save assistant message: ${safeError.message}`, safeError.details);
            
            this.sendSSEEvent(subject, 'error', {
              error: 'Failed to save AI response',
              details: safeError.message,
              timestamp: new Date().toISOString()
            });
          }

          subject.complete();
        },
        (error: string) => {
          // AI 처리 에러
          this.logger.error(`AI processing failed: ${error}`);
          
          this.sendSSEEvent(subject, 'error', {
            error: 'AI processing failed',
            details: error,
            timestamp: new Date().toISOString()
          });

          subject.complete();
        }
      );

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`AI streaming failed: ${safeError.message}`, safeError.details);
      
      this.sendSSEEvent(subject, 'error', {
        error: 'AI streaming failed',
        details: safeError.message,
        timestamp: new Date().toISOString()
      });

      subject.complete();
    }
  }

  /**
   * AI 응답 메시지 저장
   */
  private async saveAssistantMessage(
    chatId: string,
    aiResult: BaseAiRequestResult,
    sheetContext: any = null
  ) {
    return await this.prisma.$transaction(async (tx) => {
      // AI 응답 메시지 저장
      const assistantMessage = await tx.message.create({
        data: {
          content: this.extractContentFromAIResult(aiResult),
          role: MessageRole.ASSISTANT,
          type: MessageType.ANALYSIS,
          chatId,
          metadata: {
            tokensUsed: aiResult.tokensUsed,
            responseTime: aiResult.responseTime,
            model: aiResult.model,
            cached: aiResult.cached,
            confidence: aiResult.confidence,
            success: aiResult.success
          },
          sheetContext
        }
      });

      // 채팅 메시지 카운트 업데이트
      await tx.chat.update({
        where: { id: chatId },
        data: {
          messageCount: { increment: 1 },
          updatedAt: new Date()
        }
      });

      return assistantMessage;
    });
  }

  /**
   * AI 결과에서 타입별 응답 생성
   */
  private createTypedResponse(
    aiResult: BaseAiRequestResult,
    chatId: string,
    _messageId: string
  ): ChatResponseDto {
    const baseResponse = {
      chatId,
      timestamp: new Date().toISOString(),
      message: this.extractContentFromAIResult(aiResult)
    };

    // 타입별 응답 생성
    if ('formulaDetails' in aiResult) {
      const result = aiResult as ExcelFormulaResult;
      return {
        ...baseResponse,
        intent: ChatIntentType.EXCEL_FORMULA,
        formulaDetails: {
          name: result.formulaDetails.name,
          description: result.formulaDetails.description,
          syntax: result.formulaDetails.syntax,
          parameters: result.formulaDetails.parameters,
          examples: [] // DTO에 맞게 추가 필요시
        }
      } as ExcelFormulaResponseDto;
    }
    
    if ('codeGenerator' in aiResult) {
      const result = aiResult as PythonCodeGeneratorResult;
      return {
        ...baseResponse,
        intent: ChatIntentType.PYTHON_CODE_GENERATOR,
        codeGenerator: {
          pythonCode: result.codeGenerator.pythonCode,
          explanation: result.codeGenerator.explanation,
          importedLibraries: [] // AI 응답에서 추출 필요
        }
      } as PythonCodeGeneratorResponseDto;
    }
    
    if ('dataTransformation' in aiResult) {
      const transformResult = aiResult as WholeDataResult;
      return {
        ...baseResponse,
        intent: ChatIntentType.WHOLE_DATA,
        dataTransformation: {
          transformationMethod: 'AI-powered data transformation',
          processingSteps: transformResult.dataTransformation.transformedJsonData,
          validationMethod: 'Schema validation'
        }
      } as WholeDataResponseDto;
    }
    
    if ('generalHelp' in aiResult) {
      const result = aiResult as GeneralHelpResult;
      return {
        ...baseResponse,
        intent: ChatIntentType.GENERAL_HELP,
        generalHelp: {
          directAnswer: result.generalHelp.directAnswer,
          additionalResources: result.generalHelp.additionalResources
        }
      } as GeneralHelpResponseDto;
    }

    // 기본 응답 - GeneralHelpResponseDto로 폴백
    return {
      ...baseResponse,
      intent: ChatIntentType.GENERAL_HELP,
      generalHelp: {
        directAnswer: this.extractContentFromAIResult(aiResult),
        additionalResources: []
      }
    } as GeneralHelpResponseDto;
  }

  /**
   * AI 결과에서 텍스트 내용 추출
   */
  private extractContentFromAIResult(aiResult: BaseAiRequestResult): string {
    if ('formulaDetails' in aiResult) {
      const result = aiResult as ExcelFormulaResult;
      return `**${result.formulaDetails.name}**\n\n${result.formulaDetails.description}\n\n**Syntax:** ${result.formulaDetails.syntax}`;
    }
    
    if ('codeGenerator' in aiResult) {
      const result = aiResult as PythonCodeGeneratorResult;
      return `**Python Code Generated:**\n\n\`\`\`python\n${result.codeGenerator.pythonCode}\n\`\`\`\n\n**Explanation:**\n${result.codeGenerator.explanation}`;
    }
    
    if ('dataTransformation' in aiResult) {
      return `**Data Transformation Complete**\n\nThe spreadsheet data has been transformed according to your request.`;
    }
    
    if ('generalHelp' in aiResult) {
      const result = aiResult as GeneralHelpResult;
      return result.generalHelp.directAnswer;
    }

    return 'AI processing completed successfully.';
  }

  /**
   * SSE 이벤트 전송
   */
  private sendSSEEvent(subject: Subject<string>, event: string, data: any): void {
    const sseData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    subject.next(sseData);
  }

  /**
   * 채팅 제목 생성
   */
  private generateChatTitle(message: string): string {
    const maxLength = 50;
    if (message.length <= maxLength) {
      return message;
    }
    return message.substring(0, maxLength).trim() + '...';
  }
}

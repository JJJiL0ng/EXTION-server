// src/v2/chatting/_main-chat/main-chat.service.ts

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MainAiService } from '../../ai/_main-ai-service/main-ai.service';
import { TableDataJsonSaveService } from '../../sheet/_table-data-json-save/table-data-json-save.service';
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
import { Observable } from 'rxjs';
import { MessageRole, MessageType, ChatStatus } from '@prisma/client';

@Injectable()
export class MainChatService {
  private readonly logger = new Logger(MainChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mainAiService: MainAiService,
    private readonly tableDataService: TableDataJsonSaveService,
  ) {}

  /**
   * SSE 스트리밍 채팅 처리 - 메인 엔드포인트
   */
  streamChat(
    request: MainChatRequestDto,
  ): Observable<string> {
    return new Observable(observer => {
      const processRequest = async () => {
        try {
          // userId 검증 추가
          if (!request.userId) {
            throw new BadRequestException('userId is required');
          }

          this.logger.log(
            `Starting SSE chat stream for user: ${request.userId}, ` +
            `chatId: ${request.chatId || 'new'}, ` +
            `message: "${request.chatInputMessage.substring(0, 50)}..."`
          );

          const { chat, userMessage } = await this.createChatAndUserMessage(request, request.userId);

          this.sendSSEEvent(observer, 'chat_started', {
            chatId: chat.id,
            messageId: userMessage.id,
            timestamp: new Date().toISOString()
          });

          const spreadsheetData = await this.loadParsedSpreadsheetData(request.spreadsheetId, request.parsedSheetNames, request.userId);

          // 이 함수가 완전히 끝날 때까지 기다립니다.
          await this.processAIStreaming(
            chat.id,
            userMessage.id,
            request.chatInputMessage,
            spreadsheetData,
            request.userId,
            observer
          );

        } catch (error) {
          const safeError = createSafeError(error);
          this.logger.error(`Failed to start chat stream: ${safeError.message}`, safeError.details);
          
          this.sendSSEEvent(observer, 'error', {
            error: safeError.message,
            timestamp: new Date().toISOString()
          });
          
          observer.complete();
        }
      };

      processRequest();

      return () => {
        this.logger.log(`Client disconnected from chat stream for user: ${request.userId}`);
      };
    });
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
      let chat: any;
      if (request.chatId) {
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
   * 파싱된 스프레드시트 데이터 로드 (JSONB 기반)
   */
  private async loadParsedSpreadsheetData(
    spreadsheetId?: string,
    parsedSheetNames?: string[],
    userId?: string
  ): Promise<SpreadSheetStructure | null> {
    if (!spreadsheetId || !parsedSheetNames || parsedSheetNames.length === 0 || !userId) {
      this.logger.log(`Missing parameters for spreadsheet loading - spreadsheetId: ${spreadsheetId}, parsedSheetNames: ${parsedSheetNames?.length || 0}, userId: ${userId}`);
      return null;
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
        return null;
      }

      const fullData = (spreadSheetData as any).data as SpreadSheetStructure;
      
      if (!fullData.sheets) {
        this.logger.warn(`No sheets found in JSONB data for spreadsheet: ${spreadsheetId}`);
        return null;
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
        return null;
      }

      // 전체 스프레드시트 데이터를 그대로 반환 (렌더링을 위해)
      this.logger.log(`Successfully loaded full spreadsheet data with ${availableSheets.length} total sheets (${foundSheetCount}/${parsedSheetNames.length} requested sheets found): ${availableSheets.join(', ')}`);
      
      return fullData;

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to load parsed spreadsheet data: ${safeError.message}`, safeError.details);
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
    observer: { next: (value: string) => void; complete: () => void; }
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        this.sendSSEEvent(observer, 'ai_processing_started', {
          chatId,
          userMessageId,
          timestamp: new Date().toISOString()
        });

        const finalSpreadsheetData: SpreadSheetStructure = spreadsheetData || {
          version: '1.0',
          sheets: {},
          id: 'temp',
          fileName: 'no-file'
        };

        this.mainAiService.realtimeSpreadSheetAiAgent(
          userId,
          finalSpreadsheetData,
          question,
          (update: StreamUpdate) => {
            // 토큰 스트리밍 업데이트 처리
            if (update.type === 'token_stream') {
              this.sendSSEEvent(observer, 'ai_token', {
                chatId, userMessageId,
                token: update.token,
                partialResponse: update.partialResponse,
                tokenCount: update.tokenCount,
                isFinal: update.isFinal,
                timestamp: new Date().toISOString()
              });
            } else if (update.type === 'reasoning_preview') {
              // reasoning 텍스트 미리보기 전송
              this.sendSSEEvent(observer, 'reasoning_preview', {
                chatId, userMessageId,
                reasoning: update.reasoning,
                step: update.step,
                timestamp: new Date().toISOString()
              });
            } else if (update.type === 'step_start') {
              this.sendSSEEvent(observer, 'ai_step_start', {
                chatId, userMessageId, step: update.step,
                timestamp: new Date().toISOString()
              });
            } else if (update.type === 'step_complete') {
              this.sendSSEEvent(observer, 'ai_step_complete', {
                chatId, userMessageId, step: update.step,
                timestamp: new Date().toISOString()
              });
            } else {
              // 기존 업데이트 처리 (하위 호환성)
              this.sendSSEEvent(observer, 'ai_update', {
                chatId, userMessageId, step: update.step,
                timestamp: new Date().toISOString(), updateType: update.type
              });
            }
          },
          async (result: BaseAiRequestResult) => {
            try {
              const assistantMessage = await this.saveAssistantMessage(
                chatId, result, spreadsheetData ? { spreadsheetId: spreadsheetData.id } : null
              );
              const typedResponse = this.createTypedResponse(result, chatId, assistantMessage.id);

              this.sendSSEEvent(observer, 'chat_response', typedResponse);
              this.sendSSEEvent(observer, 'chat_completed', {
                chatId, assistantMessageId: assistantMessage.id, timestamp: new Date().toISOString()
              });

              observer.complete();
              resolve();
            } catch (saveError) {
              const safeError = createSafeError(saveError);
              this.logger.error(`Failed to save assistant message: ${safeError.message}`, safeError.details);
              this.sendSSEEvent(observer, 'error', {
                error: 'Failed to save AI response', details: safeError.message, timestamp: new Date().toISOString()
              });
              observer.complete();
              reject(saveError);
            }
          },
          (error: string) => {
            this.logger.error(`AI processing failed: ${error}`);
            this.sendSSEEvent(observer, 'error', {
              error: 'AI processing failed', details: error, timestamp: new Date().toISOString()
            });
            observer.complete();
            reject(new Error(error));
          }
        );

      } catch (error) {
        const safeError = createSafeError(error);
        this.logger.error(`AI streaming failed: ${safeError.message}`, safeError.details);
        this.sendSSEEvent(observer, 'error', {
          error: 'AI streaming failed', details: safeError.message, timestamp: new Date().toISOString()
        });
        observer.complete();
        reject(error);
      }
    });
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
      const assistantMessage = await tx.message.create({
        data: {
          content: this.extractContentFromAIResult(aiResult),
          role: MessageRole.ASSISTANT,
          type: MessageType.ANALYSIS,
          chatId,
          metadata: {
            model: aiResult.model,
            success: aiResult.success
          },
          sheetContext
        }
      });

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
   * AI 결과를 원본 형식 그대로 반환 (채팅 래퍼 없이)
   */
  private createTypedResponse(
    aiResult: BaseAiRequestResult,
    chatId: string,
    _messageId: string
  ): any {
    // 원본 AI 응답을 그대로 반환하되, 채팅 메타데이터만 추가
    return {
      ...aiResult,
      // 채팅 컨텍스트를 위한 최소한의 메타데이터만 추가
      chatId,
      timestamp: new Date().toISOString()
    };
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
    
    if ('answerAfterReadWholeData' in aiResult) {
      const result = aiResult as WholeDataResult;
      return result.answerAfterReadWholeData.response;
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
  private sendSSEEvent(
    observer: { next: (value: string) => void; }, 
    event: string, 
    data: any
  ): void {
    const sseData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    observer.next(sseData);
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
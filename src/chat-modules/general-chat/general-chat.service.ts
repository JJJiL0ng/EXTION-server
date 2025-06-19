import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { PromptService, ChatType, PromptData } from '../prompts/prompt/prompt.service';
import { ChatDatabaseService, ChatListItem, ChatMessage, AnthropicMessage } from '../chat-database/chat-database.service';
import { MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';
import { v4 as uuidv4 } from 'uuid';

export interface GeneralChatRequest {
  userInput: string;
  userId: string;
  chatId?: string;
  chatTitle?: string;
  spreadsheetData?: any;
  language?: string;
  messageId?: string;
  spreadsheetId?: string;
}

export interface GeneralChatResponse {
  success: boolean;
  message: string;
  chatId: string;
  userMessageId: string;
  aiMessageId: string;
  timestamp: string;
  spreadsheetMetadata?: any;
  error?: string;
}

@Injectable()
export class GeneralChatService {
  private readonly logger = new Logger(GeneralChatService.name);
  private readonly anthropic: Anthropic;

  constructor(
    private configService: ConfigService,
    private prismaService: PrismaService,
    private promptService: PromptService,
    private chatDatabaseService: ChatDatabaseService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get('CLAUDE_API_KEY'),
    });
  }

  async processGeneralChat(request: GeneralChatRequest): Promise<GeneralChatResponse> {
    this.logger.log('==================== General Chat 처리 시작 ====================');
    this.logger.log(`사용자 입력: ${request.userInput}`);
    this.logger.log(`사용자 ID: ${request.userId}`);

    try {
      // 1. 채팅방 생성 또는 가져오기
      const chatId = await this.ensureChatExists(request);

      // 2. 사용자 메시지 저장
      const userMessageId = await this.saveUserMessage(chatId, request);

      // 3. 스프레드시트 데이터 처리
      const { processedSpreadsheetData, spreadsheetMetadata } = await this.processSpreadsheetData(
        request.spreadsheetData,
        request.spreadsheetId
      );

      // 4. 프롬프트 데이터 생성
      const promptData = this.createPromptData(request, processedSpreadsheetData, spreadsheetMetadata);

      // 5. AI 프롬프트 생성
      const prompts = this.promptService.generatePrompts(ChatType.GENERAL_CHAT, promptData);

      // 6. AI 응답 생성
      const aiResponse = await this.generateAIResponse(
        prompts.systemPrompt,
        prompts.userPrompt,
        chatId,
        prompts.temperature,
        prompts.maxTokens
      );

      // 7. AI 응답 저장
      const aiMessageId = await this.saveAIMessage(chatId, aiResponse);

      // 8. 채팅 메타데이터 업데이트
      await this.updateChatMetadata(chatId);

      this.logger.log('==================== General Chat 처리 완료 ====================');

      return {
        success: true,
        message: aiResponse,
        chatId,
        userMessageId,
        aiMessageId,
        timestamp: new Date().toISOString(),
        spreadsheetMetadata,
      };

    } catch (error) {
      this.logger.error('General Chat 처리 중 오류 발생:', error);
      throw new InternalServerErrorException(`General Chat 처리 실패: ${error.message}`);
    }
  }

  /**
   * 채팅방 생성 또는 기존 채팅방 가져오기
   */
  private async ensureChatExists(request: GeneralChatRequest): Promise<string> {
    if (request.chatId) {
      // 기존 채팅방 검증
      const existingChat = await this.prismaService.chat.findUnique({
        where: { id: request.chatId },
      });

      if (existingChat && existingChat.userId === request.userId) {
        this.logger.log(`기존 채팅방 사용: ${request.chatId}`);
        return request.chatId;
      } else {
        this.logger.warn(`유효하지 않은 채팅방 ID: ${request.chatId}`);
        // 새 채팅방 생성으로 fallback
      }
    }

    // 새 채팅방 생성
    const newChat = await this.prismaService.chat.create({
      data: {
        title: request.chatTitle || `일반 채팅 ${new Date().toLocaleDateString()}`,
        userId: request.userId,
        sheetMetaDataId: request.spreadsheetId || null,
        status: 'ACTIVE',
        messageCount: 0,
      },
    });

    this.logger.log(`새 채팅방 생성: ${newChat.id}`);
    return newChat.id;
  }

  /**
   * 사용자 메시지 저장
   */
  private async saveUserMessage(chatId: string, request: GeneralChatRequest): Promise<string> {
    const userMessage = await this.prismaService.message.create({
      data: {
        content: request.userInput,
        role: 'USER' as any,
        type: 'TEXT' as any,
        mode: 'NORMAL' as any,
        chatId,
        sheetContext: request.spreadsheetData ? {
          hasData: !!request.spreadsheetData,
          spreadsheetId: request.spreadsheetId,
          fileName: request.spreadsheetData?.fileName,
          activeSheetIndex: request.spreadsheetData?.activeSheetIndex,
        } : undefined,
      },
    });

    this.logger.log(`사용자 메시지 저장: ${userMessage.id}`);
    return userMessage.id;
  }

  /**
   * AI 응답 저장
   */
  private async saveAIMessage(chatId: string, content: string): Promise<string> {
    const aiMessage = await this.prismaService.message.create({
      data: {
        content,
        role: 'EXTION_AI' as any,
        type: 'TEXT' as any,
        mode: 'NORMAL' as any,
        chatId,
      },
    });

    this.logger.log(`AI 응답 메시지 저장: ${aiMessage.id}`);
    return aiMessage.id;
  }

  /**
   * 스프레드시트 데이터 처리
   */
  private async processSpreadsheetData(spreadsheetData: any, spreadsheetId?: string) {
    if (!spreadsheetData && !spreadsheetId) {
      return {
        processedSpreadsheetData: null,
        spreadsheetMetadata: null,
      };
    }

    let processedData: any = null;
    let metadata: any = null;

    if (spreadsheetId) {
      // 데이터베이스에서 스프레드시트 메타데이터 가져오기
      const sheetMetaData = await this.prismaService.sheetMetaData.findUnique({
        where: { id: spreadsheetId },
        include: {
          sheetTableData: {
            orderBy: { index: 'asc' },
          },
        },
      });

      if (sheetMetaData) {
        metadata = {
          fileName: sheetMetaData.fileName,
          totalSheets: sheetMetaData.sheetTableData.length,
          activeSheetIndex: sheetMetaData.activeSheetIndex,
          sheetNames: sheetMetaData.sheetTableData.map(sheet => sheet.name),
        };

        // 활성 시트 데이터 가져오기
        const activeSheet = sheetMetaData.sheetTableData[sheetMetaData.activeSheetIndex];
        if (activeSheet) {
          processedData = {
            activeSheet: activeSheet.data,
            sheetName: activeSheet.name,
          };
        }
      }
    } else if (spreadsheetData) {
      // 직접 전달된 스프레드시트 데이터 사용
      processedData = spreadsheetData;
      metadata = {
        fileName: spreadsheetData.fileName,
        totalSheets: spreadsheetData.sheets?.length || 1,
        activeSheetIndex: spreadsheetData.activeSheetIndex || 0,
        sheetNames: spreadsheetData.sheets?.map(sheet => sheet.sheetName) || ['Sheet1'],
      };
    }

    return {
      processedSpreadsheetData: processedData,
      spreadsheetMetadata: metadata,
    };
  }

  /**
   * 프롬프트 데이터 생성
   */
  private createPromptData(
    request: GeneralChatRequest,
    spreadsheetData: any,
    spreadsheetMetadata: any
  ): PromptData {
    const hasData = !!spreadsheetData;
    
    // 스프레드시트 데이터가 있는 경우 처리
    let headers = '';
    let actualData = '';
    let rowCount = 0;
    let columnCount = 0;

    if (hasData && spreadsheetData?.activeSheet) {
      const sheetData = Array.isArray(spreadsheetData.activeSheet) 
        ? spreadsheetData.activeSheet 
        : [];
      
      if (sheetData.length > 0) {
        headers = Array.isArray(sheetData[0]) ? sheetData[0].join(', ') : '';
        rowCount = sheetData.length;
        columnCount = Array.isArray(sheetData[0]) ? sheetData[0].length : 0;
        
        // 실제 데이터를 텍스트 형태로 변환 (처음 50행까지만)
        const limitedData = sheetData.slice(0, 50);
        actualData = limitedData.map(row => 
          Array.isArray(row) ? row.join(',') : row
        ).join('\n');
      }
    }

    return {
      user_input: request.userInput,
      has_data: hasData,
      spreadsheet_name: spreadsheetMetadata?.fileName || '',
      sheet_name: spreadsheetData?.sheetName || spreadsheetMetadata?.sheetNames?.[0] || '',
      headers,
      row_count: rowCount,
      column_count: columnCount,
      actual_data: actualData,
      sheet_count: spreadsheetMetadata?.totalSheets > 1 ? spreadsheetMetadata.totalSheets : undefined,
    };
  }

  /**
   * AI 응답 생성
   */
  private async generateAIResponse(
    systemPrompt: string,
    userPrompt: string,
    chatId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<string> {
    this.logger.log('==================== AI 응답 생성 시작 ====================');
    
    // 이전 대화 기록 가져오기
    const historyMessages = await this.chatDatabaseService.getChatHistory(chatId);
    this.logger.log(`가져온 대화 기록: ${historyMessages.length}개`);

    // 프롬프트 크기 체크
    const totalPromptSize = systemPrompt.length + userPrompt.length;
    this.logger.log(`총 프롬프트 크기: ${totalPromptSize} 문자`);

    if (totalPromptSize > 100000) {
      this.logger.warn(`프롬프트 크기가 큽니다: ${totalPromptSize} 문자. 응답이 제한될 수 있습니다.`);
    }

    try {
      const completion = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        system: systemPrompt,
        messages: [
          ...historyMessages,
          { role: 'user', content: userPrompt }
        ],
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 4096,
      });

      const firstBlock = completion.content[0];
      const aiResponse = firstBlock?.type === 'text' ? firstBlock.text : null;

      if (!aiResponse) {
        throw new InternalServerErrorException('AI 응답을 받을 수 없습니다.');
      }

      this.logger.log(`AI 응답 생성 완료: ${aiResponse.length}자`);
      return aiResponse;

    } catch (error) {
      this.logger.error('AI 응답 생성 중 오류:', error);
      throw new InternalServerErrorException(`AI 응답 생성 실패: ${error.message}`);
    }
  }

  /**
   * 채팅 메타데이터 업데이트 (메시지 수 증가)
   */
  private async updateChatMetadata(chatId: string): Promise<void> {
    await this.prismaService.chat.update({
      where: { id: chatId },
      data: {
        messageCount: {
          increment: 2, // 사용자 메시지 + AI 메시지
        },
        updatedAt: new Date(),
      },
    });

    this.logger.log(`채팅 메타데이터 업데이트: ${chatId}`);
  }

  /**
   * 채팅 목록 가져오기
   */
  async getChatList(userId: string): Promise<ChatListItem[]> {
    return await this.chatDatabaseService.getChatList(userId);
  }

  /**
   * 특정 채팅의 메시지 가져오기
   */
  async getChatMessages(chatId: string, userId: string): Promise<ChatMessage[]> {
    return await this.chatDatabaseService.getChatMessages(chatId, userId);
  }

  /**
   * 채팅방 삭제
   */
  async deleteChat(chatId: string, userId: string): Promise<boolean> {
    return await this.chatDatabaseService.deleteChat(chatId, userId);
  }

  /**
   * 채팅방 제목 업데이트
   */
  async updateChatTitle(chatId: string, userId: string, newTitle: string): Promise<boolean> {
    return await this.chatDatabaseService.updateChatTitle(chatId, userId, newTitle);
  }

  /**
   * 채팅 통계 정보 가져오기
   */
  async getChatStats(userId: string): Promise<{
    totalChats: number;
    totalMessages: number;
    activeChatCount: number;
    recentChatCount: number;
  }> {
    return await this.chatDatabaseService.getChatStats(userId);
  }
}

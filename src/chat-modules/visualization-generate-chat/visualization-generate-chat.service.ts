import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { PromptService, ChatType, PromptData } from '../../prompts/prompt/prompt.service';
import { ChatDatabaseService, ChatListItem, ChatMessage, AnthropicMessage } from '../chat-database/chat-database.service';
import { MessageRole, MessageType, MessageMode } from '../../chat.dto/dto/chat.dto';
import { v4 as uuidv4 } from 'uuid';

export interface VisualizationChatRequest {
  userInput: string;
  userId: string;
  chatId?: string;
  chatTitle?: string;
  spreadsheetData?: any;
  language?: string;
  messageId?: string;
  spreadsheetId?: string;
}

export interface VisualizationChatResponse {
  success: boolean;
  code: string;
  type: 'chart' | 'table' | 'analysis';
  title: string;
  explanation: {
    korean: string;
  };
  chatId: string;
  userMessageId: string;
  aiMessageId: string;
  timestamp: string;
  spreadsheetMetadata?: any;
  error?: string;
}

export enum VisualizationType {
  CHART = 'chart',
  TABLE = 'table',
  ANALYSIS = 'analysis'
}

@Injectable()
export class VisualizationGenerateChatService {
  private readonly logger = new Logger(VisualizationGenerateChatService.name);
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

  async processVisualizationChat(request: VisualizationChatRequest): Promise<VisualizationChatResponse> {
    this.logger.log('==================== Visualization Chat 처리 시작 ====================');
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

      // 4. 시각화 타입 결정
      const visualizationType = this.determineVisualizationType(request.userInput);

      // 5. 프롬프트 데이터 생성
      const promptData = this.createPromptData(request, processedSpreadsheetData, spreadsheetMetadata);

      // 6. AI 프롬프트 생성
      const prompts = this.promptService.generatePrompts(ChatType.VISUALIZATION_CHAT, promptData);

      // 7. AI 응답 생성
      const aiResponse = await this.generateAIResponse(
        prompts.systemPrompt,
        prompts.userPrompt,
        chatId,
        prompts.temperature,
        prompts.maxTokens
      );

      // 8. 코드 추출 및 검증
      const extractedCode = this.extractCodeFromResponse(aiResponse);
      if (!extractedCode) {
        this.logger.error('코드 추출 실패 - AI 응답 전체 내용:');
        this.logger.error(aiResponse);
        throw new InternalServerErrorException(
          '생성된 응답에서 유효한 코드를 찾을 수 없습니다. ' +
          'AI가 올바른 형식의 React 컴포넌트를 생성하지 않았을 수 있습니다.'
        );
      }
      this.validateGeneratedCode(extractedCode);

      // 9. 설명 추출
      const explanation = this.extractExplanationFromResponse(aiResponse);

      // 10. AI 응답 저장
      const aiMessageId = await this.saveAIMessage(
        chatId, 
        explanation || '시각화가 생성되었습니다.',
        extractedCode,
        visualizationType,
        request.userInput
      );

      // 11. 채팅 메타데이터 업데이트
      await this.updateChatMetadata(chatId);

      this.logger.log('==================== Visualization Chat 처리 완료 ====================');

      return {
        success: true,
        code: extractedCode,
        type: visualizationType,
        title: this.generateTitle(request.userInput, visualizationType),
        explanation: {
          korean: explanation || '데이터 시각화가 생성되었습니다.'
        },
        chatId,
        userMessageId,
        aiMessageId,
        timestamp: new Date().toISOString(),
        spreadsheetMetadata,
      };

    } catch (error) {
      this.logger.error('Visualization Chat 처리 중 오류 발생:', error);
      throw new InternalServerErrorException(`Visualization Chat 처리 실패: ${error.message}`);
    }
  }

  /**
   * 채팅방 생성 또는 기존 채팅방 가져오기
   */
  private async ensureChatExists(request: VisualizationChatRequest): Promise<string> {
    // 사용자 존재 여부 확인 및 게스트 사용자 생성
    await this.ensureUserExists(request.userId);

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
        title: request.chatTitle || `시각화 채팅 ${new Date().toLocaleDateString()}`,
        userId: request.userId,
        sheetMetaDataId: null, // 외래키 제약 조건 위반 방지를 위해 null로 설정
        status: 'ACTIVE',
        messageCount: 0,
      },
    });

    this.logger.log(`새 채팅방 생성: ${newChat.id}`);
    return newChat.id;
  }

  /**
   * 사용자 존재 여부 확인 및 게스트 사용자 생성
   */
  private async ensureUserExists(userId: string): Promise<void> {
    try {
      // 사용자 존재 여부 확인
      const existingUser = await this.prismaService.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser && userId.startsWith('guest_')) {
        // 게스트 사용자 생성
        await this.prismaService.user.create({
          data: {
            id: userId,
            email: `${userId}@guest.temp`,
            displayName: userId,
            isGuest: true,
          },
        });
        this.logger.log(`게스트 사용자 생성: ${userId}`);
      } else if (!existingUser) {
        throw new BadRequestException(`유효하지 않은 사용자 ID: ${userId}`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`사용자 확인/생성 실패: ${userId}`, error);
      throw new BadRequestException(`사용자 확인에 실패했습니다: ${error.message}`);
    }
  }

  /**
   * 사용자 메시지 저장
   */
  private async saveUserMessage(chatId: string, request: VisualizationChatRequest): Promise<string> {
    const userMessage = await this.prismaService.message.create({
      data: {
        content: request.userInput,
        role: 'USER' as any,
        type: 'VISUALIZATION' as any,
        mode: 'VISUALIZATION' as any,
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
  private async saveAIMessage(
    chatId: string, 
    content: string, 
    code: string, 
    type: string, 
    userInput: string
  ): Promise<string> {
    const artifactId = uuidv4();
    const aiMessage = await this.prismaService.message.create({
      data: {
        content,
        role: 'EXTION_AI' as any,
        type: 'VISUALIZATION' as any,
        mode: 'VISUALIZATION' as any,
        chatId,
        artifactData: {
          type,
          title: this.generateTitle(userInput, type as VisualizationType),
          artifactId,
          code,
          explanation: content,
        },
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
            sheets: [{
              name: activeSheet.name,
              data: activeSheet.data,
              sheetIndex: activeSheet.index,
            }],
            fileName: sheetMetaData.fileName,
            spreadsheetId: sheetMetaData.id,
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
        sheetNames: spreadsheetData.sheets?.map(sheet => sheet.name) || ['Sheet1'],
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
    request: VisualizationChatRequest,
    spreadsheetData: any,
    spreadsheetMetadata: any
  ): PromptData {
    const hasData = !!spreadsheetData;
    
    // 스프레드시트 데이터가 있는 경우 처리
    let headers = '';
    let csvData = '';
    let rowCount = 0;
    let columnCount = 0;

    if (hasData && spreadsheetData?.sheets?.[0]) {
      const sheetData = Array.isArray(spreadsheetData.sheets[0].data) 
        ? spreadsheetData.sheets[0].data 
        : [];
      
      if (sheetData.length > 0) {
        headers = Array.isArray(sheetData[0]) ? sheetData[0].join(', ') : '';
        rowCount = sheetData.length;
        columnCount = Array.isArray(sheetData[0]) ? sheetData[0].length : 0;
        
        // CSV 형식으로 변환 (처음 100행까지만)
        const limitedData = sheetData.slice(0, 100);
        csvData = this.formatRawDataForAI(limitedData);
      }
    }

    return {
      user_input: request.userInput,
      has_data: hasData,
      spreadsheet_name: spreadsheetMetadata?.fileName || '',
      sheet_name: spreadsheetData?.sheets?.[0]?.name || spreadsheetMetadata?.sheetNames?.[0] || '',
      headers,
      row_count: rowCount,
      column_count: columnCount,
      csv_data: csvData,
    };
  }

  /**
   * Raw 데이터를 AI가 분석할 수 있는 형식으로 변환
   */
  private formatRawDataForAI(rows: string[][]): string {
    return rows.map((row, index) => {
      const rowData = row.map(cell => cell || '').join('\t');
      return `${index + 1}: ${rowData}`;
    }).join('\n');
  }

  /**
   * 시각화 타입 결정
   */
  private determineVisualizationType(userInput: string): VisualizationType {
    const input = userInput.toLowerCase();
    if (input.includes('차트') || input.includes('그래프') || input.includes('시각화')) {
      return VisualizationType.CHART;
    }
    if (input.includes('테이블') || input.includes('표') || input.includes('목록')) {
      return VisualizationType.TABLE;
    }
    return VisualizationType.ANALYSIS;
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
        temperature: temperature || 0.1,
        max_tokens: maxTokens || 4000,
      });

      const firstBlock = completion.content[0];
      const aiResponse = firstBlock?.type === 'text' ? firstBlock.text : null;

      if (!aiResponse) {
        throw new InternalServerErrorException('AI 응답을 받을 수 없습니다.');
      }

      this.logger.log(`AI 응답 생성 완료: ${aiResponse.length}자`);
      this.logger.debug(`AI 응답 미리보기: ${aiResponse.substring(0, 300)}...`);
      return aiResponse;

    } catch (error) {
      this.logger.error('AI 응답 생성 중 오류:', error);
      throw new InternalServerErrorException(`AI 응답 생성 실패: ${error.message}`);
    }
  }

  /**
   * AI 응답에서 코드 블록 추출
   */
  private extractCodeFromResponse(response: string): string | null {
    // 다양한 형태의 코드 블록을 매치하도록 개선된 정규식
    const codeBlockPatterns = [
      // 언어 지정자가 있는 경우 (javascript, jsx, js)
      /```(?:javascript|jsx|js)\s*\n([\s\S]*?)\n?```/g,
      // 언어 지정자가 없는 일반 코드 블록
      /```\s*\n([\s\S]*?)\n?```/g,
      // 공백 없이 바로 시작하는 코드 블록
      /```([\s\S]*?)```/g
    ];

    for (const pattern of codeBlockPatterns) {
      const matches = [...response.matchAll(pattern)];
      for (const match of matches) {
        const code = match[1]?.trim();
        if (code && this.isValidReactCode(code)) {
          this.logger.debug('코드 블록에서 코드 추출 성공');
          this.logger.debug(`추출된 코드 미리보기: ${code.substring(0, 100)}...`);
          return code;
        }
      }
    }

    // 코드 블록이 없는 경우, 응답 전체에서 React 컴포넌트 찾기
    const componentMatch = response.match(/const\s+ComponentToRender\s*=[\s\S]*?(?=\n\n|$)/);
    if (componentMatch) {
      const code = componentMatch[0].trim();
      if (this.isValidReactCode(code)) {
        this.logger.debug('응답에서 React 컴포넌트 직접 추출 성공');
        return code;
      }
    }

    this.logger.warn('응답에서 유효한 코드를 찾지 못했습니다.');
    this.logger.debug(`응답 미리보기: ${response.substring(0, 500)}...`);
    return null;
  }

  /**
   * 코드가 유효한 React 코드인지 간단히 검증
   */
  private isValidReactCode(code: string): boolean {
    return code.includes('ComponentToRender') && 
           code.includes('=>') && 
           code.includes('return') &&
           code.length > 50; // 최소 길이 체크
  }

  /**
   * AI 응답에서 데이터 분석 설명 추출
   */
  private extractExplanationFromResponse(response: string): string {
    const parts = response.split(/```/);
    // 코드 블록 다음의 텍스트를 분석 결과로 간주
    const explanation = parts.length > 2 ? parts[2].trim() : (parts.length === 1 ? parts[0].trim() : '');

    if (explanation) {
      this.logger.debug(`데이터 분석 설명 추출 성공 (길이: ${explanation.length})`);
    } else {
      this.logger.warn('응답에서 데이터 분석 설명을 추출하지 못했습니다.');
    }
    return explanation;
  }

  /**
   * 생성된 코드의 유효성 검증
   */
  private validateGeneratedCode(code: string): void {
    if (!code.includes('=>') || !code.includes('(') || !code.includes(')')) {
      this.logger.error('코드가 유효한 React 함수 컴포넌트 형식이 아닙니다.');
      throw new InternalServerErrorException('생성된 코드가 유효한 React 컴포넌트 형식이 아닙니다.');
    }
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      this.logger.error(`중괄호 불일치: 열기 ${openBraces}개, 닫기 ${closeBraces}개`);
      throw new InternalServerErrorException('코드의 중괄호가 올바르게 닫히지 않았습니다.');
    }
    this.logger.debug('코드 검증 완료');
  }

  /**
   * 시각화 제목 생성
   */
  private generateTitle(userInput: string, type: VisualizationType): string {
    const typeMap = {
      [VisualizationType.CHART]: '차트 분석',
      [VisualizationType.TABLE]: '테이블 분석',
      [VisualizationType.ANALYSIS]: '데이터 분석'
    };
    return `${typeMap[type]} - ${userInput.substring(0, 20)}${userInput.length > 20 ? '...' : ''}`;
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
    try {
      await this.chatDatabaseService.updateChatTitle(chatId, userId, newTitle);
      return true;
    } catch (error) {
      this.logger.error('채팅 제목 업데이트 실패:', error);
      return false;
    }
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

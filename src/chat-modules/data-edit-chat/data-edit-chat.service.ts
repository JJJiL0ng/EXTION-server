import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { PromptService, ChatType, PromptData } from '../prompts/prompt/prompt.service';
import { ChatDatabaseService, ChatListItem, ChatMessage, AnthropicMessage } from '../chat-database/chat-database.service';
import { MessageRole, MessageType, MessageMode } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

export interface DataEditChatRequest {
  userInput: string;
  userId: string;
  chatId?: string;
  chatTitle?: string;
  spreadsheetData?: any;
  spreadsheetId?: string;
  language?: string;
  messageId?: string;
  targetSheetIndex?: number;
}

export interface DataEditChatResponse {
  success: boolean;
  chatId: string;
  userMessageId: string;
  aiMessageId: string;
  timestamp: string;
  editedData?: {
    sheetName: string;
    headers: string[];
    data: string[][];
  };
  sheetIndex?: number;
  explanation?: string;
  changes?: {
    type: 'sort' | 'filter' | 'modify' | 'transform';
    details: string;
  };
  spreadsheetMetadata?: any;
  error?: string;
}

export enum ChangeType {
  SORT = 'sort',
  FILTER = 'filter',
  MODIFY = 'modify',
  TRANSFORM = 'transform'
}

@Injectable()
export class DataEditChatService {
  private readonly logger = new Logger(DataEditChatService.name);
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

  async processDataEditChat(request: DataEditChatRequest): Promise<DataEditChatResponse> {
    this.logger.log('==================== Data Edit Chat 처리 시작 ====================');
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
      const prompts = this.promptService.generatePrompts(ChatType.EDIT_CHAT, promptData);

      // 6. AI 응답 생성
      const aiResponse = await this.generateAIResponse(
        prompts.systemPrompt,
        prompts.userPrompt,
        chatId,
        prompts.temperature,
        prompts.maxTokens
      );

      // 7. 응답에서 데이터 추출
      const extractedResult = this.extractDataFromResponse(aiResponse);

      // 8. AI 응답 저장
      const aiMessageId = await this.saveAIMessage(
        chatId,
        extractedResult.explanation || '데이터 편집이 완료되었습니다.',
        extractedResult
      );

      // 9. 채팅 메타데이터 업데이트
      await this.updateChatMetadata(chatId);

      this.logger.log('==================== Data Edit Chat 처리 완료 ====================');

      return {
        success: true,
        chatId,
        userMessageId,
        aiMessageId,
        timestamp: new Date().toISOString(),
        editedData: extractedResult.editedData,
        sheetIndex: extractedResult.sheetIndex,
        explanation: extractedResult.explanation,
        changes: extractedResult.changes,
        spreadsheetMetadata,
      };

    } catch (error) {
      this.logger.error('Data Edit Chat 처리 중 오류 발생:', error);
      throw new InternalServerErrorException(`Data Edit Chat 처리 실패: ${error.message}`);
    }
  }

  /**
   * 채팅방 생성 또는 기존 채팅방 가져오기
   */
  private async ensureChatExists(request: DataEditChatRequest): Promise<string> {
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
        title: request.chatTitle || `데이터 편집 ${new Date().toLocaleDateString()}`,
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
  private async saveUserMessage(chatId: string, request: DataEditChatRequest): Promise<string> {
    const userMessage = await this.prismaService.message.create({
      data: {
        content: request.userInput,
        role: 'USER' as any,
        type: 'TEXT' as any,
        mode: 'DATA_EDIT' as any,
        chatId,
        sheetContext: request.spreadsheetData ? {
          hasData: !!request.spreadsheetData,
          spreadsheetId: request.spreadsheetId,
          fileName: request.spreadsheetData?.fileName,
          activeSheetIndex: request.spreadsheetData?.activeSheetIndex,
          targetSheetIndex: request.targetSheetIndex,
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
    extractedResult: any
  ): Promise<string> {
    const aiMessage = await this.prismaService.message.create({
      data: {
        content,
        role: 'EXTION_AI' as any,
        type: 'DATA_EDIT' as any,
        mode: 'DATA_EDIT' as any,
        chatId,
        dataChangeInfo: extractedResult.editedData ? {
          sheetName: extractedResult.editedData.sheetName,
          changes: extractedResult.changes,
          editedData: extractedResult.editedData,
          sheetIndex: extractedResult.sheetIndex,
        } : undefined,
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
            activeSheet: activeSheet.name,
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
    request: DataEditChatRequest,
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
      const activeSheet = spreadsheetData.sheets.find(sheet => 
        sheet.name === spreadsheetData.activeSheet
      ) || spreadsheetData.sheets[0];
      
      if (activeSheet?.data) {
        const sheetData = Array.isArray(activeSheet.data) ? activeSheet.data : [];
        
        if (sheetData.length > 0) {
          headers = Array.isArray(sheetData[0]) ? sheetData[0].join(', ') : '';
          rowCount = sheetData.length;
          columnCount = Array.isArray(sheetData[0]) ? sheetData[0].length : 0;
          
          // CSV 형식으로 변환 (처음 200행까지만)
          const limitedData = sheetData.slice(0, 200);
          csvData = this.formatRawDataForAI(limitedData);
        }
      }
    }

    return {
      user_input: request.userInput,
      has_data: hasData,
      spreadsheet_name: spreadsheetMetadata?.fileName || '',
      sheet_name: spreadsheetData?.activeSheet || spreadsheetMetadata?.sheetNames?.[0] || '',
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
    const maxCsvLength = 50000; // 최대 50,000 문자
    
    let csvData = rows.map((row, index) => {
      const rowData = row.map(cell => cell || '').join('\t');
      return `${index + 1}: ${rowData}`;
    }).join('\n');

    // CSV 데이터 크기 제한
    if (csvData.length > maxCsvLength) {
      const lines = csvData.split('\n');
      const header = lines[0];
      const dataLines = lines.slice(1);
      
      let limitedCsv = header + '\n';
      let currentLength = limitedCsv.length;
      
      for (const line of dataLines) {
        if (currentLength + line.length + 1 > maxCsvLength) {
          limitedCsv += '\n... (데이터가 더 있습니다. 총 ' + lines.length + '행)';
          break;
        }
        limitedCsv += line + '\n';
        currentLength += line.length + 1;
      }
      
      this.logger.log(`CSV 데이터 크기 제한: ${csvData.length} → ${limitedCsv.length} 문자`);
      return limitedCsv;
    }
    
    return csvData;
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
        model: 'claude-sonnet-4-20250514',
        system: systemPrompt,
        messages: [
          ...historyMessages,
          { role: 'user', content: userPrompt }
        ],
        temperature: temperature || 0.2,
        max_tokens: maxTokens || 8192,
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
   * AI 응답에서 데이터 추출
   */
  private extractDataFromResponse(aiResponse: string): any {
    this.logger.debug(`AI 응답 분석 시작: ${aiResponse.substring(0, 100)}...`);
    
    try {
      // JSON 추출
      const jsonRegex = /```json([\s\S]*?)```|(\{[\s\S]*\})/;
      const match = aiResponse.match(jsonRegex);
      
      let jsonString = '';
      if (match && match[1]) {
        jsonString = match[1].trim();
      } else if (match && match[2]) {
        jsonString = match[2].trim();
      } else if (aiResponse.trimStart().startsWith('{') && aiResponse.trimEnd().endsWith('}')) {
        jsonString = aiResponse.trim();
      } else {
        throw new Error('응답에서 유효한 JSON 형식을 찾을 수 없습니다.');
      }
      
      // JSON 파싱
      const parsedData = JSON.parse(jsonString);
      
      // 기본 유효성 검사
      if (!parsedData.sheetName) {
        throw new Error('시트명이 누락되었습니다.');
      }
      if (!Array.isArray(parsedData.headers) || parsedData.headers.length === 0) {
        throw new Error('유효한 헤더가 없습니다.');
      }
      if (!Array.isArray(parsedData.data)) {
        throw new Error('데이터 배열이 누락되었습니다.');
      }
      
      // 데이터 배열 검증 및 정제
      const cleanedData = parsedData.data.map(row => {
        if (!Array.isArray(row)) {
          return parsedData.headers.map(() => '');
        }
        
        // 헤더 길이에 맞게 데이터 조정
        while (row.length < parsedData.headers.length) {
          row.push('');
        }
        
        // 모든 값이 문자열인지 확인
        return row.map(cell => cell === null || cell === undefined ? '' : String(cell));
      });
      
      // 변경 유형 및 세부 내용 확인
      const changesTypes = ['sort', 'filter', 'modify', 'transform'];
      const changes = parsedData.changes && 
        changesTypes.includes(parsedData.changes.type) ? 
        {
          type: parsedData.changes.type as ChangeType,
          details: parsedData.changes.details || '상세 설명 없음'
        } : 
        {
          type: ChangeType.MODIFY,
          details: '데이터가 수정되었습니다.'
        };
      
      // 시트 인덱스 결정
      const sheetIndex = typeof parsedData.sheetIndex === 'number' 
        ? parsedData.sheetIndex 
        : 0;
      
      return {
        editedData: {
          sheetName: parsedData.sheetName,
          headers: parsedData.headers.map(header => String(header)),
          data: cleanedData
        },
        sheetIndex,
        explanation: parsedData.explanation || '데이터가 성공적으로 수정되었습니다.',
        changes
      };
      
    } catch (error) {
      this.logger.error('응답 데이터 추출 오류:', error);
      throw new InternalServerErrorException(`데이터 추출 실패: ${error.message}`);
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

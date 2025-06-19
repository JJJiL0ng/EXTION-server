import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { PromptService, ChatType, PromptData } from '../prompts/prompt/prompt.service';
import { ChatDatabaseService, ChatListItem, ChatMessage, AnthropicMessage } from '../chat-database/chat-database.service';
import { MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';
import { SpreadsheetService } from '../../sheet-modules/spreadsheet/spreadsheet.service';
import { CreateSpreadsheetDto } from '../../sheet-modules/spreadsheet/dto/spreadsheet.dto';
import { v4 as uuidv4 } from 'uuid';

export interface DataGenerateChatRequest {
  userInput: string;
  userId: string;
  chatId?: string;
  chatTitle?: string;
  spreadsheetData?: any;
  spreadsheetId?: string;
  language?: string;
  messageId?: string;
  extendedSheetContext?: any;
  sheetsData?: any;
  currentData?: any;
}

export interface DataGenerateChatResponse {
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
  changeLog?: ChangeLogItem[];
  spreadsheetId?: string;
  spreadsheetMetadata?: any;
  error?: string;
}

export interface ChangeLogItem {
  type: 'create' | 'add' | 'modify' | 'delete';
  description: string;
  row?: number;
  column?: number;
  before?: string;
  after?: string;
}

@Injectable()
export class DataGenerateChatService {
  private readonly logger = new Logger(DataGenerateChatService.name);
  private readonly anthropic: Anthropic;

  constructor(
    private configService: ConfigService,
    private prismaService: PrismaService,
    private promptService: PromptService,
    private chatDatabaseService: ChatDatabaseService,
    private spreadsheetService: SpreadsheetService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get('CLAUDE_API_KEY'),
    });
  }

  async processDataGenerateChat(request: DataGenerateChatRequest): Promise<DataGenerateChatResponse> {
    this.logger.log('==================== Data Generate Chat 처리 시작 ====================');
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
        request.spreadsheetId,
        request.extendedSheetContext,
        request.sheetsData || request.currentData
      );

      // 4. 프롬프트 데이터 생성
      const promptData = this.createPromptData(request, processedSpreadsheetData, spreadsheetMetadata);

      // 5. AI 프롬프트 생성
      const prompts = this.promptService.generatePrompts(ChatType.GENERATION_CHAT, promptData);

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

      // 8. 새로운 시트 저장 (DB에 저장) - SpreadsheetService 사용
      let generatedSpreadsheetId: string | undefined;
      if (extractedResult.editedData) {
        generatedSpreadsheetId = await this.saveNewSheetToDatabase(
          request.userId,
          extractedResult.editedData,
          extractedResult.sheetIndex,
          chatId
        );
      }

      // 9. AI 응답 저장
      const aiMessageId = await this.saveAIMessage(
        chatId,
        extractedResult.explanation || '데이터 생성이 완료되었습니다.',
        extractedResult,
        generatedSpreadsheetId
      );

      // 10. 채팅 메타데이터 업데이트
      await this.updateChatMetadata(chatId, generatedSpreadsheetId);

      this.logger.log('==================== Data Generate Chat 처리 완료 ====================');

      return {
        success: true,
        chatId,
        userMessageId,
        aiMessageId,
        timestamp: new Date().toISOString(),
        editedData: extractedResult.editedData,
        sheetIndex: extractedResult.sheetIndex,
        explanation: extractedResult.explanation,
        changeLog: extractedResult.changeLog,
        spreadsheetId: generatedSpreadsheetId,
        spreadsheetMetadata,
      };

    } catch (error) {
      this.logger.error('Data Generate Chat 처리 중 오류 발생:', error);
      throw new InternalServerErrorException(`Data Generate Chat 처리 실패: ${error.message}`);
    }
  }

  /**
   * 채팅방 생성 또는 기존 채팅방 가져오기
   */
  private async ensureChatExists(request: DataGenerateChatRequest): Promise<string> {
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
        title: request.chatTitle || `데이터 생성 ${new Date().toLocaleDateString()}`,
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
  private async saveUserMessage(chatId: string, request: DataGenerateChatRequest): Promise<string> {
    const userMessage = await this.prismaService.message.create({
      data: {
        content: request.userInput,
        role: 'USER' as any,
        type: 'DATA_GENERATION' as any,
        mode: 'DATAGENERATION' as any,
        chatId,
        sheetContext: request.spreadsheetData || request.extendedSheetContext ? {
          hasData: !!(request.spreadsheetData || request.extendedSheetContext || request.sheetsData || request.currentData),
          spreadsheetId: request.spreadsheetId,
          fileName: request.spreadsheetData?.fileName || request.sheetsData?.fileName,
          activeSheetIndex: request.spreadsheetData?.activeSheetIndex || request.extendedSheetContext?.sheetIndex,
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
    extractedResult: any,
    spreadsheetId?: string
  ): Promise<string> {
    const aiMessage = await this.prismaService.message.create({
      data: {
        content,
        role: 'EXTION_AI' as any,
        type: 'DATA_GENERATION' as any,
        mode: 'DATAGENERATION' as any,
        chatId,
        dataChangeInfo: extractedResult.editedData ? {
          changeType: 'generation',
          affectedSheets: [extractedResult.sheetIndex || 0],
          rowsChanged: extractedResult.editedData.data?.length || 0,
          columnsChanged: extractedResult.editedData.headers?.length || 0,
          summary: `새 시트 "${extractedResult.editedData.sheetName}" 생성`,
          spreadsheetId,
        } : undefined,
      },
    });

    this.logger.log(`AI 응답 메시지 저장: ${aiMessage.id}`);
    return aiMessage.id;
  }

  /**
   * 스프레드시트 데이터 처리 (다양한 형식 지원)
   */
  private async processSpreadsheetData(
    spreadsheetData: any,
    spreadsheetId?: string,
    extendedSheetContext?: any,
    sheetsData?: any
  ) {
    // 우선순위: spreadsheetData > DB 조회 > extendedSheetContext > sheetsData
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
              headers: Array.isArray(activeSheet.data) && activeSheet.data.length > 0 
                ? activeSheet.data[0] 
                : [],
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
    } else if (extendedSheetContext) {
      // 확장 시트 컨텍스트 사용
      processedData = {
        sheets: [{
          name: extendedSheetContext.sheetName,
          headers: extendedSheetContext.headers?.map(h => h.name || h.column) || [],
          data: extendedSheetContext.sampleData || [],
          sheetIndex: extendedSheetContext.sheetIndex || 0,
        }],
        activeSheet: extendedSheetContext.sheetName,
      };
      metadata = {
        fileName: extendedSheetContext.sheetName,
        totalSheets: extendedSheetContext.totalSheets || 1,
        activeSheetIndex: extendedSheetContext.sheetIndex || 0,
        sheetNames: [extendedSheetContext.sheetName],
      };
    } else if (sheetsData) {
      // 기존 sheetsData 구조 사용
      processedData = sheetsData;
      metadata = {
        fileName: sheetsData.fileName,
        totalSheets: sheetsData.sheets?.length || 1,
        activeSheetIndex: 0,
        sheetNames: sheetsData.sheets?.map(sheet => sheet.name) || ['Sheet1'],
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
    request: DataGenerateChatRequest,
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
      
      if (activeSheet) {
        // 헤더 추출
        if (activeSheet.headers) {
          headers = Array.isArray(activeSheet.headers) ? activeSheet.headers.join(', ') : '';
          columnCount = activeSheet.headers.length;
        } else if (activeSheet.data && activeSheet.data.length > 0) {
          headers = Array.isArray(activeSheet.data[0]) ? activeSheet.data[0].join(', ') : '';
          columnCount = Array.isArray(activeSheet.data[0]) ? activeSheet.data[0].length : 0;
        }

        // 데이터 처리
        if (activeSheet.data) {
          const sheetData = Array.isArray(activeSheet.data) ? activeSheet.data : [];
          rowCount = sheetData.length;
          
          // CSV 형식으로 변환 (처음 100행까지만)
          const limitedData = sheetData.slice(0, 100);
          csvData = this.formatRawDataForAI(limitedData);
        }
      }
    }

    // extendedSheetContext나 sheetsData 처리
    if (!hasData && (request.extendedSheetContext || request.sheetsData || request.currentData)) {
      const context = request.extendedSheetContext;
      const sheetsData = request.sheetsData || request.currentData;
      
      if (context) {
        headers = context.headers?.map(h => h.name || h.column).join(', ') || '';
        columnCount = context.headers?.length || 0;
        rowCount = context.sampleData?.length || 0;
        csvData = context.sampleData ? this.formatSampleDataForAI(context.sampleData) : '';
      } else if (sheetsData?.sheets?.[0]) {
        const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet) || sheetsData.sheets[0];
        if (activeSheet) {
          headers = activeSheet.metadata?.headers?.join(', ') || '';
          columnCount = activeSheet.metadata?.columnCount || 0;
          rowCount = activeSheet.metadata?.rowCount || 0;
          csvData = activeSheet.csv ? this.formatCsvForAI(activeSheet.csv) : '';
        }
      }
    }

    // 완전히 새로운 시트 생성 요청인지 확인
    const hasAnyData = hasData || !!(request.extendedSheetContext || request.sheetsData || request.currentData);
    
    // 로그로 데이터 상태 확인
    if (!hasAnyData) {
      this.logger.log('기존 데이터 없이 새로운 시트 생성 요청');
    }

    return {
      user_input: request.userInput,
      has_data: hasAnyData,
      spreadsheet_name: spreadsheetMetadata?.fileName || '',
      sheet_name: spreadsheetData?.activeSheet || request.extendedSheetContext?.sheetName || '',
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
   * 샘플 데이터를 AI 형식으로 변환
   */
  private formatSampleDataForAI(sampleData: any[]): string {
    return sampleData.map((row, index) => {
      if (Array.isArray(row)) {
        return `${index + 1}: ${row.join('\t')}`;
      } else if (typeof row === 'object' && row !== null) {
        return `${index + 1}: ${Object.values(row).join('\t')}`;
      } else {
        return `${index + 1}: ${row}`;
      }
    }).join('\n');
  }

  /**
   * CSV 문자열을 AI 형식으로 변환
   */
  private formatCsvForAI(csv: string): string {
    const maxLength = 30000;
    if (csv.length > maxLength) {
      return csv.substring(0, maxLength) + '\n... (데이터가 더 있습니다)';
    }
    return csv;
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
        temperature: temperature || 0.3,
        max_tokens: maxTokens || 8000,
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
      
      // 변경 로그 확인
      const changeLog: ChangeLogItem[] = Array.isArray(parsedData.changeLog) 
        ? parsedData.changeLog
        : [];
      
      // 시트 인덱스 결정
      const sheetIndex = parsedData.sheetIndex !== undefined 
        ? parsedData.sheetIndex 
        : null;
      
      return {
        editedData: {
          sheetName: parsedData.sheetName,
          headers: parsedData.headers.map(header => String(header)),
          data: cleanedData
        },
        sheetIndex,
        explanation: parsedData.explanation || '데이터가 성공적으로 생성되었습니다.',
        changeLog
      };
      
    } catch (error) {
      this.logger.error('응답 데이터 추출 오류:', error);
      throw new InternalServerErrorException(`데이터 추출 실패: ${error.message}`);
    }
  }

  /**
   * 새로운 시트를 데이터베이스에 저장 (SpreadsheetService 사용)
   */
  private async saveNewSheetToDatabase(
    userId: string,
    editedData: any,
    sheetIndex?: number,
    chatId?: string
  ): Promise<string | undefined> {
    try {
      this.logger.log(`SpreadsheetService를 사용하여 새 시트 저장 시작: ${editedData.sheetName}`);

      // 헤더 + 데이터 결합
      const allData = [editedData.headers, ...editedData.data];
      
      // SpreadsheetService의 saveSpreadsheet 메서드 사용
      const createSpreadsheetDto: CreateSpreadsheetDto = {
        userId,
        chatId, // 채팅 ID가 있으면 연결
        fileName: editedData.sheetName,
        originalFileName: `${editedData.sheetName}.xlsx`,
        fileSize: this.calculateDataSize(allData),
        fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        activeSheetIndex: 0,
        sheets: [
          {
            name: editedData.sheetName,
            index: sheetIndex || 0,
            data: allData,
          }
        ],
      };

      const result = await this.spreadsheetService.saveSpreadsheet(createSpreadsheetDto);
      
      this.logger.log(`SpreadsheetService를 통한 시트 저장 완료: ${editedData.sheetName}, ID: ${result.id}`);
      this.logger.log(`연결된 채팅 ID: ${result.chatId}`);
      
      return result.id;
    } catch (error) {
      this.logger.error('SpreadsheetService를 통한 시트 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 데이터 크기 계산 (간단한 추정)
   */
  private calculateDataSize(data: any[][]): number {
    const jsonString = JSON.stringify(data);
    return Buffer.byteLength(jsonString, 'utf8');
  }

  /**
   * 채팅 메타데이터 업데이트 (메시지 수 증가 및 스프레드시트 연결)
   */
  private async updateChatMetadata(chatId: string, spreadsheetId?: string): Promise<void> {
    const updateData: any = {
      messageCount: {
        increment: 2, // 사용자 메시지 + AI 메시지
      },
      updatedAt: new Date(),
    };

    if (spreadsheetId) {
      updateData.sheetMetaDataId = spreadsheetId;
    }

    await this.prismaService.chat.update({
      where: { id: chatId },
      data: updateData,
    });

    this.logger.log(`채팅 메타데이터 업데이트: ${chatId}${spreadsheetId ? `, 스프레드시트 연결: ${spreadsheetId}` : ''}`);
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

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { 
  OrchestratorChatRequestDto, 
  OrchestratorChatResponseDto,
  GeneralChatResponseDto,
  FunctionChatResponseDto,
  EditChatResponseDto,
  GenerateChatResponseDto,
  VisualizationChatResponseDto
} from '../dto';

// 각 서비스 import
import { GeneralChatService } from '../general-chat/general-chat.service';
import { VisualizationGenerateChatService } from '../visualization-generate-chat/visualization-generate-chat.service';
import { DataEditChatService } from '../data-edit-chat/data-edit-chat.service';
import { DataGenerateChatService } from '../data-generate-chat/data-generate-chat.service';
import { FunctionChatService } from '../function-chat/function-chat.service';
// import { GenerateChatService } from '../generate-chat/generate-chat.service';
import { AnalyzeUserIntentService, ChatModule } from '../analyze-user-intent/analyze-user-intent.service';
import { MessageMode } from '../../common/dto/chat.dto';

@Injectable()
export class OrchestratorChatService {
  private readonly logger = new Logger(OrchestratorChatService.name);

  constructor(
    private readonly analyzeUserIntentService: AnalyzeUserIntentService,
    // 각 채팅 서비스 의존성 주입
    private readonly generalChatService: GeneralChatService,
    private readonly visualizationGenerateChatService: VisualizationGenerateChatService,
    private readonly dataEditChatService: DataEditChatService,
    private readonly dataGenerateChatService: DataGenerateChatService,
    private readonly functionChatService: FunctionChatService,
    // private readonly generateChatService: GenerateChatService,
  ) {}

  async processMessage(requestDto: OrchestratorChatRequestDto): Promise<OrchestratorChatResponseDto> {
    this.logger.log(`채팅 처리 요청`);

    try {
      // 1. 사용자 의중 파악 (메시지 분석)
      const intent = await this.analyzeUserIntentService.analyze(requestDto.message);
      
      switch (intent) {
          case ChatModule.GENERAL:
              return await this.handleGeneralChat(requestDto);
          case ChatModule.FUNCTION:
              return await this.handleFunctionChat(requestDto);
          case ChatModule.EDIT:
              return await this.handleEditChat(requestDto);
          case ChatModule.GENERATION: 
              return await this.handleGenerateChat(requestDto);
          case ChatModule.VISUALIZATION:
              return await this.handleVisualizationChat(requestDto);
          default:
              return await this.handleGeneralChat(requestDto);
      }
    } catch (error) {
      this.logger.error('채팅 처리 중 오류 발생:', error);
      throw error;
    }
  }

  /**
   * 일반 채팅 처리
   */
  private async handleGeneralChat(requestDto: OrchestratorChatRequestDto): Promise<GeneralChatResponseDto> {
    // GeneralChatService 호출
    const generalChatRequest = {
      userInput: requestDto.message,
      userId: requestDto.userId,
      chatId: requestDto.chatId,
      language: requestDto.language || 'ko',
      spreadsheetId: requestDto.sheetId,
    };

    const result = await this.generalChatService.processGeneralChat(generalChatRequest);
    
    return {
      success: result.success,
      chatType: 'general-chat',
      chatId: result.chatId,
      userMessageId: result.userMessageId,
      aiMessageId: result.aiMessageId,
      timestamp: result.timestamp,
      data: {
        message: result.message,
        spreadsheetMetadata: result.spreadsheetMetadata || {
          hasSpreadsheet: !!requestDto.sheetId
        }
      },
      error: result.error
    };
  }

  /**
   * 함수 실행 채팅 처리
   */
  private async handleFunctionChat(requestDto: OrchestratorChatRequestDto): Promise<FunctionChatResponseDto> {
    // FunctionChatService 호출
    const functionRequest = {
      userInput: requestDto.message,
      userId: requestDto.userId,
      chatId: requestDto.chatId,
      language: requestDto.language || 'ko',
      spreadsheetId: requestDto.sheetId,
      spreadsheetData: undefined, // OrchestratorChatRequestDto에는 spreadsheetData 속성이 없음
    };

    const result = await this.functionChatService.processFunctionChat(functionRequest);
    
    return {
      success: result.success,
      chatType: 'function-chat',
      chatId: result.chatId,
      userMessageId: result.userMessageId,
      aiMessageId: result.aiMessageId,
      timestamp: result.timestamp,
              data: {
          explanation: result.explanation || '함수 실행이 완료되었습니다.',
          functionDetails: result.functionDetails || {
            functionType: '',
            sourceRange: '',
            targetCell: '',
            result: '',
            formula: ''
          }
        },
      error: result.error
    };
  }

  /**
   * 데이터 수정 채팅 처리
   */
  private async handleEditChat(requestDto: OrchestratorChatRequestDto): Promise<EditChatResponseDto> {
    // DataEditChatService 호출
    const editRequest = {
      userInput: requestDto.message,
      userId: requestDto.userId,
      chatId: requestDto.chatId,
      language: requestDto.language || 'ko',
      spreadsheetId: requestDto.sheetId,
      spreadsheetData: undefined, // OrchestratorChatRequestDto에는 spreadsheetData 속성이 없음
    };

    const result = await this.dataEditChatService.processDataEditChat(editRequest);
    
    return {
      success: result.success,
      chatType: 'edit-chat',
      chatId: result.chatId,
      userMessageId: result.userMessageId,
      aiMessageId: result.aiMessageId,
      timestamp: result.timestamp,
      data: {
        editedData: result.editedData || {
          sheetName: '',
          headers: [],
          data: []
        },
        sheetIndex: result.sheetIndex || 0,
        explanation: result.explanation || '데이터 편집이 완료되었습니다.',
        changes: result.changes || {
          type: 'modify',
          details: '데이터가 수정되었습니다.'
        },
        spreadsheetMetadata: result.spreadsheetMetadata || {
          hasSpreadsheet: !!requestDto.sheetId
        }
      },
      error: result.error
    };
  }

  /**
   * 데이터 생성 채팅 처리
   */
  private async handleGenerateChat(requestDto: OrchestratorChatRequestDto): Promise<GenerateChatResponseDto> {
    // DataGenerateChatService 호출
    const generateRequest = {
      userInput: requestDto.message,
      userId: requestDto.userId,
      chatId: requestDto.chatId,
      language: requestDto.language || 'ko',
      spreadsheetId: requestDto.sheetId,
      spreadsheetData: undefined, // OrchestratorChatRequestDto에는 spreadsheetData 속성이 없음
    };

    const result = await this.dataGenerateChatService.processDataGenerateChat(generateRequest);
    
    return {
      success: result.success,
      chatType: 'generate-chat',
      chatId: result.chatId,
      userMessageId: result.userMessageId,
      aiMessageId: result.aiMessageId,
      timestamp: result.timestamp,
              data: {
          editedData: result.editedData || {
            sheetName: '',
            headers: [],
            data: []
          },
          sheetIndex: result.sheetIndex || null,
          explanation: result.explanation || '데이터 생성이 완료되었습니다.',
          changeLog: result.changeLog?.map(item => ({
            action: item.type || 'create',
            details: item.description || '새 데이터 생성'
          })) || [
            { action: 'create', details: '새 데이터 생성' }
          ],
          spreadsheetId: result.spreadsheetId || ''
        },
      error: result.error
    };
  }

  /**
   * 시각화 생성 채팅 처리
   */
  private async handleVisualizationChat(requestDto: OrchestratorChatRequestDto): Promise<VisualizationChatResponseDto> {
    // VisualizationGenerateChatService 호출
    const visualizationRequest = {
      userInput: requestDto.message,
      userId: requestDto.userId,
      chatId: requestDto.chatId,
      language: requestDto.language || 'ko',
      spreadsheetId: requestDto.sheetId,
      spreadsheetData: undefined, // OrchestratorChatRequestDto에는 spreadsheetData 속성이 없음
    };

    const result = await this.visualizationGenerateChatService.processVisualizationChat(visualizationRequest);
    
    return {
      success: result.success,
      chatType: 'visualization-chat',
      chatId: result.chatId,
      userMessageId: result.userMessageId,
      aiMessageId: result.aiMessageId,
      timestamp: result.timestamp,
      data: {
        code: result.code,
        type: result.type,
        title: result.title,
        explanation: result.explanation,
        spreadsheetMetadata: result.spreadsheetMetadata || {
          hasSpreadsheet: !!requestDto.sheetId
        }
      },
      error: result.error
    };
  }
}
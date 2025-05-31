import { Controller, Post, Body, HttpStatus, HttpCode, BadRequestException, Logger, UsePipes, ValidationPipe, InternalServerErrorException, Get, Param, Query } from '@nestjs/common';
import { FormulaService } from './formula.service';
import { ProcessFormulaDto } from './dto/process-formula.dto';
import { FormulaResponseDto } from './dto/formula-response.dto';

@Controller('formula')
export class FormulaController {
  private readonly logger = new Logger(FormulaController.name);
  
  constructor(private readonly formulaService: FormulaService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true
  }))
  async generateFormula(
    @Body() processFormulaDto: ProcessFormulaDto
  ): Promise<FormulaResponseDto> {
    // 요청 데이터 로깅
    this.logger.log('=== Formula Generation Request ===');
    this.logger.log(`UserInput: ${processFormulaDto.userInput}`);
    this.logger.log(`User ID: ${processFormulaDto.userId}`);
    this.logger.log(`Chat ID: ${processFormulaDto.chatId || 'NEW CHAT'}`);
    this.logger.log(`Chat Title: ${processFormulaDto.chatTitle || 'N/A'}`);
    this.logger.log(`Message ID: ${processFormulaDto.messageId || 'N/A'}`);
    this.logger.log(`Language: ${processFormulaDto.language || 'ko'}`);

    // 스프레드시트 데이터 로깅
    if (processFormulaDto.spreadsheetData) {
      this.logger.log('=== Spreadsheet Data ===');
      this.logger.log(`File Name: ${processFormulaDto.spreadsheetData.fileName || 'N/A'}`);
      this.logger.log(`Active Sheet: ${processFormulaDto.spreadsheetData.activeSheet}`);
      this.logger.log(`Total Sheets: ${processFormulaDto.spreadsheetData.sheets?.length || 0}`);
      
      if (processFormulaDto.spreadsheetData.sheets?.length > 0) {
        const firstSheet = processFormulaDto.spreadsheetData.sheets[0];
        this.logger.log(`First Sheet Name: ${firstSheet.name}`);
        this.logger.log(`Headers Count: ${firstSheet.headers?.length || 0}`);
        this.logger.log(`Data Rows Count: ${firstSheet.data?.length || 0}`);
      }
    }

    // 시트 컨텍스트 로깅 (하위 호환성)
    if (processFormulaDto.sheetContext) {
      this.logger.log('=== Sheet Context (Legacy) ===');
      this.logger.log(`Sheet Name: ${processFormulaDto.sheetContext.sheetName}`);
      this.logger.log(`Headers Count: ${processFormulaDto.sheetContext.headers?.length || 0}`);
      this.logger.log(`Data Range: ${processFormulaDto.sheetContext.dataRange?.startRow}-${processFormulaDto.sheetContext.dataRange?.endRow}`);
    }

    // 필수 필드 검증
    if (!processFormulaDto.userId) {
      this.logger.error('Missing required field: userId');
      throw new BadRequestException('사용자 ID가 필요합니다.');
    }

    if (!processFormulaDto.userInput?.trim()) {
      this.logger.error('Missing or empty userInput');
      throw new BadRequestException('사용자 입력이 필요합니다.');
    }

    // 새 채팅인 경우 제목 검증
    if (!processFormulaDto.chatId && !processFormulaDto.chatTitle) {
      this.logger.log('New chat without title, will auto-generate from userInput');
    }

    try {
      this.logger.log('=== Processing Formula Generation Request ===');
      const startTime = Date.now();

      const result = await this.formulaService.generateFormula(processFormulaDto);

      const processingTime = Date.now() - startTime;
      this.logger.log('=== Formula Generation Response ===');
      this.logger.log(`Processing Time: ${processingTime}ms`);
      this.logger.log(`Success: ${result.success}`);
      this.logger.log(`Formula: ${result.formula || 'N/A'}`);
      this.logger.log(`Cell Address: ${result.cellAddress || 'N/A'}`);
      this.logger.log(`Function Type: ${result.functionType || 'N/A'}`);
      this.logger.log(`Chat ID: ${result.chatId}`);
      this.logger.log(`User Message ID: ${result.userMessageId}`);
      this.logger.log(`AI Message ID: ${result.aiMessageId}`);
      
      if (result.spreadsheetMetadata) {
        this.logger.log(`Spreadsheet Metadata:`, JSON.stringify({
          hasSpreadsheet: result.spreadsheetMetadata.hasSpreadsheet,
          fileName: result.spreadsheetMetadata.fileName,
          totalSheets: result.spreadsheetMetadata.totalSheets,
          activeSheetIndex: result.spreadsheetMetadata.activeSheetIndex,
          sheetNames: result.spreadsheetMetadata.sheetNames
        }, null, 2));
      }

      if (!result.success) {
        this.logger.error(`Formula generation failed: ${result.error}`);
      }

      return result;

    } catch (error) {
      this.logger.error('=== Formula Generation Error ===');
      this.logger.error(`Error Type: ${error.constructor.name}`);
      this.logger.error(`Error Message: ${error.message}`);
      this.logger.error(`Stack Trace:`, error.stack);

      // Firebase 관련 오류 처리
      if (error.message?.includes('Firebase') || error.message?.includes('Firestore')) {
        this.logger.error('Firebase/Firestore Error Detected');
        throw new InternalServerErrorException('데이터베이스 연결 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }

      // OpenAI API 오류 처리
      if (error.message?.includes('OpenAI') || error.message?.includes('API')) {
        this.logger.error('OpenAI API Error Detected');
        throw new InternalServerErrorException('AI 서비스 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }

      // 검증 오류 처리
      if (error instanceof BadRequestException) {
        throw error;
      }

      // 권한 관련 오류 처리
      if (error.message?.includes('권한') || error.message?.includes('접근')) {
        throw new BadRequestException(error.message);
      }

      // 기타 서버 오류
      this.logger.error('Unexpected Error in Formula Controller');
      throw new InternalServerErrorException('서버 내부 오류가 발생했습니다. 관리자에게 문의해주세요.');
    }
  }

  // 스프레드시트 ID로 연결된 채팅들 조회
  @Get('chats/by-spreadsheet/:spreadsheetId')
  async getChatsBySpreadsheetId(
    @Param('spreadsheetId') spreadsheetId: string,
    @Query('userId') userId: string
  ) {
    this.logger.log(`스프레드시트 연결 채팅 조회: ${spreadsheetId}, 사용자: ${userId}`);
    
    if (!userId) {
      throw new BadRequestException('사용자 ID가 필요합니다.');
    }

    const chats = await this.formulaService.getChatsBySpreadsheetId(spreadsheetId, userId);
    
    return {
      success: true,
      spreadsheetId,
      chats,
      totalCount: chats.length
    };
  }

  // 채팅 ID로 연결된 스프레드시트 ID 조회
  @Get('spreadsheet/by-chat/:chatId')
  async getSpreadsheetIdByChat(@Param('chatId') chatId: string) {
    this.logger.log(`채팅 연결 스프레드시트 ID 조회: ${chatId}`);
    
    const spreadsheetId = await this.formulaService.getSpreadsheetIdByChat(chatId);
    
    return {
      success: true,
      chatId,
      spreadsheetId,
      hasSpreadsheet: !!spreadsheetId
    };
  }
}

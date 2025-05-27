// src/modules/normalchat/normalchat.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  HttpStatus, 
  HttpCode, 
  BadRequestException, 
  Logger,
  UsePipes,
  ValidationPipe,
  InternalServerErrorException
} from '@nestjs/common';
import { NormalChatService } from './normal.service';
import { NormalChatDto, NormalChatResponseDto } from './dto/normal-chat.dto';

@Controller('normal')
export class NormalChatController {
  private readonly logger = new Logger(NormalChatController.name);
  
  constructor(private readonly normalChatService: NormalChatService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ 
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true 
  }))
  async chat(
    @Body() normalChatDto: NormalChatDto
  ): Promise<NormalChatResponseDto> {
    // 요청 데이터 로깅
    this.logger.log('=== Normal Chat Request ===');
    this.logger.log(`UserInput: ${normalChatDto.userInput}`);
    this.logger.log(`User ID: ${normalChatDto.userId}`);
    this.logger.log(`Chat ID: ${normalChatDto.chatId || 'NEW CHAT'}`);
    this.logger.log(`Chat Title: ${normalChatDto.chatTitle || 'N/A'}`);
    this.logger.log(`Message ID: ${normalChatDto.messageId || 'N/A'}`);
    this.logger.log(`Language: ${normalChatDto.language || 'ko'}`);
    
    // 스프레드시트 컨텍스트 로깅
    this.logger.log(`Has extendedSheetContext: ${!!normalChatDto.extendedSheetContext}`);
    this.logger.log(`Has sheetsData: ${!!normalChatDto.sheetsData}`);
    this.logger.log(`Has currentData (legacy): ${!!normalChatDto.currentData}`);
    
    if (normalChatDto.extendedSheetContext) {
      this.logger.log(`Extended SheetContext:`, JSON.stringify({
        sheetName: normalChatDto.extendedSheetContext.sheetName,
        sheetIndex: normalChatDto.extendedSheetContext.sheetIndex,
        totalSheets: normalChatDto.extendedSheetContext.totalSheets,
        headerCount: normalChatDto.extendedSheetContext.headers?.length || 0
      }, null, 2));
    }

    // 새로운 sheetsData 로깅
    if (normalChatDto.sheetsData) {
      this.logger.log(`SheetsData Info:`, JSON.stringify({
        fileName: normalChatDto.sheetsData.fileName,
        totalSheets: normalChatDto.sheetsData.sheets?.length || 0,
        activeSheet: normalChatDto.sheetsData.activeSheet,
        sheetsInfo: normalChatDto.sheetsData.sheets?.map(sheet => ({
          name: sheet.name,
          rowCount: sheet.metadata?.rowCount || 0,
          columnCount: sheet.metadata?.columnCount || 0,
          hasFullData: !!sheet.metadata?.fullData,
          hasCsvData: !!sheet.csv,
          csvSize: sheet.csv?.length || 0
        })) || []
      }, null, 2));
    }

    // 필수 필드 검증
    if (!normalChatDto.userId) {
      this.logger.error('Missing required field: userId');
      throw new BadRequestException('사용자 ID가 필요합니다.');
    }

    if (!normalChatDto.userInput?.trim()) {
      this.logger.error('Missing or empty userInput');
      throw new BadRequestException('사용자 입력이 필요합니다.');
    }

    // 새 채팅인 경우 제목 검증
    if (!normalChatDto.chatId && !normalChatDto.chatTitle) {
      this.logger.log('New chat without title, will auto-generate from userInput');
    }
    
    try {
      this.logger.log('=== Processing Normal Chat Request ===');
      const startTime = Date.now();
      
      const result = await this.normalChatService.chat(normalChatDto);
      
      const processingTime = Date.now() - startTime;
      this.logger.log('=== Normal Chat Response ===');
      this.logger.log(`Processing Time: ${processingTime}ms`);
      this.logger.log(`Success: ${result.success}`);
      this.logger.log(`Chat ID: ${result.chatId}`);
      this.logger.log(`User Message ID: ${result.userMessageId}`);
      this.logger.log(`AI Message ID: ${result.aiMessageId}`);
      this.logger.log(`Response Length: ${result.message?.length || 0} characters`);
      this.logger.log(`Has Spreadsheet Metadata: ${!!result.spreadsheetMetadata}`);
      
      if (result.spreadsheetMetadata) {
        this.logger.log(`Spreadsheet Metadata:`, JSON.stringify({
          fileName: result.spreadsheetMetadata.fileName,
          totalSheets: result.spreadsheetMetadata.totalSheets,
          activeSheetIndex: result.spreadsheetMetadata.activeSheetIndex,
          sheetNames: result.spreadsheetMetadata.sheetNames
        }, null, 2));
      }

      if (!result.success) {
        this.logger.error(`Chat processing failed: ${result.error}`);
      }
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - (Date.now()); // 에러 발생 시점 계산을 위해
      this.logger.error('=== Normal Chat Error ===');
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
      this.logger.error('Unexpected Error in Normal Chat Controller');
      throw new InternalServerErrorException('서버 내부 오류가 발생했습니다. 관리자에게 문의해주세요.');
    }
  }
}
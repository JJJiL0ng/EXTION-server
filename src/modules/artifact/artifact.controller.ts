// src/modules/artifact/artifact.controller.ts - 에러 핸들링 강화
import { Controller, Post, Body, HttpStatus, HttpCode, BadRequestException, Logger, UsePipes, ValidationPipe, InternalServerErrorException, Get, Param, Query } from '@nestjs/common';
import { ArtifactService } from './artifact.service';
import { GenerateArtifactDto, ArtifactResponseDto } from './dto/generate-artifact.dto';

@Controller('artifact')
export class ArtifactController {
  private readonly logger = new Logger(ArtifactController.name);
  
  constructor(private readonly artifactService: ArtifactService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true
  }))
  async generateArtifact(
    @Body() generateArtifactDto: GenerateArtifactDto
  ): Promise<ArtifactResponseDto> {
    // 요청 데이터 로깅
    this.logger.log('=== Artifact Generation Request ===');
    this.logger.log(`UserInput: ${generateArtifactDto.userInput}`);
    this.logger.log(`User ID: ${generateArtifactDto.userId}`);
    this.logger.log(`Chat ID: ${generateArtifactDto.chatId || 'NEW CHAT'}`);
    this.logger.log(`Chat Title: ${generateArtifactDto.chatTitle || 'N/A'}`);
    this.logger.log(`Message ID: ${generateArtifactDto.messageId || 'N/A'}`);
    this.logger.log(`Language: ${generateArtifactDto.language || 'ko'}`);

    // 스프레드시트 데이터 로깅
    if (generateArtifactDto.spreadsheetData) {
      this.logger.log('=== Spreadsheet Data ===');
      this.logger.log(`File Name: ${generateArtifactDto.spreadsheetData.fileName || 'N/A'}`);
      this.logger.log(`Active Sheet: ${generateArtifactDto.spreadsheetData.activeSheet}`);
      this.logger.log(`Total Sheets: ${generateArtifactDto.spreadsheetData.sheets?.length || 0}`);
      
      if (generateArtifactDto.spreadsheetData.sheets?.length > 0) {
        const firstSheet = generateArtifactDto.spreadsheetData.sheets[0];
        this.logger.log(`First Sheet Name: ${firstSheet.name}`);
        this.logger.log(`Headers Count: ${firstSheet.headers?.length || 0}`);
        this.logger.log(`Data Rows Count: ${firstSheet.data?.length || 0}`);
      }
    }

    // 필수 필드 검증
    if (!generateArtifactDto.userId) {
      this.logger.error('Missing required field: userId');
      throw new BadRequestException('사용자 ID가 필요합니다.');
    }

    if (!generateArtifactDto.userInput?.trim()) {
      this.logger.error('Missing or empty userInput');
      throw new BadRequestException('사용자 입력이 필요합니다.');
    }

    // 새 채팅인 경우 제목 검증
    if (!generateArtifactDto.chatId && !generateArtifactDto.chatTitle) {
      this.logger.log('New chat without title, will auto-generate from userInput');
    }

    try {
      this.logger.log('=== Processing Artifact Generation Request ===');
      const startTime = Date.now();

      const result = await this.artifactService.generateArtifact(generateArtifactDto);

      const processingTime = Date.now() - startTime;
      this.logger.log('=== Artifact Generation Response ===');
      this.logger.log(`Processing Time: ${processingTime}ms`);
      this.logger.log(`Success: ${result.success}`);
      this.logger.log(`Chat ID: ${result.chatId}`);
      this.logger.log(`User Message ID: ${result.userMessageId}`);
      this.logger.log(`AI Message ID: ${result.aiMessageId}`);
      this.logger.log(`Response Length: ${result.code?.length || 0} characters`);
      
      if (result.spreadsheetMetadata) {
        this.logger.log(`Spreadsheet Metadata:`, JSON.stringify({
          fileName: result.spreadsheetMetadata.fileName,
          totalSheets: result.spreadsheetMetadata.totalSheets,
          activeSheetIndex: result.spreadsheetMetadata.activeSheetIndex,
          sheetNames: result.spreadsheetMetadata.sheetNames
        }, null, 2));
      }

      if (!result.success) {
        this.logger.error(`Artifact generation failed: ${result.error}`);
      }

      return result;

    } catch (error) {
      const processingTime = Date.now() - (Date.now()); // 에러 발생 시점 계산을 위해
      this.logger.error('=== Artifact Generation Error ===');
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
      this.logger.error('Unexpected Error in Artifact Controller');
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

    const chats = await this.artifactService.getChatsBySpreadsheetId(spreadsheetId, userId);
    
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
    
    const spreadsheetId = await this.artifactService.getSpreadsheetIdByChat(chatId);
    
    return {
      success: true,
      chatId,
      spreadsheetId,
      hasSpreadsheet: !!spreadsheetId
    };
  }
}
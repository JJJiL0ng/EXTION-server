// src/modules/datageneration/datageneration.controller.ts
import { Controller, Post, Body, HttpStatus, HttpCode, BadRequestException, Logger, Get, Param, Query } from '@nestjs/common';
import { DataGenerationService } from './datageneration.service';
import { GenerateDataDto, DataGenerationResponseDto } from './dto/generate-data.dto';

@Controller('datagenerate')
export class DataGenerationController {
  private readonly logger = new Logger(DataGenerationController.name);
  
  constructor(private readonly dataGenerationService: DataGenerationService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateData(
    @Body() generateDataDto: GenerateDataDto
  ): Promise<DataGenerationResponseDto> {
    // 요청 데이터 로깅
    this.logger.log('=== Data Generation Request ===');
    this.logger.log(`UserInput: ${generateDataDto.userInput}`);
    this.logger.log(`Has extendedSheetContext: ${!!generateDataDto.extendedSheetContext}`);
    this.logger.log(`Has currentData: ${!!generateDataDto.currentData}`);
    
    if (generateDataDto.extendedSheetContext) {
      this.logger.log(`Extended SheetContext:`, JSON.stringify({
        sheetName: generateDataDto.extendedSheetContext.sheetName,
        sheetIndex: generateDataDto.extendedSheetContext.sheetIndex,
        totalSheets: generateDataDto.extendedSheetContext.totalSheets,
        headerCount: generateDataDto.extendedSheetContext.headers.length
      }, null, 2));
    }
    
    try {
      return await this.dataGenerationService.generateData(generateDataDto);
    } catch (error) {
      this.logger.error('Error in data generation:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(error.message || 'Invalid request data');
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

    const chats = await this.dataGenerationService.getChatsBySpreadsheetId(spreadsheetId, userId);
    
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
    
    const spreadsheetId = await this.dataGenerationService.getSpreadsheetIdByChat(chatId);
    
    return {
      success: true,
      chatId,
      spreadsheetId,
      hasSpreadsheet: !!spreadsheetId
    };
  }
}
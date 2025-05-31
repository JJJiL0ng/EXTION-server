import { Controller, Post, Body, Logger, Get, Param, Query } from '@nestjs/common';
import { DataFixService } from './datafix.service';
import { ProcessDataDto, DataFixResponseDto } from './dto/process-data.dto';

@Controller('datafix')
export class DataFixController {
  private readonly logger = new Logger(DataFixController.name);

  constructor(private readonly dataFixService: DataFixService) {}

  @Post('process')
  async processData(@Body() processDataDto: ProcessDataDto): Promise<DataFixResponseDto> {
    this.logger.log(`데이터 수정 요청 받음: ${processDataDto.userInput}`);
    return this.dataFixService.processData(processDataDto);
  }

  // 스프레드시트 ID로 연결된 채팅들 조회
  @Get('chats/by-spreadsheet/:spreadsheetId')
  async getChatsBySpreadsheetId(
    @Param('spreadsheetId') spreadsheetId: string,
    @Query('userId') userId: string
  ) {
    this.logger.log(`스프레드시트 연결 채팅 조회: ${spreadsheetId}, 사용자: ${userId}`);
    
    if (!userId) {
      throw new Error('사용자 ID가 필요합니다.');
    }

    const chats = await this.dataFixService.getChatsBySpreadsheetId(spreadsheetId, userId);
    
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
    
    const spreadsheetId = await this.dataFixService.getSpreadsheetIdByChat(chatId);
    
    return {
      success: true,
      chatId,
      spreadsheetId,
      hasSpreadsheet: !!spreadsheetId
    };
  }
}

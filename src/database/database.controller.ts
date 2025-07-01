import { Controller, Get, Param, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { ChatSheetDataResponseDto } from './dto/chat-sheet-data.dto';

@Controller('chatandsheet')
export class DatabaseController {
  private readonly logger = new Logger(DatabaseController.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @Get('load/:chatid')
  async loadChatSheetData(@Param('chatid') chatId: string): Promise<ChatSheetDataResponseDto> {
    try {
      this.logger.log(`채팅 시트 데이터 로드 요청: chatId=${chatId}`);
      
      const result = await this.databaseService.getChatSheetData(chatId);
      
      this.logger.log(`채팅 시트 데이터 로드 완료: chatId=${chatId}`);
      return result;
    } catch (error) {
      this.logger.error(`채팅 시트 데이터 로드 실패: chatId=${chatId}, error=${error.message}`, error.stack);
      
      if (error.message.includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

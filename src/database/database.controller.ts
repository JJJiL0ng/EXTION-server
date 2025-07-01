import { Controller, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { ChatSheetDataResponseDto } from './dto/chat-sheet-data.dto';

@Controller('chatandsheet')
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get('load/:chatid')
  async loadChatSheetData(@Param('chatid') chatId: string): Promise<ChatSheetDataResponseDto> {
    try {
      return await this.databaseService.getChatSheetData(chatId);
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

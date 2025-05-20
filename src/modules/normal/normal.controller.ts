// src/modules/normalchat/normalchat.controller.ts
import { Controller, Post, Body, HttpStatus, HttpCode, BadRequestException, Logger } from '@nestjs/common';
import { NormalChatService } from './normal.service';
import { NormalChatDto, NormalChatResponseDto } from './dto/normal-chat.dto';

@Controller('normal')
export class NormalChatController {
  private readonly logger = new Logger(NormalChatController.name);
  
  constructor(private readonly normalChatService: NormalChatService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Body() normalChatDto: NormalChatDto
  ): Promise<NormalChatResponseDto> {
    // 요청 데이터 로깅
    this.logger.log('=== Normal Chat Request ===');
    this.logger.log(`UserInput: ${normalChatDto.userInput}`);
    this.logger.log(`Has extendedSheetContext: ${!!normalChatDto.extendedSheetContext}`);
    this.logger.log(`Has currentData: ${!!normalChatDto.currentData}`);
    
    if (normalChatDto.extendedSheetContext) {
      this.logger.log(`Extended SheetContext:`, JSON.stringify({
        sheetName: normalChatDto.extendedSheetContext.sheetName,
        sheetIndex: normalChatDto.extendedSheetContext.sheetIndex,
        totalSheets: normalChatDto.extendedSheetContext.totalSheets,
        headerCount: normalChatDto.extendedSheetContext.headers.length
      }, null, 2));
    }
    
    try {
      return await this.normalChatService.chat(normalChatDto);
    } catch (error) {
      this.logger.error('Error in normal chat:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(error.message || 'Invalid request data');
    }
  }
}
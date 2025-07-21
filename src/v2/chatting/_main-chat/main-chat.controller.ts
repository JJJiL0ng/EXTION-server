// src/v2/chatting/_main-chat/main-chat.controller.ts
import { Controller } from '@nestjs/common';
import { 
  Post, 
  Get, 
  Body, 
  Param, 
  Query, 
  Sse, 
  Req,
  HttpStatus,
  HttpCode,
  Logger,
  ParseIntPipe,
  DefaultValuePipe
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { MainChatService } from './main-chat.service';
import { MainChatRequestDto } from './dto/main-chat-req.dto';

interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email?: string;
  };
}
@Controller('v2/main-chat')
export class MainChatController {
  private readonly logger = new Logger(MainChatController.name);

  constructor(private readonly mainChatService: MainChatService) {}

  /**
   * SSE 스트리밍 채팅 엔드포인트
   */
  @Sse('stream')
  async streamChat(
    @Body() request: MainChatRequestDto,
    @Req() req: AuthenticatedRequest
  ): Promise<Observable<string>> {
    const userId = req.user.uid;

    this.logger.log(
      `SSE chat stream request from user: ${userId}, ` +
      `chatId: ${request.chatId || 'new'}, ` +
      `spreadsheetId: ${request.spreadsheetId || 'none'}`
    );

    return this.mainChatService.streamChat(request, userId);
  }

  /**
   * 채팅 기록 조회
   */
  @Get(':chatId/history')
  async getChatHistory(
    @Param('chatId') chatId: string,
    @Query('limit', new DefaultValuePipe(50), new ParseIntPipe()) limit: number,
    @Query('offset', new DefaultValuePipe(0), new ParseIntPipe()) offset: number,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.uid;
    
    // 한번에 가져올 수 있는 메시지 수 제한
    const maxLimit = Math.min(limit, 100);
    
    this.logger.log(
      `Getting chat history for user: ${userId}, ` +
      `chatId: ${chatId}, limit: ${maxLimit}, offset: ${offset}`
    );

    return this.mainChatService.getChatHistory(chatId, userId, maxLimit, offset);
  }

  /**
   * 사용자 채팅 목록 조회
   */
  @Get('list')
  async getUserChats(
    @Query('limit', new DefaultValuePipe(20), new ParseIntPipe()) limit: number,
    @Query('offset', new DefaultValuePipe(0), new ParseIntPipe()) offset: number,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user.uid;
    
    // 한번에 가져올 수 있는 채팅 수 제한
    const maxLimit = Math.min(limit, 50);
    
    this.logger.log(
      `Getting chat list for user: ${userId}, ` +
      `limit: ${maxLimit}, offset: ${offset}`
    );

    return this.mainChatService.getUserChats(userId, maxLimit, offset);
  }

  /**
   * 헬스 체크 엔드포인트
   */
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'main-chat-v2'
    };
  }
}

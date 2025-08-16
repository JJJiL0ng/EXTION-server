// src/v2/chatting/_main-chat/main-chat.controller.ts

import { Controller, Post, Body, Get, Res, Req, Logger, Param, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { Response, Request } from 'express'; // express의 Response, Request 타입을 가져옵니다.
import { Observable } from 'rxjs';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { MainChatService } from './main-chat.service';
import { MainChatRequestDto, GetChatHistoryDto, GetUserChatList } from './dto/main-chat-req.dto';
import { ChatHistoryResponseDto, UserChatListResponseDto, HealthResponseDto, ErrorResponseDto } from './dto/main-chat-res.dto';

@ApiTags('Main Chat')
@Controller('v2/main-chat')
export class MainChatController {
  private readonly logger = new Logger(MainChatController.name);

  constructor(private readonly mainChatService: MainChatService) {}

  /**
   * SSE 스트리밍 채팅 엔드포인트
   */
  @ApiOperation({ summary: 'AI 채팅 스트리밍', description: 'Server-Sent Events를 통한 실시간 AI 채팅 응답' })
  @ApiBody({ type: MainChatRequestDto })
  @ApiResponse({ status: 200, description: 'SSE 스트림 성공', content: { 'text/event-stream': { schema: { type: 'string' } } } })
  @ApiResponse({ status: 400, description: '잘못된 요청', type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: '서버 오류', type: ErrorResponseDto })
  @Post('stream')
  streamChat(
    @Body() request: MainChatRequestDto,
    @Res({ passthrough: false }) res: Response,
    @Req() req: Request,
  ) {
    this.logger.log(
      `SSE chat stream request from user: ${request.userId}, ` +
      `chatId: ${request.chatId || 'new'}`
    );

    // 1. SSE 통신을 위한 필수 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // (선택사항) Nginx 프록시 환경에서의 버퍼링 방지
    res.flushHeaders(); // 헤더를 즉시 클라이언트로 보냅니다.

    // 2. 서비스로부터 Observable 스트림을 받음
    const stream$ = this.mainChatService.streamChat(request);

    const subscription = stream$.subscribe({
      next: (data) => {
        // 3. 데이터를 받을 때마다 클라이언트로 즉시 전송
        res.write(data);
      },
      error: (err) => {
        this.logger.error('Stream subscription error:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Stream error' });
        } else {
          res.end(); // 헤더가 이미 보내졌으면 연결만 종료
        }
      },
      complete: () => {
        this.logger.log('Stream subscription completed. Closing connection.');
        res.end(); // 스트림이 완료되면 연결을 정상적으로 종료
      },
    });

    // 4. (매우 중요) 클라이언트가 연결을 끊었을 때 서버 쪽 리소스 정리
    req.on('close', () => {
      this.logger.warn('Client closed connection. Unsubscribing from stream.');
      subscription.unsubscribe();
    });
  }

  /**
   * 채팅 기록 조회
   */
  @ApiOperation({ summary: '채팅 기록 조회', description: '특정 채팅방의 메시지 기록을 페이지네이션으로 조회' })
  @ApiParam({ name: 'chatId', description: '채팅방 ID' })
  @ApiQuery({ name: 'limit', description: '조회할 메시지 수 (최대 100)', required: false, type: Number })
  @ApiQuery({ name: 'offset', description: '시작 위치', required: false, type: Number })
  @ApiBody({ type: GetChatHistoryDto })
  @ApiResponse({ status: 200, description: '채팅 기록 조회 성공', type: ChatHistoryResponseDto })
  @ApiResponse({ status: 400, description: '잘못된 요청', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: '채팅방을 찾을 수 없음', type: ErrorResponseDto })
  @Get(':chatId/history')
  async getChatHistory(
    @Param('chatId') chatId: string,
    @Body() request: GetChatHistoryDto, // GET 요청에서는 Body 대신 Query나 Param을 사용하는 것이 표준적입니다.
    @Query('limit', new DefaultValuePipe(50), new ParseIntPipe()) limit: number,
    @Query('offset', new DefaultValuePipe(0), new ParseIntPipe()) offset: number,
  ) {
    const userId = request.userId;
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
  @ApiOperation({ summary: '사용자 채팅 목록 조회', description: '사용자의 모든 채팅방 목록을 페이지네이션으로 조회' })
  @ApiQuery({ name: 'limit', description: '조회할 채팅 수 (최대 50)', required: false, type: Number })
  @ApiQuery({ name: 'offset', description: '시작 위치', required: false, type: Number })
  @ApiBody({ type: GetUserChatList })
  @ApiResponse({ status: 200, description: '채팅 목록 조회 성공', type: UserChatListResponseDto })
  @ApiResponse({ status: 400, description: '잘못된 요청', type: ErrorResponseDto })
  @Get('list')
  async getUserChats(
    @Body() request: GetUserChatList, // GET 요청에서는 Body 대신 Query나 Param을 사용하는 것이 표준적입니다.
    @Query('limit', new DefaultValuePipe(20), new ParseIntPipe()) limit: number,
    @Query('offset', new DefaultValuePipe(0), new ParseIntPipe()) offset: number,
  ) {
    const userId = request.userId;
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
  @ApiOperation({ summary: '헬스 체크', description: '서비스 상태 확인' })
  @ApiResponse({ status: 200, description: '서비스 정상', type: HealthResponseDto })
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'main-chat-v2'
    };
  }
}
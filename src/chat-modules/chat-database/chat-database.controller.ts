import { 
  Controller, 
  Get, 
  Param, 
  Query,
  Logger,
  BadRequestException,
  NotFoundException,
  UsePipes,
  ValidationPipe 
} from '@nestjs/common';
import { ChatDatabaseService } from './chat-database.service';
import { 
  LoadChatRequestDto, 
  LoadChatResponseDto,
  ChatListRequestDto,
  ChatListResponseDto 
} from './dto';

@Controller('chat-database')
export class ChatDatabaseController {
  private readonly logger = new Logger(ChatDatabaseController.name);

  constructor(private readonly chatDatabaseService: ChatDatabaseService) {}

  /**
   * 채팅 ID로 채팅 로그 불러오기
   * GET /chat-database/load/:chatId
   */
  @Get('load/:chatId')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async loadChatMessages(
    @Param('chatId') chatId: string,
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
  ): Promise<LoadChatResponseDto> {
    try {
      if (!userId) {
        throw new BadRequestException('사용자 ID가 필요합니다.');
      }

      if (!chatId) {
        throw new BadRequestException('채팅 ID가 필요합니다.');
      }

      this.logger.log(`채팅 로그 불러오기 요청: chatId=${chatId}, userId=${userId}`);

      // 채팅방 존재 여부 및 접근 권한 확인
      const chatExists = await this.chatDatabaseService.chatExists(chatId, userId);
      
      if (!chatExists) {
        throw new NotFoundException('채팅방을 찾을 수 없거나 접근 권한이 없습니다.');
      }

      // 메시지 제한 수 파싱 (기본값: 무제한)
      const messageLimit = limit ? parseInt(limit, 10) : undefined;
      
      if (messageLimit && (messageLimit <= 0 || messageLimit > 1000)) {
        throw new BadRequestException('메시지 제한 수는 1-1000 사이여야 합니다.');
      }

      // 채팅 메시지 불러오기
      const messages = await this.chatDatabaseService.getChatMessages(
        chatId,
        userId,
        messageLimit
      );

      // 채팅 정보 가져오기 (선택적)
      const chatInfo = await this.chatDatabaseService.getChatInfo(chatId, userId);

      this.logger.log(`채팅 로그 불러오기 완료: ${messages.length}개 메시지`);

      return {
        success: true,
        chatId,
        messages,
        messageCount: messages.length,
        chatInfo: {
          title: chatInfo?.title,
          createdAt: chatInfo?.createdAt,
          updatedAt: chatInfo?.updatedAt,
          totalMessageCount: chatInfo?.messageCount,
          sheetMetaDataId: chatInfo?.sheetMetaDataId,
        },
      };

    } catch (error) {
      this.logger.error(`채팅 로그 불러오기 실패: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new BadRequestException('채팅 로그를 불러오는 중 오류가 발생했습니다.');
    }
  }

  /**
   * 사용자의 모든 채팅 목록 가져오기
   * GET /chat-database/list
   */
  @Get('list')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getChatList(@Query('userId') userId: string): Promise<ChatListResponseDto> {
    try {
      if (!userId) {
        throw new BadRequestException('사용자 ID가 필요합니다.');
      }

      this.logger.log(`채팅 목록 조회 요청: userId=${userId}`);

      const chatList = await this.chatDatabaseService.getChatList(userId);

      return {
        success: true,
        chats: chatList,
        count: chatList.length,
      };

    } catch (error) {
      this.logger.error(`채팅 목록 조회 실패: ${error.message}`, error.stack);
      throw new BadRequestException('채팅 목록을 불러오는 중 오류가 발생했습니다.');
    }
  }
}

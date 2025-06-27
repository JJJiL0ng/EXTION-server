import { 
  Controller, 
  Get, 
  Post,
  Delete,
  Patch,
  Param, 
  Query,
  Body,
  Logger,
  BadRequestException,
  NotFoundException,
  UsePipes,
  ValidationPipe,
  ForbiddenException
} from '@nestjs/common';
import { ChatDatabaseService } from './chat-database.service';
import { 
  LoadChatRequestDto, 
  LoadChatResponseDto,
  ChatListRequestDto,
  ChatListResponseDto,
  CreateChatDto,
  CreateChatResponseDto,
  DeleteChatResponseDto,
  UpdateChatTitleDto,
  UpdateChatTitleResponseDto
} from './dto';
import { AuthService } from '../../auth-modules/auth/auth.service';

@Controller('chat-database')
export class ChatDatabaseController {
  private readonly logger = new Logger(ChatDatabaseController.name);

  constructor(
    private readonly chatDatabaseService: ChatDatabaseService,
    private readonly authService: AuthService
  ) {}

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
      
      this.logger.log(`채팅 존재 확인 결과: chatExists=${chatExists}`);
      
      if (!chatExists) {
        this.logger.warn(`채팅을 찾을 수 없음: chatId=${chatId}, userId=${userId}`);
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
   * 어드민용: 채팅 ID로 채팅 로그 불러오기 (권한 체크 우회)
   * GET /chat-database/admin/load/:chatId
   */
  @Get('admin/load/:chatId')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async adminLoadChatMessages(
    @Param('chatId') chatId: string,
    @Query('adminUserId') adminUserId: string,
    @Query('limit') limit?: string,
  ): Promise<LoadChatResponseDto> {
    try {
      if (!adminUserId) {
        throw new BadRequestException('어드민 사용자 ID가 필요합니다.');
      }

      if (!chatId) {
        throw new BadRequestException('채팅 ID가 필요합니다.');
      }

      // 어드민 권한 확인
      const adminCheck = await this.authService.checkAdminPermission(adminUserId);
      if (!adminCheck.isAdmin) {
        throw new ForbiddenException('어드민 권한이 필요합니다.');
      }

      this.logger.log(`어드민 채팅 로그 불러오기 요청: chatId=${chatId}, adminUserId=${adminUserId}`);

      // 메시지 제한 수 파싱 (기본값: 무제한)
      const messageLimit = limit ? parseInt(limit, 10) : undefined;
      
      if (messageLimit && (messageLimit <= 0 || messageLimit > 1000)) {
        throw new BadRequestException('메시지 제한 수는 1-1000 사이여야 합니다.');
      }

      // 채팅 메시지 불러오기 (권한 체크 우회)
      const messages = await this.chatDatabaseService.getAdminChatMessages(chatId, messageLimit);

      // 채팅 정보 가져오기 (권한 체크 우회)
      const chatInfo = await this.chatDatabaseService.getAdminChatInfo(chatId);

      this.logger.log(`어드민 채팅 로그 불러오기 완료: ${messages.length}개 메시지`);

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
      this.logger.error(`어드민 채팅 로그 불러오기 실패: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
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

  /**
   * 어드민용: 모든 채팅 목록 가져오기
   * GET /chat-database/admin/all-chats
   */
  @Get('admin/all-chats')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getAllChats(@Query('adminUserId') adminUserId: string): Promise<ChatListResponseDto> {
    try {
      if (!adminUserId) {
        throw new BadRequestException('어드민 사용자 ID가 필요합니다.');
      }

      // 어드민 권한 확인
      const adminCheck = await this.authService.checkAdminPermission(adminUserId);
      if (!adminCheck.isAdmin) {
        throw new ForbiddenException('어드민 권한이 필요합니다.');
      }

      this.logger.log(`어드민 모든 채팅 목록 조회 요청: adminUserId=${adminUserId}`);

      const chatList = await this.chatDatabaseService.getAllChats();

      return {
        success: true,
        chats: chatList,
        count: chatList.length,
      };

    } catch (error) {
      this.logger.error(`모든 채팅 목록 조회 실패: ${error.message}`, error.stack);
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException('채팅 목록을 불러오는 중 오류가 발생했습니다.');
    }
  }

  /**
   * 어드민용: 특정 사용자의 채팅 목록 가져오기
   * GET /chat-database/admin/user/:userId/chats
   */
  @Get('admin/user/:userId/chats')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getUserChats(
    @Param('userId') userId: string,
    @Query('adminUserId') adminUserId: string
  ): Promise<ChatListResponseDto> {
    try {
      if (!adminUserId) {
        throw new BadRequestException('어드민 사용자 ID가 필요합니다.');
      }

      if (!userId) {
        throw new BadRequestException('대상 사용자 ID가 필요합니다.');
      }

      // 어드민 권한 확인
      const adminCheck = await this.authService.checkAdminPermission(adminUserId);
      if (!adminCheck.isAdmin) {
        throw new ForbiddenException('어드민 권한이 필요합니다.');
      }

      this.logger.log(`어드민 특정 사용자 채팅 목록 조회: userId=${userId}, adminUserId=${adminUserId}`);

      const chatList = await this.chatDatabaseService.getChatList(userId);

      return {
        success: true,
        chats: chatList,
        count: chatList.length,
      };

    } catch (error) {
      this.logger.error(`특정 사용자 채팅 목록 조회 실패: ${error.message}`, error.stack);
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException('채팅 목록을 불러오는 중 오류가 발생했습니다.');
    }
  }

  /**
   * 새 채팅 생성
   * POST /chat-database/create
   */
  @Post('create')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createChat(@Body() createChatDto: CreateChatDto): Promise<CreateChatResponseDto> {
    try {
      const { title, userId, spreadsheetId } = createChatDto;

      if (!title) {
        throw new BadRequestException('채팅 제목이 필요합니다.');
      }

      if (!userId) {
        throw new BadRequestException('사용자 ID가 필요합니다.');
      }

      this.logger.log(`새 채팅 생성 요청: title=${title}, userId=${userId}, spreadsheetId=${spreadsheetId}`);

      const newChat = await this.chatDatabaseService.createChat(title, userId, spreadsheetId);

      this.logger.log(`새 채팅 생성 완료: chatId=${newChat.chatId}`);

      return {
        success: true,
        chatId: newChat.chatId,
        chat: newChat,
      };

    } catch (error) {
      this.logger.error(`새 채팅 생성 실패: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException('새 채팅을 생성하는 중 오류가 발생했습니다.');
    }
  }

  /**
   * 채팅 삭제
   * DELETE /chat-database/:chatId
   */
  @Delete(':chatId')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async deleteChat(
    @Param('chatId') chatId: string,
    @Query('userId') userId: string,
  ): Promise<DeleteChatResponseDto> {
    try {
      if (!chatId) {
        throw new BadRequestException('채팅 ID가 필요합니다.');
      }

      if (!userId) {
        throw new BadRequestException('사용자 ID가 필요합니다.');
      }

      this.logger.log(`채팅 삭제 요청: chatId=${chatId}, userId=${userId}`);

      const isDeleted = await this.chatDatabaseService.deleteChat(chatId, userId);

      if (!isDeleted) {
        throw new BadRequestException('채팅을 삭제할 수 없습니다.');
      }

      this.logger.log(`채팅 삭제 완료: chatId=${chatId}`);

      return {
        success: true,
        message: '채팅이 성공적으로 삭제되었습니다.',
      };

    } catch (error) {
      this.logger.error(`채팅 삭제 실패: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new BadRequestException('채팅을 삭제하는 중 오류가 발생했습니다.');
    }
  }

  /**
   * 채팅 제목 업데이트
   * PATCH /chat-database/:chatId/title
   */
  @Patch(':chatId/title')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateChatTitle(
    @Param('chatId') chatId: string,
    @Body() updateTitleDto: UpdateChatTitleDto,
  ): Promise<UpdateChatTitleResponseDto> {
    try {
      const { title, userId } = updateTitleDto;

      if (!title || title.trim().length === 0) {
        throw new BadRequestException('채팅 제목이 필요합니다.');
      }

      if (!userId) {
        throw new BadRequestException('사용자 ID가 필요합니다.');
      }

      if (!chatId) {
        throw new BadRequestException('채팅 ID가 필요합니다.');
      }

      this.logger.log(`채팅 제목 업데이트 요청: chatId=${chatId}, userId=${userId}, title=${title}`);

      // 채팅 존재 여부 및 권한 확인
      const chatExists = await this.chatDatabaseService.chatExists(chatId, userId);
      if (!chatExists) {
        this.logger.warn(`채팅 제목 업데이트 실패 - 채팅을 찾을 수 없음: chatId=${chatId}, userId=${userId}`);
        throw new NotFoundException('채팅을 찾을 수 없거나 접근 권한이 없습니다.');
      }

      // 제목 업데이트
      const updatedChat = await this.chatDatabaseService.updateChatTitle(
        chatId,
        userId,
        title.trim()
      );

      this.logger.log(`채팅 제목 업데이트 완료: chatId=${chatId}, newTitle=${updatedChat.title}`);

      return {
        success: true,
        message: '채팅 제목이 성공적으로 업데이트되었습니다.',
        data: {
          chatId: updatedChat.id,
          title: updatedChat.title,
          updatedAt: updatedChat.updatedAt,
        },
      };

    } catch (error) {
      this.logger.error(`채팅 제목 업데이트 실패: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new BadRequestException('채팅 제목 업데이트 중 오류가 발생했습니다.');
    }
  }

  /**
   * 디버깅용: 사용자의 모든 채팅 정보 조회 (상태 포함)
   * GET /chat-database/debug/:userId
   */
  @Get('debug/:userId')
  async debugUserChats(@Param('userId') userId: string) {
    try {
      this.logger.log(`디버깅: 사용자 채팅 조회 - userId=${userId}`);

      const allChats = await this.chatDatabaseService['prismaService'].chat.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          status: true,
          messageCount: true,
          createdAt: true,
          updatedAt: true,
          sheetMetaDataId: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      this.logger.log(`디버깅 결과: ${allChats.length}개 채팅 발견`);
      allChats.forEach(chat => {
        this.logger.log(`  - chatId: ${chat.id}, status: ${chat.status}, title: ${chat.title}`);
      });

      return {
        success: true,
        userId,
        totalChats: allChats.length,
        chats: allChats,
      };

    } catch (error) {
      this.logger.error(`디버깅 조회 실패: ${error.message}`, error.stack);
      throw new BadRequestException('디버깅 조회 중 오류가 발생했습니다.');
    }
  }
}

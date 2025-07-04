import { Controller, Get, Param, HttpException, HttpStatus, Logger, Query, ForbiddenException, BadRequestException, UsePipes, ValidationPipe } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { ChatSheetDataResponseDto } from './dto/chat-sheet-data.dto';
import { AuthService } from '../auth-modules/auth/auth.service';

@Controller('chatandsheet')
export class DatabaseController {
  private readonly logger = new Logger(DatabaseController.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authService: AuthService,
  ) {}

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

  /**
   * 어드민용: 채팅 시트 데이터 로드 (권한 체크 우회)
   * GET /chatandsheet/admin/load/:chatid
   */
  @Get('admin/load/:chatid')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async adminLoadChatSheetData(
    @Param('chatid') chatId: string,
    @Query('adminUserId') adminUserId: string,
  ): Promise<ChatSheetDataResponseDto> {
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

      this.logger.log(`어드민 채팅 시트 데이터 로드 요청: chatId=${chatId}, adminUserId=${adminUserId}`);
      
      const result = await this.databaseService.getAdminChatSheetData(chatId);
      
      this.logger.log(`어드민 채팅 시트 데이터 로드 완료: chatId=${chatId}, userId=${result.chat?.userId}`);
      return result;
    } catch (error) {
      this.logger.error(`어드민 채팅 시트 데이터 로드 실패: chatId=${chatId}, error=${error.message}`, error.stack);
      
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      
      if (error.message.includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

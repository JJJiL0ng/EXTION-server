import { 
  Controller, 
  Post, 
  Body, 
  UploadedFiles, 
  UseInterceptors,
  BadRequestException,
  Logger
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { TableGenerateService } from './table-generate.service';
import { ProcessChatResponse } from './dto/table-generate.dto';

@Controller('api/chat')
export class TableGenerateController {
  private readonly logger = new Logger(TableGenerateController.name);

  constructor(private readonly tableGenerateService: TableGenerateService) {}

  @Post('process')
  @UseInterceptors(FilesInterceptor('files', 10)) // 최대 10개 파일
  async processChat(
    @UploadedFiles() files: any[],
    @Body() body: {
      chatId: string;
      userId: string;
      message: string;
      webSearchEnabled: string;
      fileNames?: string[];
      fileSizes?: string[];
    }
  ): Promise<ProcessChatResponse> {
    this.logger.log(`채팅 처리 요청 - chatId: ${body.chatId}, userId: ${body.userId}`);

    try {
      // 필수 파라미터 검증
      if (!body.chatId || !body.userId || !body.message) {
        throw new BadRequestException('필수 파라미터가 누락되었습니다. (chatId, userId, message)');
      }

      // webSearchEnabled 파라미터 변환
      const webSearchEnabled = body.webSearchEnabled === 'true';

      // 파일이 있는 경우에만 로그 기록
      if (files && files.length > 0) {
        this.logger.log(`업로드된 파일 수: ${files.length}`);
        files.forEach((file, index) => {
          this.logger.log(
            `파일 ${index + 1}: ${file.originalname} (${file.size} bytes)`,
          );
        });
      }

      // 서비스 호출
      const result = await this.tableGenerateService.processChat(
        files,
        body.chatId,
        body.userId,
        body.message,
        webSearchEnabled,
        body.fileNames,
        body.fileSizes
      );

      this.logger.log(`채팅 처리 완료 - 성공: ${result.success}`);
      return result;

    } catch (error) {
      this.logger.error(`채팅 처리 실패 - chatId: ${body.chatId}`, error);
      
      return {
        chatId: body.chatId || 'unknown',
        success: false,
        error: error.message || '처리 중 오류가 발생했습니다.',
        message: '파일 처리에 실패했습니다.',
      };
    }
  }
}

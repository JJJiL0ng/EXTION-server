import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OrchestratorChatService } from './orchestrator-chat.service';
import { 
  OrchestratorChatRequestDto, 
  OrchestratorChatResponseDto 
} from '../dto';

@Controller('orchestrator-chat')
export class OrchestratorChatController {
  constructor(
    private readonly orchestratorChatService: OrchestratorChatService
  ) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() requestDto: OrchestratorChatRequestDto
): Promise<OrchestratorChatResponseDto> {
    try {
      // 오케스트레이터 서비스로 전체 처리 위임
      const response = await this.orchestratorChatService.processMessage(requestDto);
      return response;
    } catch (error) {
      // 에러 처리 및 표준화된 에러 응답 반환
      return {
        success: false,
        chatType: null,
        sheetId: requestDto.sheetId,
        error: error.message || '메시지 처리 중 오류가 발생했습니다.',
        timestamp: new Date().toISOString()
      };
    }
  }
}
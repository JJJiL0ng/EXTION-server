import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { MultiturnChattingService } from './multiturn-chatting.service';
import { editScriptReqDto, editScriptResDto } from './dto/editScript.dto';

@Controller('v2/multiturn-chatting')
export class MultiturnChattingController {
  private readonly logger = new Logger(MultiturnChattingController.name);

  constructor(private readonly multiturnChattingService: MultiturnChattingService) {}

  /**
   * 멀티턴 채팅으로 매핑 스크립트 수정 API
   * - 현재 매핑 스크립트를 기반으로 사용자의 요청에 따라 AI가 수정
   * - 대화 히스토리를 유지하며 반복적인 수정 가능
   * - 새로운 WorkflowCode 생성 (버전 체인)
   *
   * POST /v2/multiturn-chatting/edit-script
   */
  @Post('edit-script')
  @HttpCode(HttpStatus.OK)
  async editScript(@Body() dto: editScriptReqDto): Promise<editScriptResDto> {
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    this.logger.log(
      `[${requestId}] Editing script - userId: ${dto.userId}, workFlowId: ${dto.workFlowId}, workFlowCodeId: ${dto.workFlowCodeId}, message: "${dto.message.substring(0, 50)}..."`,
    );

    try {
      const result = await this.multiturnChattingService.editMappingScript(dto);
      this.logger.log(`[${requestId}] Script edited successfully for user: ${dto.userId} - newWorkflowCodeId: ${result.workFlowCodeId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `[${requestId}] Failed to edit script: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

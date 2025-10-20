import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { MappingScriptMakerService } from './mapping-script-maker.service';
import {
  CreateMappingScriptReqDto,
  CreateMappingScriptResDto,
} from './dto/mappingScript.dto';

@Controller('v2/mapping-script-maker')
export class MappingScriptMakerController {
  private readonly logger = new Logger(MappingScriptMakerController.name);

  constructor(private readonly mappingScriptMakerService: MappingScriptMakerService) {}

  /**
   * 매핑 스크립트 생성 API (AI 사용)
   * - WorkflowCode의 mappingSuggestion을 기반으로 AI가 mappingScript JSON 생성
   * - 생성된 mappingScript를 WorkflowCode에 저장
   *
   * POST /v2/mapping-script-maker/create
   */
  @Post('create')
  @HttpCode(HttpStatus.OK)
  async createMappingScript(@Body() dto: CreateMappingScriptReqDto): Promise<CreateMappingScriptResDto> {
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    this.logger.log(
      `[${requestId}] Creating mapping script - userId: ${dto.userId}, workFlowCodeId: ${dto.workFlowCodeId}, model: ${dto.modelType || 'small'}`,
    );

    try {
      const result = await this.mappingScriptMakerService.createMappingScript(dto);
      this.logger.log(`[${requestId}] Mapping script created successfully for user: ${dto.userId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `[${requestId}] Failed to create mapping script: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

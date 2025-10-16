import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { SchemaConverterService } from './schema-converter.service';
import { UploadSheetsReqDto, UploadSheetsResDto } from './dto/uploadSheets.dto';
import { IsNotEmpty, IsString } from 'class-validator';

@Controller('v2/schema-converter')
export class SchemaConverterController {
  private readonly logger = new Logger(SchemaConverterController.name);

  constructor(private readonly schemaConverterService: SchemaConverterService) {}

  /**
   * sourceSheet와 targetSheet 업로드
   * - 새 워크플로우 생성 또는 기존 워크플로우에 버전 추가
   * - 선택적으로 매핑 제안 실행 (isExcuteMappingSuggestion)
   */
  @Post('uploadSheets')
  @HttpCode(HttpStatus.CREATED)
  async uploadSheets(@Body() dto: UploadSheetsReqDto): Promise<UploadSheetsResDto> {
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    this.logger.log(
      `[${requestId}] Uploading sheets - userId: ${dto.userId}, isFirstWorkFlow: ${dto.isFirstWorkFlowGenerated}, executeMappingSuggestion: ${dto.isExcuteMappingSuggestion ?? true}, workFlowId: ${dto.workFlowId || 'N/A'}`,
    );

    try {
      const result = await this.schemaConverterService.uploadSheets(dto.userId, dto);

      this.logger.log(
        `[${requestId}] Successfully uploaded sheets - workflowId: ${result.workflowId}, sourceSheetVersionId: ${result.sourceSheetVersionId}, targetSheetVersionId: ${result.targetSheetVersionId}, hasMappingSuggestions: ${!!result.mappingSuggestions}`,
      );

      return {
        success: true,
        workflowId: result.workflowId,
        sourceSheetVersionId: result.sourceSheetVersionId,
        targetSheetVersionId: result.targetSheetVersionId,
        ...(result.mappingSuggestions && { mappingSuggestions: result.mappingSuggestions }),
      };
    } catch (error) {
      this.logger.error(
        `[${requestId}] Failed to upload sheets - userId: ${dto.userId}, error: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

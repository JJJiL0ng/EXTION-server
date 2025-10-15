import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { SchemaConverterService } from './schema-converter.service';
import { UploadSheetsDto, UploadSheetsResDto } from './dto/uploadSheets.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class UploadSheetsRequestDto extends UploadSheetsDto {
  @IsNotEmpty()
  @IsString()
  userId: string;
}

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
  async uploadSheets(@Body() dto: UploadSheetsRequestDto): Promise<UploadSheetsResDto> {
    this.logger.log(
      `Uploading sheets for user: ${dto.userId}, isFirstWorkFlow: ${dto.isFirstWorkFlowGenerated}, executeMappingSuggestion: ${dto.isExcuteMappingSuggestion ?? true}`,
    );

    const result = await this.schemaConverterService.uploadSheets(dto.userId, dto);

    return {
      success: true,
      workflowId: result.workflowId,
      sourceSheetVersionId: result.sourceSheetVersionId,
      targetSheetVersionId: result.targetSheetVersionId,
      ...(result.mappingSuggestions && { mappingSuggestions: result.mappingSuggestions }),
    };
  }
}

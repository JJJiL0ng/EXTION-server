// src/modules/artifact/artifact.controller.ts - 에러 핸들링 강화
import { Controller, Post, Body, HttpStatus, HttpCode, BadRequestException, Logger } from '@nestjs/common';
import { ArtifactService } from './artifact.service';
import { GenerateArtifactDto, ArtifactResponseDto } from './dto/generate-artifact.dto';

@Controller('artifact')
export class ArtifactController {
  private readonly logger = new Logger(ArtifactController.name);
  
  constructor(private readonly artifactService: ArtifactService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateArtifact(
    @Body() generateArtifactDto: GenerateArtifactDto
  ): Promise<ArtifactResponseDto> {
    // 요청 데이터 로깅
    this.logger.log('=== Artifact Generation Request ===');
    this.logger.log(`UserInput: ${generateArtifactDto.userInput}`);
    this.logger.log(`Has sheetContext: ${!!generateArtifactDto.sheetContext}`);
    this.logger.log(`Has extendedSheetContext: ${!!generateArtifactDto.extendedSheetContext}`);
    this.logger.log(`Has sheetsData: ${!!generateArtifactDto.sheetsData}`);
    
    if (generateArtifactDto.extendedSheetContext) {
      this.logger.log(`Extended SheetContext:`, JSON.stringify(generateArtifactDto.extendedSheetContext, null, 2));
    }
    
    try {
      return await this.artifactService.generateArtifact(generateArtifactDto);
    } catch (error) {
      this.logger.error('Error in artifact generation:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(error.message || 'Invalid request data');
    }
  }
}
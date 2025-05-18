// src/modules/datageneration/datageneration.controller.ts
import { Controller, Post, Body, HttpStatus, HttpCode, BadRequestException, Logger } from '@nestjs/common';
import { DataGenerationService } from './datageneration.service';
import { GenerateDataDto, DataGenerationResponseDto } from './dto/generate-data.dto';

@Controller('datagenerate')
export class DataGenerationController {
  private readonly logger = new Logger(DataGenerationController.name);
  
  constructor(private readonly dataGenerationService: DataGenerationService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateData(
    @Body() generateDataDto: GenerateDataDto
  ): Promise<DataGenerationResponseDto> {
    // 요청 데이터 로깅
    this.logger.log('=== Data Generation Request ===');
    this.logger.log(`UserInput: ${generateDataDto.userInput}`);
    this.logger.log(`Has extendedSheetContext: ${!!generateDataDto.extendedSheetContext}`);
    this.logger.log(`Has currentData: ${!!generateDataDto.currentData}`);
    
    if (generateDataDto.extendedSheetContext) {
      this.logger.log(`Extended SheetContext:`, JSON.stringify({
        sheetName: generateDataDto.extendedSheetContext.sheetName,
        sheetIndex: generateDataDto.extendedSheetContext.sheetIndex,
        totalSheets: generateDataDto.extendedSheetContext.totalSheets,
        headerCount: generateDataDto.extendedSheetContext.headers.length
      }, null, 2));
    }
    
    try {
      return await this.dataGenerationService.generateData(generateDataDto);
    } catch (error) {
      this.logger.error('Error in data generation:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(error.message || 'Invalid request data');
    }
  }
}
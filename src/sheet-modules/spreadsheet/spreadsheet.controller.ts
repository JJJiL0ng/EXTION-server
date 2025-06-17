import {
  Controller,
  Post,
  Body,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { SpreadsheetService } from './spreadsheet.service';
import { CreateSpreadsheetDto } from './dto/spreadsheet.dto';

@Controller('spreadsheet')
export class SpreadsheetController {
  private readonly logger = new Logger(SpreadsheetController.name);
  constructor(private readonly spreadsheetService: SpreadsheetService) {}

  @Post('/save')
  async saveSpreadsheet(@Body() createSpreadsheetDto: CreateSpreadsheetDto) {
    try {
      this.logger.log(
        `스프레드시트 저장 시작: ${createSpreadsheetDto.fileName}`,
      );
      const result = await this.spreadsheetService.saveSpreadsheet(
        createSpreadsheetDto,
      );
      this.logger.log(`스프레드시트 저장 완료: ${result.id}`);

      return {
        success: true,
        message: '스프레드시트가 성공적으로 저장되었습니다.',
        data: result,
      };
    } catch (error) {
      this.logger.error('스프레드시트 저장 오류:', error);
      throw new BadRequestException(
        `데이터 저장 중 오류가 발생했습니다: ${error.message}`,
      );
    }
  }
}

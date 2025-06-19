import {
  Controller,
  Post,
  Body,
  Logger,
  BadRequestException,
  Get,
  Query,
  NotFoundException,
  Patch,
} from '@nestjs/common';
import { SpreadsheetService } from './spreadsheet.service';
import { CreateSpreadsheetDto, AutoSaveSpreadsheetDto, AutoSaveStatusDto } from './dto/spreadsheet.dto';

@Controller('spreadsheet')
export class SpreadsheetController {
  private readonly logger = new Logger(SpreadsheetController.name);
  constructor(private readonly spreadsheetService: SpreadsheetService) {}

  @Post('/data/save')
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

  // 경량화된 자동저장 엔드포인트
  @Post('/auto-save')
  async autoSave(@Body() autoSaveDto: AutoSaveSpreadsheetDto) {
    try {
      this.logger.log(
        `자동저장 큐 추가: 사용자=${autoSaveDto.userId}, 시트=${autoSaveDto.spreadsheetId}`,
      );
      
      const result = await this.spreadsheetService.queueAutoSave(autoSaveDto);
      
      return {
        success: true,
        message: '자동저장이 예약되었습니다.',
        data: result,
      };
    } catch (error) {
      this.logger.error('자동저장 큐 추가 오류:', error);
      throw new BadRequestException(
        `자동저장 예약 중 오류가 발생했습니다: ${error.message}`,
      );
    }
  }

  // 자동저장 상태 확인 엔드포인트
  @Get('/auto-save/status')
  async getAutoSaveStatus(@Query() statusDto: AutoSaveStatusDto) {
    try {
      if (!statusDto.userId || !statusDto.spreadsheetId) {
        throw new BadRequestException('userId와 spreadsheetId가 필요합니다.');
      }

      this.logger.log(
        `자동저장 상태 확인: 사용자=${statusDto.userId}, 시트=${statusDto.spreadsheetId}`,
      );

      const status = await this.spreadsheetService.getAutoSaveStatus(
        statusDto.userId,
        statusDto.spreadsheetId,
      );

      return {
        success: true,
        message: '자동저장 상태를 조회했습니다.',
        data: status,
      };
    } catch (error) {
      this.logger.error('자동저장 상태 확인 오류:', error);
      throw new BadRequestException(
        `자동저장 상태 확인 중 오류가 발생했습니다: ${error.message}`,
      );
    }
  }

  // 강제 자동저장 실행 엔드포인트
  @Patch('/auto-save/force')
  async forceAutoSave(@Body() statusDto: AutoSaveStatusDto) {
    try {
      if (!statusDto.userId || !statusDto.spreadsheetId) {
        throw new BadRequestException('userId와 spreadsheetId가 필요합니다.');
      }

      this.logger.log(
        `강제 자동저장 실행: 사용자=${statusDto.userId}, 시트=${statusDto.spreadsheetId}`,
      );

      const result = await this.spreadsheetService.forceAutoSave(
        statusDto.userId,
        statusDto.spreadsheetId,
      );

      if (!result.success) {
        throw new BadRequestException(result.message);
      }

      return {
        success: true,
        message: result.message,
        data: { forcedAt: new Date().toISOString() },
      };
    } catch (error) {
      this.logger.error('강제 자동저장 오류:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `강제 자동저장 중 오류가 발생했습니다: ${error.message}`,
      );
    }
  }

  @Get('data/load')
  async loadSpreadsheet(@Query('id') sheetId: string) {
    try {
      if (!sheetId) {
        throw new BadRequestException('sheetId가 필요합니다.');
      }
      this.logger.log(`스프레드시트 로드 시작: ${sheetId}`);
      const result = await this.spreadsheetService.getSpreadsheet(sheetId);

      if (!result) {
        throw new NotFoundException(
          `ID가 ${sheetId}인 스프레드시트를 찾을 수 없습니다.`,
        );
      }
      this.logger.log(`스프레드시트 로드 완료: ${result.id}`);

      return {
        success: true,
        message: '스프레드시트를 성공적으로 불러왔습니다.',
        data: result,
      };
    } catch (error) {
      this.logger.error('스프레드시트 로드 오류:', error);
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `데이터 로드 중 오류가 발생했습니다: ${error.message}`,
      );
    }
  }
}

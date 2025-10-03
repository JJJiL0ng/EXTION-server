// src/v2/sheet/personal-spreadsheet/personal-spreadsheet.controller.ts

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Logger,
  HttpStatus,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import {
  CreateSpreadSheetDto,
  AddNewVersionSpreadSheetDto,
  CheckAndLoadSpreadSheetDto,
  CheckAndLoadResDto,
  RenameSpreadSheetReqDto,
  RenameSpreadSheetResDto
} from './dto/table-data-json-save.dto';
import {
  LoadSpreadSheetResponse,
  DeleteResponse,
  SpreadSheetListItem,
} from '../types/spreadsheet.types';

import { AiChatService } from 'src/v2/ai-chat/ai-chat.service'; // AiChatService 임포트
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimit, RateLimitPresets } from './decorators/rate-limit.decorator';

@Controller('v2/table-data-json-save')
@UseGuards(RateLimitGuard) // 컨트롤러 전체에 Rate Limiting 적용
export class TableDataJsonSaveController {
  private readonly logger = new Logger(TableDataJsonSaveController.name);

  constructor(
    private readonly tableDataJsonSaveService: TableDataJsonSaveService,
    private readonly aiChatService: AiChatService, // AiChatService 주입
  ) { }

  /**
   * 새 스프레드시트 생성
   * Rate Limit: 1분당 20개 요청 (쓰기 작업)
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(RateLimitPresets.WRITE_OPERATION)
  async createSpreadSheet(
    @Body() dto: CreateSpreadSheetDto,
  ): Promise<{
    success: boolean;
    message: string;
    spreadSheetVersionId: string;
  }> {
    this.logger.log(`Creating spreadsheet: ${dto.fileName} with ID: ${dto.spreadsheetId}, chatId: ${dto.chatId} for user: ${dto.userId}`);

    const result = await this.tableDataJsonSaveService.createSpreadSheet(dto);

    return {
      success: true,
      message: 'SpreadSheet created successfully',
      spreadSheetVersionId: result.headVersionId
    };
  }

  /**
   * 새 버전 스프레드시트 데이터 추가
   * Rate Limit: 5분당 5개 요청 (대용량 쓰기 작업)
   */
  @Post('add-version')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(RateLimitPresets.HEAVY_OPERATION)
  async addNewVersionSpreadSheetData(
    @Body() dto: AddNewVersionSpreadSheetDto,
  ): Promise<{
    success: boolean;
    data: LoadSpreadSheetResponse;
    message: string;
  }> {
    this.logger.log(`Adding new version for spreadsheet: ${dto.spreadSheetId}, current version: ${dto.headVersionId}, user: ${dto.userId}`);

    const result = await this.tableDataJsonSaveService.addNewVersionSpreadSheetData(dto);

    return {
      success: true,
      data: result,
      message: `New version ${result.headVersionId} created successfully`
    };
  }

  /**
   * 스프레드시트 존재 확인 및 로드
   * Rate Limit: 1분당 60개 요청 (읽기 작업)
   */
  @Get('check-and-load')
  @RateLimit(RateLimitPresets.READ_OPERATION)
  async checkAndLoad(
    @Query() dto: CheckAndLoadSpreadSheetDto,
  ): Promise<CheckAndLoadResDto> {
    const isSpreadSheetExists = await this.tableDataJsonSaveService.checkSheetDataExistence(dto.spreadSheetId, dto.userId);

    if (!isSpreadSheetExists.exists) {
      return {
        exists: false,
      };
    }
    const loadspreadSheetData = await this.tableDataJsonSaveService.loadWholeTableDataJson(dto.spreadSheetId, dto.userId, isSpreadSheetExists.headVersionId!);
    const loadUserAiChatHistory = await this.aiChatService.loadUserAiChatHistory(dto.chatId, dto.userId);
    return {
      exists: true,
      fileName: isSpreadSheetExists.fileName,
      spreadSheetVersionId: isSpreadSheetExists.headVersionId,
      spreadSheetData: loadspreadSheetData,  // .spreadSheetData 제거
      chatSessionId: dto.chatId,
      chatHistory: loadUserAiChatHistory,
    };
  }

  /**
   * 스프레드시트 파일명 변경
   * Rate Limit: 1분당 20개 요청 (쓰기 작업)
   */
  @Post('rename-fileName')
  @RateLimit(RateLimitPresets.WRITE_OPERATION)
  async renameFileName(
    @Body() dto: RenameSpreadSheetReqDto,
  ): Promise<RenameSpreadSheetResDto> {
    await this.tableDataJsonSaveService.renameFileName(dto.spreadSheetId, dto.userId, dto.newFileName);
    return {
      success: true,
    };
  }

}
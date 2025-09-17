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
} from '@nestjs/common';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import {
  CreateSpreadSheetDto,
  AddNewVersionSpreadSheetDto,
  CheckAndLoadSpreadSheetDto,
  CheckAndLoadResDto
} from './dto/table-data-json-save.dto';
import {
  LoadSpreadSheetResponse,
  DeleteResponse,
  SpreadSheetListItem,
} from '../types/spreadsheet.types';

import { AiChatService } from 'src/v2/ai-chat/ai-chat.service'; // AiChatService 임포트

@Controller('v2/table-data-json-save')
export class TableDataJsonSaveController {
  private readonly logger = new Logger(TableDataJsonSaveController.name);

  constructor(
    private readonly tableDataJsonSaveService: TableDataJsonSaveService,
    private readonly aiChatService: AiChatService, // AiChatService 주입
  ) { }

  /**
   * 새 스프레드시트 생성
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async createSpreadSheet(
    @Body() dto: CreateSpreadSheetDto,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    this.logger.log(`Creating spreadsheet: ${dto.fileName} with ID: ${dto.spreadsheetId}, chatId: ${dto.chatId} for user: ${dto.userId}`);

    // const result = await this.tableDataJsonSaveService.createSpreadSheet(dto);
    await this.tableDataJsonSaveService.createSpreadSheet(dto);

    return {
      success: true,
      message: 'SpreadSheet created successfully'
    };
  }

  /**
   * 새 버전 스프레드시트 데이터 추가
   */
  @Post('add-version')
  @HttpCode(HttpStatus.CREATED)
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

  @Get('check-and-load')
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
      headVersionId: isSpreadSheetExists.headVersionId,
      spreadSheetData: loadspreadSheetData,  // .spreadSheetData 제거
      chatHistory: loadUserAiChatHistory,
    };
  }

}
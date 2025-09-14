// src/v2/sheet/personal-spreadsheet/personal-spreadsheet.controller.ts

import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Logger,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import {
  CreateSpreadSheetDto,
} from './dto/table-data-json-save.dto';
import {
  LoadSpreadSheetResponse,
  DeleteResponse,
  SpreadSheetListItem,
} from '../types/spreadsheet.types';

@Controller('v2/table-data-json-save')
export class TableDataJsonSaveController {
  private readonly logger = new Logger(TableDataJsonSaveController.name);

  constructor(
    private readonly tableDataJsonSaveService: TableDataJsonSaveService,
  ) {}

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
   * 스프레드시트 로드
   */
  @Get('load/:spreadSheetId')
  @HttpCode(HttpStatus.OK)
  async loadSpreadSheet(
    @Param('spreadSheetId') spreadSheetId: string,
    @Query('userId') userId: string,
  ): Promise<{
    success: boolean;
    data: LoadSpreadSheetResponse;
    message: string;
  }> {
    this.logger.log(`Loading spreadsheet: ${spreadSheetId} for user: ${userId}`);
    
    const result = await this.tableDataJsonSaveService.loadSpreadSheet(
      spreadSheetId,
      userId
    );

    return {
      success: true,
      data: result,
      message: 'SpreadSheet loaded successfully'
    };
  }

  /**
   * 사용자 스프레드시트 목록 조회
   */
  @Get('list')
  async getUserSpreadSheets(
    @Query('userId') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const spreadSheets: SpreadSheetListItem[] = await this.tableDataJsonSaveService.getUserSpreadSheets(userId);

    // 간단한 페이지네이션
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedResults = spreadSheets.slice(startIndex, endIndex);

    return {
      success: true,
      data: {
        spreadSheets: paginatedResults,
        pagination: {
          currentPage: page,
          totalItems: spreadSheets.length,
          totalPages: Math.ceil(spreadSheets.length / limit),
          itemsPerPage: limit
        }
      },
      message: 'SpreadSheets retrieved successfully'
    };
  }

  /**
   * 스프레드시트 삭제
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteSpreadSheet(
    @Param('id') spreadSheetId: string,
    @Query('userId') userId: string,
  ) {
    this.logger.log(`Deleting spreadsheet: ${spreadSheetId} for user: ${userId}`);

    const result: DeleteResponse = await this.tableDataJsonSaveService.deleteSpreadSheet(
      spreadSheetId,
      userId
    );

    return {
      success: result.success,
      message: 'SpreadSheet deleted successfully'
    };
  }

  /**
   * 메모리 정리
   */
  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  async cleanup(@Body() body: { userId: string }) {
    this.logger.log(`Cleaning up memory for user: ${body.userId}`);

    await this.tableDataJsonSaveService.cleanup();

    return {
      success: true,
      message: 'Memory cleanup completed'
    };
  }
}

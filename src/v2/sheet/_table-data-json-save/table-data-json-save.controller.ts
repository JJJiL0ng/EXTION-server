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
  UseGuards,
  Request,
  Logger,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { TableDataJsonSaveService } from './table-data-json-save.service';
import {
  CreateSpreadSheetDto,
  ApplyDeltaDto,
  LoadSpreadSheetDto,
  CellStyleDto,
} from './dto/table-data-json-save.dto';
import {
  LoadSpreadSheetResponse,
  ApplyDeltaResponse,
  ForceSaveResponse,
  DeleteResponse,
  SpreadSheetListItem,
  GPTReadyData,
  CellStyle,
  CellDelta
} from '../types/spreadsheet.types';

@Controller('v2/table-data-json-save')
export class TableDataJsonSaveController {
  private readonly logger = new Logger(TableDataJsonSaveController.name);

  constructor(
    private readonly tableDataJsonSaveService: TableDataJsonSaveService,
  ) {}

  /**
   * DTO를 서비스 타입으로 변환하는 유틸리티 함수들
   */
  private convertStyleDtoToStyle(styleDto?: CellStyleDto): CellStyle | undefined {
    if (!styleDto) return undefined;

    const style: CellStyle = {};

    if (styleDto.backgroundColor) style.backgroundColor = styleDto.backgroundColor;
    if (styleDto.color) style.color = styleDto.color;
    if (styleDto.fontSize) style.fontSize = styleDto.fontSize;
    if (styleDto.fontFamily) style.fontFamily = styleDto.fontFamily;
    if (styleDto.textAlign) style.textAlign = styleDto.textAlign;
    if (styleDto.verticalAlign) style.verticalAlign = styleDto.verticalAlign;

    // fontWeight 타입 변환
    if (styleDto.fontWeight) {
      const numericWeight = Number(styleDto.fontWeight);
      if (!isNaN(numericWeight)) {
        style.fontWeight = numericWeight;
      } else if (['normal', 'bold', 'bolder', 'lighter'].includes(styleDto.fontWeight)) {
        style.fontWeight = styleDto.fontWeight as 'normal' | 'bold' | 'bolder' | 'lighter';
      }
    }

    // border 변환 (필요시 추가 검증 가능)
    if (styleDto.border) {
      style.border = styleDto.border as any; // 구조가 동일하므로 캐스팅
    }

    return style;
  }

  private convertDtoToDelta(dto: ApplyDeltaDto): Omit<CellDelta, 'timestamp'> {
    return {
      action: dto.action,
      sheetName: dto.sheetName,
      cellAddress: dto.cellAddress,
      range: dto.range,
      value: dto.value,
      formula: dto.formula,
      style: this.convertStyleDtoToStyle(dto.style),
      rowIndex: dto.rowIndex,
      columnIndex: dto.columnIndex,
      count: dto.count,
    };
  }

  /**
   * 새 스프레드시트 생성
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async createSpreadSheet(
    @Request() req: any,
    @Body() dto: CreateSpreadSheetDto,
  ): Promise<{
    success: boolean;
    data: LoadSpreadSheetResponse;
    message: string;
  }> {
    const userId = req.user.sub;
    
    this.logger.log(`Creating spreadsheet: ${dto.fileName} with ID: ${dto.spreadsheetId}, chatId: ${dto.chatId} for user: ${userId}`);
    
    const createDto = {
      ...dto,
      userId
    };
    
    const result = await this.tableDataJsonSaveService.createSpreadSheet(createDto);

    return {
      success: true,
      data: result,
      message: 'SpreadSheet created successfully'
    };
  }

  /**
   * 스프레드시트 로드
   */
  @Post('load')
  @HttpCode(HttpStatus.OK)
  async loadSpreadSheet(
    @Request() req: any,
    @Body() dto: LoadSpreadSheetDto,
  ): Promise<{
    success: boolean;
    data: LoadSpreadSheetResponse;
    message: string;
  }> {
    const userId = req.user.sub;
    
    this.logger.log(`Loading spreadsheet: ${dto.spreadSheetId} for user: ${userId}`);
    
    
    const result = await this.tableDataJsonSaveService.loadSpreadSheet(
      dto.spreadSheetId,
      userId
    );

    return {
      success: true,
      data: result,
      message: 'SpreadSheet loaded successfully'
    };
  }

  /**
   * 실시간 델타 적용
   */
  @Put('delta')
  @HttpCode(HttpStatus.OK)
  async applyDelta(
    @Request() req: any,
    @Body() dto: ApplyDeltaDto,
  ) {
    const userId = req.user.sub;
    
    const deltaData = this.convertDtoToDelta(dto);
    const result: ApplyDeltaResponse = await this.tableDataJsonSaveService.applyDelta(userId, {
      ...deltaData,
      timestamp: Date.now()
    });

    return {
      success: result.success,
      data: {
        version: result.version,
        applied: true
      },
      message: 'Delta applied successfully'
    };
  }

  /**
   * 여러 델타 일괄 적용
   */
  @Put('deltas/batch')
  @HttpCode(HttpStatus.OK)
  async applyBatchDeltas(
    @Request() req: any,
    @Body() dto: { deltas: ApplyDeltaDto[] },
  ) {
    const userId = req.user.sub;
    
    this.logger.log(`Applying ${dto.deltas.length} deltas for user: ${userId}`);
    
    const results: ApplyDeltaResponse[] = [];
    for (const deltaDto of dto.deltas) {
      const deltaData = this.convertDtoToDelta(deltaDto);
      const result: ApplyDeltaResponse = await this.tableDataJsonSaveService.applyDelta(userId, {
        ...deltaData,
        timestamp: Date.now()
      });
      results.push(result);
    }

    return {
      success: true,
      data: {
        appliedCount: results.length,
        version: results[results.length - 1]?.version
      },
      message: `${results.length} deltas applied successfully`
    };
  }

  /**
   * 현재 상태 조회 (GPT용)
   */
  @Get('current-state')
  async getCurrentState(@Request() req: any) {
    const userId = req.user.sub;
    
    const currentState = await this.tableDataJsonSaveService.getCurrentState(userId);

    return {
      success: true,
      data: currentState,
      message: 'Current state retrieved successfully'
    };
  }

  /**
   * GPT용 파싱된 데이터 조회
   */
  @Get('gpt-data')
  async getGPTReadyData(@Request() req: any) {
    const userId = req.user.sub;
    
    const gptData: GPTReadyData = await this.tableDataJsonSaveService.getGPTReadyData(userId);

    return {
      success: true,
      data: {
        totalCells: gptData.totalCells,
        sheetCount: gptData.sheets.size,
        dataHash: gptData.dataHash,
        parsedAt: gptData.parsedAt,
        sheets: Array.from(gptData.sheets.entries()).map(([name, data]) => ({
          name,
          cellCount: data.cellCount,
          csvData: data.csvData,
          metadata: data.metadata
        }))
      },
      message: 'GPT data retrieved successfully'
    };
  }

  /**
   * 강제 저장
   */
  @Post('save')
  @HttpCode(HttpStatus.OK)
  async forceSave(@Request() req: any) {
    const userId = req.user.sub;
    
    this.logger.log(`Force saving for user: ${userId}`);
    
    const result: ForceSaveResponse = await this.tableDataJsonSaveService.forceSave();

    return {
      success: result.success,
      data: {
        savedDeltas: result.savedDeltas
      },
      message: `Saved ${result.savedDeltas} pending changes`
    };
  }

  /**
   * 사용자 스프레드시트 목록 조회
   */
  @Get('list')
  async getUserSpreadSheets(
    @Request() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const userId = req.user.sub;

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
    @Request() req: any,
    @Param('id') spreadSheetId: string,
  ) {
    const userId = req.user.sub;
    
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
  async cleanup(@Request() req: any) {
    const userId = req.user.sub;
    
    this.logger.log(`Cleaning up memory for user: ${userId}`);

    await this.tableDataJsonSaveService.cleanup();

    return {
      success: true,
      message: 'Memory cleanup completed'
    };
  }

  /**
   * 스프레드시트 상태 조회
   */
  @Get('status')
  async getStatus(@Request() req: any) {
    const userId = req.user.sub;
    
    // 현재 활성 스프레드시트 정보 조회
    try {
      const gptData: GPTReadyData = await this.tableDataJsonSaveService.getGPTReadyData(userId);

      return {
        success: true,
        data: {
          hasActiveSpreadSheet: true,
          totalCells: gptData.totalCells,
          sheetCount: gptData.sheets.size,
          dataHash: gptData.dataHash,
          lastActivity: gptData.parsedAt
        },
        message: 'Status retrieved successfully'
      };
    } catch (error) {
      return {
        success: true,
        data: {
          hasActiveSpreadSheet: false,
          totalCells: 0,
          sheetCount: 0,
          dataHash: null,
          lastActivity: null
        },
        message: 'No active spreadsheet'
      };
    }
  }
}

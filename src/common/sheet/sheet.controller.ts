// src/spreadsheet/spreadsheet.controller.ts
import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  HttpStatus,
  HttpCode,
  Logger
 } from '@nestjs/common';
 import { SheetService } from './sheet.service';
 import { CreateSpreadsheetDto, UpdateSheetDataDto, DataStorageType } from './dto/spreadsheet.dto';
 
 @Controller('spreadsheet')
 export class SheetController {
  private readonly logger = new Logger(SheetController.name);
 
  constructor(private readonly sheetService: SheetService) {}
 
  @Post('save')
  @HttpCode(HttpStatus.CREATED)
  async saveSpreadsheet(@Body() saveData: any) {
    try {
      const { chatId, userId, fileName, originalFileName, fileSize, fileType, sheets, activeSheetIndex = 0 } = saveData;
 
      // 필수 필드 검증
      if (!chatId || !userId) {
        throw new BadRequestException('chatId와 userId는 필수입니다.');
      }
 
      if (!fileName || !originalFileName) {
        throw new BadRequestException('fileName과 originalFileName은 필수입니다.');
      }
 
      if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
        throw new BadRequestException('sheets 데이터가 필요합니다.');
      }
 
      // 파일 타입 검증
      if (!['xlsx', 'csv'].includes(fileType)) {
        throw new BadRequestException('지원하지 않는 파일 형식입니다. (xlsx, csv만 지원)');
      }
 
      this.logger.log(`스프레드시트 저장 시작: ${originalFileName}, 시트 개수: ${sheets.length}`);
 
      // CreateSpreadsheetDto 생성
      const createDto: CreateSpreadsheetDto = {
        chatId,
        fileName,
        originalFileName,
        fileSize: fileSize || 0,
        fileType,
        sheets: sheets.map((sheet: any, index: number) => ({
          sheetName: sheet.sheetName || `Sheet${index + 1}`,
          sheetIndex: sheet.sheetIndex !== undefined ? sheet.sheetIndex : index,
          headers: sheet.headers || [],
          data: sheet.data || { headers: [], rows: [] },
          computedData: sheet.computedData || undefined,
          formulas: sheet.formulas || undefined
        })),
        activeSheetIndex,
        dataStorageType: this.determineStorageType(fileSize || 0)
      };
 
      // 스프레드시트 저장
      const spreadsheetId = await this.sheetService.createSpreadsheet(userId, createDto);
 
      this.logger.log(`스프레드시트 저장 완료: ${spreadsheetId}`);
 
      return {
        success: true,
        message: '스프레드시트가 성공적으로 저장되었습니다.',
        spreadsheetId,
        chatId: createDto.chatId,
        fileName: createDto.fileName,
        sheets: createDto.sheets.map(sheet => ({
          sheetIndex: sheet.sheetIndex,
          sheetName: sheet.sheetName,
          headers: sheet.headers,
          rowCount: sheet.data?.rows?.length || 0
        }))
      };
 
    } catch (error) {
      this.logger.error('스프레드시트 저장 오류:', error);
      
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      
      throw new BadRequestException(`데이터 저장 중 오류가 발생했습니다: ${error.message}`);
    }
  }
 
  @Get(':spreadsheetId')
  async getSpreadsheet(
    @Param('spreadsheetId') spreadsheetId: string,
    @Query('userId') userId: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException('userId는 필수입니다.');
      }
 
      const spreadsheet = await this.sheetService.getSpreadsheetMetadata(spreadsheetId, userId);
      
      return {
        success: true,
        data: spreadsheet
      };
 
    } catch (error) {
      this.logger.error('스프레드시트 조회 오류:', error);
      throw new NotFoundException('스프레드시트를 찾을 수 없습니다.');
    }
  }
 
  @Get(':spreadsheetId/sheet/:sheetIndex')
  async getSheetData(
    @Param('spreadsheetId') spreadsheetId: string,
    @Param('sheetIndex') sheetIndex: string,
    @Query('userId') userId: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException('userId는 필수입니다.');
      }
 
      const sheetIndexNum = parseInt(sheetIndex);
      if (isNaN(sheetIndexNum)) {
        throw new BadRequestException('올바른 시트 인덱스를 입력해주세요.');
      }
 
      const sheetData = await this.sheetService.getSheetData(spreadsheetId, sheetIndexNum);
      
      return {
        success: true,
        data: sheetData
      };
 
    } catch (error) {
      this.logger.error('시트 데이터 조회 오류:', error);
      throw new NotFoundException('시트 데이터를 찾을 수 없습니다.');
    }
  }
 
  @Get(':spreadsheetId/sheet/:sheetIndex/rows')
  async getSheetRows(
    @Param('spreadsheetId') spreadsheetId: string,
    @Param('sheetIndex') sheetIndex: string,
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException('userId는 필수입니다.');
      }
 
      const sheetIndexNum = parseInt(sheetIndex);
      if (isNaN(sheetIndexNum)) {
        throw new BadRequestException('올바른 시트 인덱스를 입력해주세요.');
      }
 
      const limitNum = limit ? parseInt(limit) : 100;
      const offsetNum = offset ? parseInt(offset) : 0;
 
      const rows = await this.sheetService.getSheetRows(
        spreadsheetId, 
        sheetIndexNum, 
        limitNum, 
        offsetNum
      );
      
      return {
        success: true,
        data: {
          rows,
          limit: limitNum,
          offset: offsetNum,
          hasMore: rows.length === limitNum
        }
      };
 
    } catch (error) {
      this.logger.error('시트 행 데이터 조회 오류:', error);
      throw new NotFoundException('시트 행 데이터를 찾을 수 없습니다.');
    }
  }
 
  @Get(':spreadsheetId/full')
  async getFullSpreadsheet(
    @Param('spreadsheetId') spreadsheetId: string,
    @Query('userId') userId: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException('userId는 필수입니다.');
      }
 
      const fullSpreadsheet = await this.sheetService.getFullSpreadsheet(spreadsheetId, userId);
      
      return {
        success: true,
        data: fullSpreadsheet
      };
 
    } catch (error) {
      this.logger.error('전체 스프레드시트 조회 오류:', error);
      throw new NotFoundException('스프레드시트를 찾을 수 없습니다.');
    }
  }
 
  @Get('user/:userId')
  async getUserSpreadsheets(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('chatId') chatId?: string
  ) {
    try {
      const limitNum = limit ? parseInt(limit) : 20;
      const offsetNum = offset ? parseInt(offset) : 0;
 
      const spreadsheets = await this.sheetService.getUserSpreadsheets(
        userId,
        limitNum,
        offsetNum,
        chatId
      );
      
      return {
        success: true,
        data: {
          spreadsheets,
          limit: limitNum,
          offset: offsetNum,
          hasMore: spreadsheets.length === limitNum
        }
      };
 
    } catch (error) {
      this.logger.error('사용자 스프레드시트 목록 조회 오류:', error);
      throw new BadRequestException('스프레드시트 목록 조회에 실패했습니다.');
    }
  }
 
  @Put(':spreadsheetId/sheet/:sheetIndex')
  @HttpCode(HttpStatus.OK)
  async updateSheetData(
    @Param('spreadsheetId') spreadsheetId: string,
    @Param('sheetIndex') sheetIndex: string,
    @Body() updateData: Omit<UpdateSheetDataDto, 'spreadsheetId' | 'sheetIndex'>,
    @Query('userId') userId: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException('userId는 필수입니다.');
      }
 
      const sheetIndexNum = parseInt(sheetIndex);
      if (isNaN(sheetIndexNum)) {
        throw new BadRequestException('올바른 시트 인덱스를 입력해주세요.');
      }
 
      const updateDto: UpdateSheetDataDto = {
        spreadsheetId,
        sheetIndex: sheetIndexNum,
        ...updateData
      };
 
      await this.sheetService.updateSheetData(userId, updateDto);
 
      return {
        success: true,
        message: '시트 데이터가 성공적으로 업데이트되었습니다.'
      };
 
    } catch (error) {
      this.logger.error('시트 데이터 업데이트 오류:', error);
      throw new BadRequestException('시트 데이터 업데이트에 실패했습니다.');
    }
  }
 
  @Delete(':spreadsheetId')
  @HttpCode(HttpStatus.OK)
  async deleteSpreadsheet(
    @Param('spreadsheetId') spreadsheetId: string,
    @Query('userId') userId: string
  ) {
    try {
      if (!userId) {
        throw new BadRequestException('userId는 필수입니다.');
      }
 
      await this.sheetService.deleteSpreadsheet(userId, spreadsheetId);
 
      return {
        success: true,
        message: '스프레드시트가 성공적으로 삭제되었습니다.'
      };
 
    } catch (error) {
      this.logger.error('스프레드시트 삭제 오류:', error);
      throw new BadRequestException('스프레드시트 삭제에 실패했습니다.');
    }
  }
 
  // === 파일 저장 전략 결정 메서드 ===
  private determineStorageType(fileSize: number): DataStorageType {
    // SheetService의 로직과 동일하게 유지
    if (fileSize < 1024 * 1024) { // 1MB 미만
      return DataStorageType.FIRESTORE;
    } else if (fileSize < 10 * 1024 * 1024) { // 10MB 미만
      return DataStorageType.CLOUD_STORAGE;
    } else {
      return DataStorageType.ENCRYPTED;
    }
  }
 }
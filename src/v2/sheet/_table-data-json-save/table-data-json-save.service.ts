// src/v2/sheet/table-data-json-save/table-data-json-save.service.ts

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
// Queue imports removed as not currently used
import { UserService } from '../../user/user.service';
import { createHash } from 'crypto';
import { SpreadSheetStatus, EditStatus } from '@prisma/client';
import { DeltaAction } from 'src/v2/sheet/types/spreadsheet.types';
import { CreateSpreadSheetDto } from './dto/table-data-json-save.dto';
import {
  CellDelta,
  LoadSpreadSheetResponse,
  GPTReadyData,
  SpreadSheetStructure,
  ApplyDeltaResponse,
  ForceSaveResponse,
  DeleteResponse,
  SpreadSheetListItem,
  DeltaValidationError,
  createSafeError,
  isValidCellAddress,
  isValidDeltaAction
} from '../types/spreadsheet.types';
@Injectable()
export class TableDataJsonSaveService {
  private readonly logger = new Logger(TableDataJsonSaveService.name);
  
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    // private readonly parserService: TableDataJsonParserService,
  ) { }


  /**
   * 스프레드시트 로드 (메모리로)
   */
  async loadSpreadSheet(spreadSheetId: string, userId: string): Promise<LoadSpreadSheetResponse> {
    try {
      // 1. 사용자 검증
      await this.userService.validateUser(userId);

      // 2. 데이터베이스에서 사용자가 요청한 시트만 로드
      const spreadSheet = await this.prisma.spreadSheet.findFirst({
        where: {
          id: spreadSheetId,
          userId,
          status: SpreadSheetStatus.ACTIVE
        },
        include: { data: true }
      });

      if (!spreadSheet) {
        throw new NotFoundException('SpreadSheet not found');
      }

      // 4. lastOpened 업데이트
      await this.prisma.spreadSheet.update({
        where: { id: spreadSheetId },
        data: { lastOpened: new Date() }
      });

      this.logger.log(`Loaded spreadsheet: ${spreadSheetId} for user: ${userId}`);

      return {
        id: spreadSheet.id,
        fileName: spreadSheet.fileName,
        // data: loadedData,
        version: spreadSheet.version,
        lastModified: spreadSheet.updatedAt
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to load spreadsheet: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

  /**
   * 새 스프레드시트 생성
   */
  async createSpreadSheet(dto: CreateSpreadSheetDto): Promise<LoadSpreadSheetResponse> {
    try {
      // 1. 사용자 검증
      await this.userService.validateUser(dto.userId);
      this.logger.log(`User validated: ${dto.userId}`);

      // chatId가 있으면 채팅 생성 또는 확인
      await this.userService.ensureChat(dto.chatId, dto.userId, `Chat for ${dto.fileName}`);
      this.logger.log(`Chat ensured: ${dto.chatId} for user: ${dto.userId}`);

      // 초기 데이터 준비 - 프론트엔드에서 보낸 JSON을 그대로 사용
      let initialData: any;

      // 프론트엔드에서 보낸 JSON을 그대로 저장 (변환하지 않음)
      initialData = dto.initialData;

      // 5. 트랜잭션으로 생성
      const result = await this.prisma.$transaction(async (tx) => {
        // SpreadSheet 생성 - 프론트엔드에서 제공한 ID 사용
        const spreadSheet = await tx.spreadSheet.create({
          data: {
            id: dto.spreadsheetId, // 프론트엔드에서 제공한 ID 사용
            fileName: dto.fileName,
            userId: dto.userId,
            chatId: dto.chatId, // 프론트엔드에서 제공한 chatId 사용
            fileSize: JSON.stringify(initialData).length,
            version: 1,
            status: SpreadSheetStatus.ACTIVE
          }
        });

        // SpreadSheetData 생성
        const sheetData = await tx.spreadSheetData.create({
          data: {
            spreadSheetId: spreadSheet.id,
            data:  JSON.stringify(initialData), // JSON 직렬화로 타입 호환성 확보
            sheetCount: this.extractSheetCount(initialData),
          } as any
        });

        // EditHistory 시작
        await tx.editHistory.create({
          data: {
            spreadSheetId: spreadSheet.id,
            status: EditStatus.ACTIVE,
            metadata: {
              createdBy: 'system',
              initialCreation: true
            }
          }
        });

        return { spreadSheet, sheetDataId: sheetData.id };
      });

      this.logger.log(`Created new spreadsheet: ${result.spreadSheet.id}`);

      return {
        id: result.spreadSheet.id,
        fileName: result.spreadSheet.fileName,
        version: 1,
        lastModified: result.spreadSheet.updatedAt
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to create spreadsheet: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

  /**
   * 델타 적용 (실시간) - ParsedSheet에 저장
   */
  async applyDelta(userId: string, delta: CellDelta): Promise<ApplyDeltaResponse> {
    this.logger.log(`[DEBUG] applyDelta called for user: ${userId}`);
    this.logger.log(`[DEBUG] Delta received:`, JSON.stringify(delta, null, 2));

    try {
      // 1. 사용자 검증
      await this.userService.validateUser(userId);
      this.logger.log(`[DEBUG] User validated: ${userId}`);

      // 2. 델타 검증
      this.validateDelta(delta);
      this.logger.log(`[DEBUG] Delta validated successfully`);

      // 3. 현재 스프레드시트 ID 확인 (델타에서 추출 또는 활성 스프레드시트에서)
      let spreadSheetId = delta.spreadSheetId;
      if (!spreadSheetId) {
        this.logger.warn(`[DEBUG] No spreadSheetId found in delta, attempting to find user's most recent spreadsheet`);

        // 사용자의 가장 최근 스프레드시트 찾기
        const recentSpreadSheet = await this.prisma.spreadSheet.findFirst({
          where: {
            userId,
            status: SpreadSheetStatus.ACTIVE
          },
          orderBy: {
            lastOpened: 'desc'
          }
        });

        if (recentSpreadSheet) {
          spreadSheetId = recentSpreadSheet.id;
          this.logger.log(`[DEBUG] Using most recent spreadsheet: ${spreadSheetId}`);
        } else {
          this.logger.error(`[DEBUG] No active spreadsheet found for user: ${userId}`);
          throw new Error('No spreadSheetId provided and no active spreadsheet found for user');
        }
      }

      // 4. 현재 시트 데이터를 SpreadSheetData에서 직접 조회
      const currentSpreadSheetData = await this.prisma.spreadSheetData.findFirst({
        where: {
          spreadSheetId
        },
        orderBy: {
          savedAt: 'desc'
        }
      });

      this.logger.log(`[DEBUG] Current spreadsheet data found:`, !!currentSpreadSheetData);

      // 5. 현재 전체 스프레드시트 데이터에서 해당 시트 추출
      let currentData: SpreadSheetStructure;
      if (currentSpreadSheetData && (currentSpreadSheetData as any).data) {
        currentData = (currentSpreadSheetData as any).data as SpreadSheetStructure;
        this.logger.log(`[DEBUG] Using existing spreadsheet data`);
      } else {
        // 데이터가 없으면 기본 구조 생성
        currentData = this.getDefaultSpreadSheetStructure();
        this.logger.log(`[DEBUG] Creating new default spreadsheet data`);
      }

      // 해당 시트가 없으면 생성
      if (!currentData.sheets || !currentData.sheets[delta.parsedSheetName]) {
        if (!currentData.sheets) currentData.sheets = {};
        currentData.sheets[delta.parsedSheetName] = {
          name: delta.parsedSheetName,
          data: { dataTable: {} }
        };
        this.logger.log(`[DEBUG] Created new sheet: ${delta.parsedSheetName}`);
      }

      // 6. 델타를 스프레드시트 데이터에 직접 적용
      this.applyDeltaToData(currentData, delta);
      this.logger.log(`[DEBUG] Delta applied to spreadsheet data`);

      // 7. 업데이트된 데이터를 SpreadSheetData에 직접 저장
      const now = new Date();
      const jsonString = JSON.stringify(currentData);

      // SpreadSheetData 업데이트
      const updatedData = await this.prisma.spreadSheetData.update({
        where: {
          spreadSheetId
        },
        data: {
          data: JSON.parse(JSON.stringify(currentData)), // JSON 직렬화로 타입 호환성 확보
          originalSize: jsonString.length,
          savedAt: now
        } as any
      });

      this.logger.log(`[DEBUG] Updated SpreadSheetData with ID: ${updatedData.id}`);

      // 8. SpreadSheet 메타데이터 업데이트
      await this.prisma.spreadSheet.update({
        where: { id: spreadSheetId },
        data: {
          updatedAt: new Date()
        }
      });

      this.logger.log(`[DEBUG] SpreadSheet metadata updated`);

      return { success: true, version: 1 };

    } catch (error) {
      this.logger.error(`[DEBUG] Error in applyDelta:`, error);
      const safeError = createSafeError(error);
      this.logger.error(`Failed to apply delta: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

  /**
   * 현재 상태 조회 (GPT용) - 현재 사용하지 않음
   */
  async getCurrentState(userId: string): Promise<SpreadSheetStructure> {
    try {
      // 캐싱을 사용하지 않으므로 현재 상태 조회도 비활성화
      throw new Error('Current state retrieval is disabled as caching is not used');

      /*
      if (!this.activeSpreadSheet || this.activeSpreadSheet.userId !== userId) {
        throw new MemoryStateError('No active spreadsheet for user', userId);
      }

      // 펜딩 델타가 없으면 베이스라인 반환
      if (this.activeSpreadSheet.pendingDeltas.length === 0) {
        return this.activeSpreadSheet.baselineData;
      }

      // 델타들을 베이스라인에 적용
      const currentState = this.applyDeltasToData(
        this.activeSpreadSheet.baselineData,
        this.activeSpreadSheet.pendingDeltas
      );

      // 활동 시간 업데이트
      this.activeSpreadSheet.metadata.lastActivity = new Date();

      return currentState;
      */

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to get current state: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

  /**
   * 스프레드시트 목록 조회
   */
  async getUserSpreadSheets(userId: string): Promise<SpreadSheetListItem[]> {
    try {
      const spreadSheets = await this.prisma.spreadSheet.findMany({
        where: {
          userId,
          status: SpreadSheetStatus.ACTIVE
        },
        include: {
          data: {
            select: {
              sheetCount: true,
              savedAt: true
            }
          },
          _count: {
            select: {
              chats: true,
              editHistory: true
            }
          }
        },
        orderBy: { lastOpened: 'desc' }
      });

      return spreadSheets.map(sheet => ({
        id: sheet.id,
        fileName: sheet.fileName,
        fileSize: sheet.fileSize,
        version: sheet.version,
        createdAt: sheet.createdAt,
        updatedAt: sheet.updatedAt,
        lastOpened: sheet.lastOpened,
        sheetCount: sheet.data?.sheetCount || 1,
        chatCount: sheet._count.chats,
        editCount: sheet._count.editHistory,
        isActive: false // 현재 캐싱을 사용하지 않으므로 항상 false
      }));

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to get user spreadsheets: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

  /**
   * 스프레드시트 삭제 (소프트 삭제)
   */
  async deleteSpreadSheet(spreadSheetId: string, userId: string): Promise<DeleteResponse> {
    try {
      // 1. 권한 확인
      const spreadSheet = await this.prisma.spreadSheet.findFirst({
        where: { id: spreadSheetId, userId }
      });

      if (!spreadSheet) {
        throw new NotFoundException('SpreadSheet not found');
      }

      // 2. 활성 데이터가 삭제 대상이면 정리 - 현재 사용하지 않음
      /*
      if (this.activeSpreadSheet?.id === spreadSheetId) {
        if (this.activeSpreadSheet.metadata.isDirty) {
          await this.forceSave();
        }
        this.activeSpreadSheet = null;
        this.clearSaveTimer();
      }
      */

      // 3. 소프트 삭제
      await this.prisma.spreadSheet.update({
        where: { id: spreadSheetId },
        data: {
          status: SpreadSheetStatus.DELETED,
          updatedAt: new Date()
        }
      });

      this.logger.log(`Deleted spreadsheet: ${spreadSheetId}`);

      return { success: true };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to delete spreadsheet: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

  /**
   * 메모리 정리 - 현재 사용하지 않음
   */
  async cleanup(): Promise<void> {
    try {
      // 캐싱을 사용하지 않으므로 메모리 정리 로직도 비활성화
      /*
      if (this.activeSpreadSheet?.metadata.isDirty) {
        await this.forceSave();
      }
      this.activeSpreadSheet = null;
      this.clearSaveTimer();
      */

      this.logger.log('Memory cleanup completed (no-op as caching disabled)');
    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Cleanup failed: ${safeError.message}`, safeError.details);
    }
  }

  // ==============================================================
  // Private Methods
  // ==============================================================

  /**
   * 파일명 중복 검사
   */
  private async validateUniqueFileName(userId: string, fileName: string): Promise<void> {
    const existing = await this.prisma.spreadSheet.findFirst({
      where: {
        userId,
        fileName,
        status: SpreadSheetStatus.ACTIVE
      }
    });

    if (existing) {
      throw new BadRequestException(`File name "${fileName}" already exists`);
    }
  }

  /**
   * 델타 검증
   */
  private validateDelta(delta: CellDelta): void {
    // 액션 유효성 검증
    if (!isValidDeltaAction(delta.action)) {
      throw new DeltaValidationError(`Invalid delta action: ${delta.action}`, delta);
    }

    // 액션별 필수 필드 검증
    switch (delta.action) {
      case DeltaAction.SET_CELL_VALUE:
      case DeltaAction.SET_CELL_FORMULA:
      case DeltaAction.SET_CELL_STYLE:
      case DeltaAction.DELETE_CELLS:
        if (!delta.cellAddress || !isValidCellAddress(delta.cellAddress)) {
          throw new DeltaValidationError(`Delta action ${delta.action} requires valid cellAddress`, delta);
        }
        break;

      case DeltaAction.INSERT_ROWS:
      case DeltaAction.DELETE_ROWS:
        if (delta.rowIndex === undefined || delta.count === undefined ||
          delta.rowIndex < 0 || delta.count <= 0) {
          throw new DeltaValidationError(`Delta action ${delta.action} requires valid rowIndex and count`, delta);
        }
        break;
    }
  }

  /**
   * 델타를 데이터에 적용
   */
  private applyDeltasToData(baselineData: SpreadSheetStructure, deltas: CellDelta[]): SpreadSheetStructure {
    const currentData = JSON.parse(JSON.stringify(baselineData));

    // 타임스탬프 순서로 정렬
    const sortedDeltas = deltas.sort((a, b) => a.timestamp - b.timestamp);

    for (const delta of sortedDeltas) {
      this.applyDeltaToData(currentData, delta);
    }

    return currentData;
  }


  /**
   * 개별 델타 적용 (기존 메서드 - SpreadSheetStructure용)
   */
  private applyDeltaToData(data: SpreadSheetStructure, delta: CellDelta): void {
    if (!data.sheets) data.sheets = {};

    let sheet = data.sheets[delta.parsedSheetName];
    if (!sheet) {
      sheet = data.sheets[delta.parsedSheetName] = {
        name: delta.parsedSheetName,
        data: { dataTable: {} }
      };
    }

    if (!sheet.data) sheet.data = { dataTable: {} };
    if (!sheet.data.dataTable) sheet.data.dataTable = {};

    const dataTable = sheet.data.dataTable;

    switch (delta.action) {
      case DeltaAction.SET_CELL_VALUE:
        if (delta.cellAddress && delta.value !== undefined) {
          if (!dataTable[delta.cellAddress]) {
            dataTable[delta.cellAddress] = {};
          }
          dataTable[delta.cellAddress].value = delta.value;
        }
        break;

      case DeltaAction.SET_CELL_FORMULA:
        if (delta.cellAddress && delta.formula !== undefined) {
          if (!dataTable[delta.cellAddress]) {
            dataTable[delta.cellAddress] = {};
          }
          dataTable[delta.cellAddress].formula = delta.formula;
        }
        break;

      case DeltaAction.SET_CELL_STYLE:
        if (delta.cellAddress && delta.style !== undefined) {
          if (!dataTable[delta.cellAddress]) {
            dataTable[delta.cellAddress] = {};
          }
          dataTable[delta.cellAddress].style = {
            ...dataTable[delta.cellAddress].style,
            ...delta.style
          };
        }
        break;

      case DeltaAction.DELETE_CELLS:
        if (delta.cellAddress && dataTable[delta.cellAddress]) {
          delete dataTable[delta.cellAddress];
        }
        break;

      // 행/열 삽입/삭제는 더 복잡한 로직 필요
      case DeltaAction.INSERT_ROWS:
      case DeltaAction.DELETE_ROWS:
      case DeltaAction.INSERT_COLUMNS:
      case DeltaAction.DELETE_COLUMNS:
        // TODO: 구현 필요
        this.logger.warn(`Delta action ${delta.action} not yet implemented`);
        break;
    }
  }

  /**
   * 기본 스프레드시트 구조
   */
  private getDefaultSpreadSheetStructure(): SpreadSheetStructure {
    return {
      version: '18.1.4',
      sheets: {
        'Sheet1': {
          name: 'Sheet1',
          data: { dataTable: {} }
        }
      }
    };
  }

  private extractSheetCount(json: SpreadSheetStructure): number {
    if (json.sheets && typeof json.sheets === 'object') {
      return Object.keys(json.sheets).length;
    }
    return 1;
  }
}
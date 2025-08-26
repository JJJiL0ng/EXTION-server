// src/v2/sheet/table-data-json-save/table-data-json-save.service.ts

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
// Queue imports removed as not currently used
import * as zlib from 'zlib';
import { promisify } from 'util';
import { UserService } from '../../user/user.service';
import { createHash } from 'crypto';
import { SpreadSheetStatus, EditStatus, DeltaAction, Prisma } from '@prisma/client';
import { CreateSpreadSheetDto } from './dto/table-data-json-save.dto';
import { TableDataJsonParserService } from '../_table-data-json-parser/_table-data-json-parser.service';
import {
  CellDelta,
  MemorySpreadSheetData,
  LoadSpreadSheetResponse,
  GPTReadyData,
  GPTSheetData,
  SpreadSheetStructure,
  ApplyDeltaResponse,
  ForceSaveResponse,
  DeleteResponse,
  SpreadSheetListItem,
  DataTable,
  SpreadSheetError,
  ValidationError,
  DeltaValidationError,
  MemoryStateError,
  createSafeError,
  isValidCellAddress,
  isValidRange,
  isSpreadSheetStructure,
  hasRequiredDeltaFields,
  isValidDeltaAction
} from '../types/spreadsheet.types';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Types are now imported from ./types/spreadsheet.types.ts

@Injectable()
export class TableDataJsonSaveService {
  private readonly logger = new Logger(TableDataJsonSaveService.name);
  private readonly SAVE_DEBOUNCE_TIME = 2000; // 2초
  private readonly MAX_PENDING_DELTAS = 100;

  // 메모리 내 활성 스프레드시트 (사용자당 하나) //추후 다중 탭 사용자 확장 예정 todo
  private activeSpreadSheet: MemorySpreadSheetData | null = null;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly parserService: TableDataJsonParserService,
  ) { }


  /**
   * 스프레드시트 로드 (메모리로)
   */
  async loadSpreadSheet(spreadSheetId: string, userId: string): Promise<LoadSpreadSheetResponse> {
    try {
      // 1. 사용자 검증
      await this.userService.validateUser(userId);

      // 2. 캐시된 활성 스프레드시트 확인 (우선순위 1) - 현재 사용하지 않음
      /* 
      if (this.activeSpreadSheet && 
          this.activeSpreadSheet.id === spreadSheetId && 
          this.activeSpreadSheet.userId === userId) {
        
        this.logger.log(`Using cached spreadsheet data for: ${spreadSheetId}`);
        
        // 현재 상태 (베이스라인 + 펜딩 델타) 조회
        const currentState = await this.getCurrentState(userId);
        
        // fileName을 위해 DB에서 메타데이터만 조회 (캐시된 데이터가 있어도 파일명은 필요)
        const sheetMetadata = await this.prisma.spreadSheet.findFirst({
          where: { id: spreadSheetId, userId },
          select: { fileName: true, updatedAt: true }
        });
        
        return {
          id: this.activeSpreadSheet.id,
          fileName: sheetMetadata?.fileName || 'cached-sheet',
          data: currentState,
          version: this.activeSpreadSheet.metadata.version,
          lastModified: sheetMetadata?.updatedAt || this.activeSpreadSheet.metadata.lastActivity
        };
      }
      */

      // 3. 기존 활성 데이터가 있다면 저장 (다른 시트로 전환하는 경우) - 현재 사용하지 않음
      /*
      if (this.activeSpreadSheet?.metadata.isDirty) {
        await this.forceSave();
      }
      */

      // 4. 데이터베이스에서 로드
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

      // 4. 데이터 압축 해제
      let decompressedData: SpreadSheetStructure;
      if (spreadSheet.data?.compressedData) {
        const rawData = await this.decompressData(Buffer.from(spreadSheet.data.compressedData));
        if (!isSpreadSheetStructure(rawData)) {
          throw new ValidationError('Invalid spreadsheet data structure in database');
        }
        decompressedData = rawData;
      } else {
        decompressedData = this.getDefaultSpreadSheetStructure();
      }

      // 5. 메모리에 로드 - 현재 사용하지 않음
      /*
      this.activeSpreadSheet = {
        id: spreadSheet.id,
        userId,
        baselineData: decompressedData,
        pendingDeltas: [],
        parsedCache: null,
        metadata: {
          version: spreadSheet.version,
          lastActivity: new Date(),
          saveScheduled: false,
          isDirty: false
        }
      };
      */

      // 6. lastOpened 업데이트
      await this.prisma.spreadSheet.update({
        where: { id: spreadSheetId },
        data: { lastOpened: new Date() }
      });

      this.logger.log(`Loaded spreadsheet: ${spreadSheetId} for user: ${userId}`);

      return {
        id: spreadSheet.id,
        fileName: spreadSheet.fileName,
        data: decompressedData,
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

      // 2. 기존 활성 데이터 저장 - 현재 사용하지 않음
      /*
      if (this.activeSpreadSheet?.metadata.isDirty) {
        await this.forceSave();
      }
      */

      // 3. 스프레드시트 ID 중복 검사 (userId + spreadsheetId unique constraint)
      // Prisma에서 @@unique([userId, id])로 처리하므로 별도 검사 불필요

      // 4. 초기 데이터 준비
      let initialData: SpreadSheetStructure;
      if (dto.initialData) {
        // SpreadJS 형식인지 확인하고 변환
        if (this.isSpreadJSFormat(dto.initialData)) {
          initialData = this.convertSpreadJSToInternalFormat(dto.initialData);
        } else if (isSpreadSheetStructure(dto.initialData)) {
          initialData = dto.initialData;
        } else {
          throw new ValidationError('Invalid initial data structure provided');
        }
      } else {
        initialData = this.getDefaultSpreadSheetStructure();
      }
      //압축 gzip
      const compressedData = await this.compressData(initialData);
      //해시 - sha256
      const dataHash = this.generateDataHash(compressedData);

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
            compressedData,
            dataHash,
            originalSize: JSON.stringify(initialData).length,
            compressedSize: compressedData.length,
            sheetCount: this.extractSheetCount(initialData),
            version: this.extractVersion(initialData)
          }
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

      // 6. 메모리에 로드 - 현재 사용하지 않음
      /*
      this.activeSpreadSheet = {
        id: result.id,
        userId: dto.userId,
        baselineData: initialData,
        pendingDeltas: [],
        parsedCache: null,
        metadata: {
          version: 1,
          lastActivity: new Date(),
          saveScheduled: false,
          isDirty: false
        }
      };
      */

      // 6. 추가: 시트 파싱 후 개별/잔여 저장 (기존 로직 유지 + 추가)
      try {
        // 원본 SpreadJS 입력이 있었다면 그대로 사용하여 remainder에 상위 메타를 보존
        const rawForParser: any = (dto.initialData && this.isSpreadJSFormat(dto.initialData))
          ? dto.initialData
          : (initialData as any);

        await this.parserService.parseAndPersist({
          spreadSheetId: result.spreadSheet.id,
          sourceDataId: result.sheetDataId,
          rawData: rawForParser,
        });
      } catch (e) {
        this.logger.error(`Sheet parsing/persist failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      this.logger.log(`Created new spreadsheet: ${result.spreadSheet.id}`);

      return {
        id: result.spreadSheet.id,
        fileName: result.spreadSheet.fileName,
        data: initialData,
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
   * 델타 적용 (실시간) - 현재 사용하지 않음
   */
  async applyDelta(userId: string, delta: CellDelta): Promise<ApplyDeltaResponse> {
  // 캐싱/실시간 적용 비활성 상태이므로 no-op 처리
  this.logger.warn('Delta application is disabled; returning no-op success');
  return { success: true, version: 0 };
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
   * GPT용 데이터 준비 - 현재 사용하지 않음
   */
  async getGPTReadyData(userId: string): Promise<GPTReadyData> {
    try {
      // 캐싱을 사용하지 않으므로 GPT용 데이터 준비도 비활성화
      throw new Error('GPT ready data preparation is disabled as caching is not used');

      /*
      if (!this.activeSpreadSheet || this.activeSpreadSheet.userId !== userId) {
        throw new MemoryStateError('No active spreadsheet for user', userId);
      }

      // 캐시 확인
      if (this.activeSpreadSheet.parsedCache) {
        return this.activeSpreadSheet.parsedCache;
      }

      // 현재 상태 조회
      const currentState = await this.getCurrentState(userId);

      // GPT용 파싱
      const gptData = await this.parseForGPT(currentState);

      // 캐시 저장
      this.activeSpreadSheet.parsedCache = gptData;

      return gptData;
      */

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to get GPT ready data: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

  /**
   * 강제 저장 - 현재 사용하지 않음
   */
  async forceSave(): Promise<ForceSaveResponse> {
    try {
      // 캐싱을 사용하지 않으므로 강제 저장도 비활성화
      return { success: true, savedDeltas: 0 };

      /*
      if (!this.activeSpreadSheet?.metadata.isDirty) {
        return { success: true, savedDeltas: 0 };
      }

      const savedDeltas = await this.performSave();

      this.logger.log(`Force saved spreadsheet: ${this.activeSpreadSheet.id}, deltas: ${savedDeltas}`);

      return { success: true, savedDeltas };
      */

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to force save: ${safeError.message}`, safeError.details);
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
              compressedSize: true,
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
        compressedSize: sheet.data?.compressedSize || 0,
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
   * 개별 델타 적용
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
   * GPT용 데이터 파싱
   */
  private async parseForGPT(data: SpreadSheetStructure): Promise<GPTReadyData> {
    const sheets = new Map<string, GPTSheetData>();
    let totalCells = 0;

    if (data.sheets) {
      for (const [sheetName, sheet] of Object.entries(data.sheets)) {
        if (sheet.data?.dataTable) {
          const cellCount = Object.keys(sheet.data.dataTable).length;
          if (cellCount > 0) {
            sheets.set(sheetName, {
              csvData: this.convertToCSV(sheet.data.dataTable),
              cellCount,
              metadata: {
                name: sheetName,
                cellCount
              }
            });
            totalCells += cellCount;
          }
        }
      }
    }

    return {
      sheets,
      totalCells,
      dataHash: this.generateDataHash(Buffer.from(JSON.stringify(data))),
      parsedAt: new Date()
    };
  }

  /**
   * DataTable을 CSV로 변환
   */
  private convertToCSV(dataTable: DataTable): string {
    // 셀 주소 파싱 및 정렬
    const cells = Object.entries(dataTable)
      .map(([address, cell]) => ({
        address,
        row: this.parseRowFromAddress(address),
        col: this.parseColFromAddress(address),
        value: cell.value || cell.formula || ''
      }))
      .sort((a, b) => a.row - b.row || a.col - b.col);

    if (cells.length === 0) return '';

    // CSV 행 구성
    const maxRow = Math.max(...cells.map(c => c.row));
    const maxCol = Math.max(...cells.map(c => c.col));

    const rows: string[][] = [];
    for (let r = 0; r <= maxRow; r++) {
      rows[r] = new Array(maxCol + 1).fill('');
    }

    // 셀 값 채우기
    for (const cell of cells) {
      rows[cell.row][cell.col] = String(cell.value || '');
    }

    // CSV 문자열 생성
    return rows
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  /**
   * 디바운스된 저장 스케줄링 - 현재 사용하지 않음
   */
  private scheduleSave(): void {
    // 캐싱을 사용하지 않으므로 스케줄된 저장도 비활성화
    /*
    this.clearSaveTimer();
    
    this.activeSpreadSheet!.metadata.saveScheduled = true;
    
    this.saveTimer = setTimeout(async () => {
      try {
        await this.performSave();
      } catch (error) {
        const safeError = createSafeError(error);
        this.logger.error(`Background save failed: ${safeError.message}`, safeError.details);
        // 재시도 스케줄링
        setTimeout(() => this.scheduleSave(), 5000);
      }
    }, this.SAVE_DEBOUNCE_TIME);
    */
  }

  /**
   * 저장 타이머 정리 - 현재 사용하지 않음
   */
  private clearSaveTimer(): void {
    // 캐싱을 사용하지 않으므로 타이머 정리도 비활성화
    /*
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    */
  }

  /**
   * 실제 저장 수행 - 현재 사용하지 않음
   */
  private async performSave(): Promise<number> {
    // 캐싱을 사용하지 않으므로 저장 로직도 비활성화
    return 0;

    /*
    if (!this.activeSpreadSheet?.metadata.isDirty) {
      return 0;
    }

    const deltaCount = this.activeSpreadSheet.pendingDeltas.length;
    if (deltaCount === 0) {
      this.activeSpreadSheet.metadata.isDirty = false;
      return 0;
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. 현재 상태 생성
      const currentState = this.applyDeltasToData(
        this.activeSpreadSheet!.baselineData,
        this.activeSpreadSheet!.pendingDeltas
      );

      // 2. 압축 및 저장
      const compressedData = await this.compressData(currentState);
      const dataHash = this.generateDataHash(compressedData);

      // 3. SpreadSheetData 업데이트
      await tx.spreadSheetData.upsert({
        where: { spreadSheetId: this.activeSpreadSheet!.id },
        update: {
          compressedData,
          dataHash,
          originalSize: JSON.stringify(currentState).length,
          compressedSize: compressedData.length,
          sheetCount: this.extractSheetCount(currentState),
          version: this.extractVersion(currentState),
          savedAt: new Date()
        },
        create: {
          spreadSheetId: this.activeSpreadSheet!.id,
          compressedData,
          dataHash,
          originalSize: JSON.stringify(currentState).length,
          compressedSize: compressedData.length,
          sheetCount: this.extractSheetCount(currentState),
          version: this.extractVersion(currentState)
        }
      });

      // 4. SpreadSheet 메타데이터 업데이트
      await tx.spreadSheet.update({
        where: { id: this.activeSpreadSheet!.id },
        data: {
          version: this.activeSpreadSheet!.metadata.version + 1,
          fileSize: JSON.stringify(currentState).length,
          updatedAt: new Date()
        }
      });

      // 5. EditHistory 기록
      if (deltaCount > 0) {
        const editHistory = await tx.editHistory.create({
          data: {
            spreadSheetId: this.activeSpreadSheet!.id,
            sessionEnd: new Date(),
            deltaCount,
            status: EditStatus.COMPLETED,
            metadata: {
              autoSave: true,
              deltaTypes: this.activeSpreadSheet!.pendingDeltas.map(d => d.action)
            }
          }
        });

        // 6. DeltaRecord 저장 (히스토리용)
        const deltaRecords = this.activeSpreadSheet!.pendingDeltas.map((delta, index) => ({
          editHistoryId: editHistory.id,
          deltaData: JSON.parse(JSON.stringify(delta)) as Prisma.InputJsonValue,
          sequenceNo: index + 1,
          action: delta.action,
          sheetName: delta.sheetName,
          cellRange: delta.cellAddress || delta.range,
          createdAt: new Date(delta.timestamp)
        }));

        await tx.deltaRecord.createMany({
          data: deltaRecords
        });
      }

      // 7. 메모리 상태 업데이트
      this.activeSpreadSheet!.baselineData = currentState;
      this.activeSpreadSheet!.pendingDeltas = [];
      this.activeSpreadSheet!.metadata.version++;
      this.activeSpreadSheet!.metadata.isDirty = false;
      this.activeSpreadSheet!.metadata.saveScheduled = false;
      this.activeSpreadSheet!.parsedCache = null;

      return deltaCount;
    });
    */
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

  /**
   * 데이터 압축/해제
   */
  private async compressData(data: SpreadSheetStructure): Promise<Buffer> {
    const jsonString = JSON.stringify(data);
    const compressed = await gzip(jsonString);
    return Buffer.from(compressed);
  }

  private async decompressData(compressedData: Buffer): Promise<SpreadSheetStructure> {
    const decompressed = await gunzip(compressedData);
    const rawData = JSON.parse(Buffer.from(decompressed).toString());

    if (!isSpreadSheetStructure(rawData)) {
      throw new ValidationError('Decompressed data is not a valid spreadsheet structure');
    }

    return rawData;
  }

  /**
   * 데이터 해시 생성
   */
  private generateDataHash(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * 메타데이터 추출
   */
  private extractVersion(json: SpreadSheetStructure): string {
    return json.version || '18.1.4';
  }

  private extractSheetCount(json: SpreadSheetStructure): number {
    if (json.sheets && typeof json.sheets === 'object') {
      return Object.keys(json.sheets).length;
    }
    return 1;
  }

  /**
   * SpreadJS 형식 감지
   */
  private isSpreadJSFormat(data: any): boolean {
    return (
      data &&
      typeof data === 'object' &&
      data.version &&
      data.sheets &&
      typeof data.sheets === 'object' &&
      // SpreadJS 특유의 속성들 확인
      (data.sheetCount !== undefined || data.docProps !== undefined || data.frc !== undefined)
    );
  }

  /**
   * SpreadJS 형식을 내부 형식으로 변환
   */
  private convertSpreadJSToInternalFormat(spreadJSData: any): SpreadSheetStructure {
    const internalData: SpreadSheetStructure = {
      version: spreadJSData.version || '18.1.4',
      sheets: {}
    };

    if (spreadJSData.sheets) {
      for (const [sheetName, sheetData] of Object.entries(spreadJSData.sheets) as [string, any][]) {
        internalData.sheets[sheetName] = {
          name: sheetData.name || sheetName,
          data: {
            dataTable: this.convertSpreadJSDataTable(sheetData.data?.dataTable || {})
          }
        };
      }
    }

    // 시트가 없다면 기본 시트 추가
    if (Object.keys(internalData.sheets).length === 0) {
      internalData.sheets['Sheet1'] = {
        name: 'Sheet1',
        data: { dataTable: {} }
      };
    }

    return internalData;
  }

  /**
   * SpreadJS DataTable을 내부 형식으로 변환
   */
  private convertSpreadJSDataTable(spreadJSDataTable: any): DataTable {
    const internalDataTable: DataTable = {};

    if (!spreadJSDataTable || typeof spreadJSDataTable !== 'object') {
      return internalDataTable;
    }

    // SpreadJS는 숫자 인덱스를 사용할 수 있음 (row -> column)
    for (const [rowKey, rowData] of Object.entries(spreadJSDataTable)) {
      if (typeof rowData === 'object' && rowData !== null) {
        for (const [colKey, cellData] of Object.entries(rowData as Record<string, any>)) {
          // 숫자 인덱스를 A1 형식으로 변환
          let cellAddress: string;
          if (/^\d+$/.test(rowKey) && /^\d+$/.test(colKey)) {
            cellAddress = this.convertNumericToA1(parseInt(rowKey), parseInt(colKey));
          } else {
            cellAddress = `${colKey}${rowKey}`;
          }

          if (cellData && typeof cellData === 'object') {
            const convertedCell: any = {};

            // 값 변환
            if (cellData.value !== undefined) {
              convertedCell.value = cellData.value;
            }

            // 수식 변환
            if (cellData.formula !== undefined) {
              convertedCell.formula = cellData.formula;
            }

            // 스타일 변환 (기본적인 스타일만 변환)
            if (cellData.style && typeof cellData.style === 'object') {
              convertedCell.style = this.convertSpreadJSStyle(cellData.style);
            }

            // 다른 속성들도 보존
            for (const [key, value] of Object.entries(cellData)) {
              if (!['value', 'formula', 'style'].includes(key)) {
                convertedCell[key] = value;
              }
            }

            internalDataTable[cellAddress] = convertedCell;
          }
        }
      }
    }

    return internalDataTable;
  }

  /**
   * 숫자 인덱스를 A1 형식으로 변환
   */
  private convertNumericToA1(row: number, col: number): string {
    let colStr = '';
    let colNum = col;
    while (colNum >= 0) {
      colStr = String.fromCharCode(65 + (colNum % 26)) + colStr;
      colNum = Math.floor(colNum / 26) - 1;
    }
    return `${colStr}${row + 1}`;
  }

  /**
   * SpreadJS 스타일을 내부 형식으로 변환
   */
  private convertSpreadJSStyle(spreadJSStyle: any): any {
    const internalStyle: any = {};

    // 기본적인 스타일 속성 매핑
    const styleMapping: Record<string, string> = {
      backColor: 'backgroundColor',
      foreColor: 'color',
      fontFamily: 'fontFamily',
      fontSize: 'fontSize',
      fontWeight: 'fontWeight',
      hAlign: 'textAlign',
      vAlign: 'verticalAlign'
    };

    for (const [spreadJSKey, internalKey] of Object.entries(styleMapping)) {
      if (spreadJSStyle[spreadJSKey] !== undefined) {
        internalStyle[internalKey] = spreadJSStyle[spreadJSKey];
      }
    }

    // 폰트 크기 단위 처리 (px 제거)
    if (internalStyle.fontSize && typeof internalStyle.fontSize === 'string') {
      const fontSize = parseFloat(internalStyle.fontSize.replace('px', ''));
      if (!isNaN(fontSize)) {
        internalStyle.fontSize = fontSize;
      }
    }

    // hAlign 값 변환
    if (internalStyle.textAlign === 1) {
      internalStyle.textAlign = 'center';
    } else if (internalStyle.textAlign === 2) {
      internalStyle.textAlign = 'right';
    } else if (internalStyle.textAlign === 0) {
      internalStyle.textAlign = 'left';
    }

    // vAlign 값 변환
    if (internalStyle.verticalAlign === 1) {
      internalStyle.verticalAlign = 'middle';
    } else if (internalStyle.verticalAlign === 2) {
      internalStyle.verticalAlign = 'bottom';
    } else if (internalStyle.verticalAlign === 0) {
      internalStyle.verticalAlign = 'top';
    }

    // 테두리 처리 (복잡하므로 기본적인 변환만)
    if (spreadJSStyle.border) {
      internalStyle.border = spreadJSStyle.border;
    }

    return internalStyle;
  }

  /**
   * 주소 파싱 유틸리티
   */
  private parseRowFromAddress(address: string): number {
    const match = address.match(/^[A-Z]+(\d+)$/);
    return match ? parseInt(match[1]) - 1 : 0;
  }

  private parseColFromAddress(address: string): number {
    const match = address.match(/^([A-Z]+)\d+$/);
    if (!match) return 0;

    let result = 0;
    const col = match[1];
    for (let i = 0; i < col.length; i++) {
      result = result * 26 + (col.charCodeAt(i) - 64);
    }
    return result - 1;
  }
}
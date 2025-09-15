// src/v2/sheet/table-data-json-save/table-data-json-save.service.ts

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserService } from '../../user/user.service';
import { SpreadSheetStatus } from '@prisma/client';
import { CreateSpreadSheetDto } from './dto/table-data-json-save.dto';
import {
  LoadSpreadSheetResponse,
  DeleteResponse,
  SpreadSheetListItem,
  createSafeError,
  AddNewVersionSpreadSheetData
} from '../types/spreadsheet.types';


@Injectable()
export class TableDataJsonSaveService {
  private readonly logger = new Logger(TableDataJsonSaveService.name);
  
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) { }


  /**
   * 스프레드시트 로드 (메모리로)
   */
  async loadSpreadSheet(spreadSheetId: string, userId: string): Promise<LoadSpreadSheetResponse> {
    try {
      // 1. 사용자 검증
      await this.userService.validateUser(userId);

      // 2. 데이터베이스에서 사용자가 요청한 시트만 로드 (최신 버전)
      const spreadSheet = await this.prisma.spreadSheet.findFirst({
        where: {
          id: spreadSheetId,
          userId,
          status: SpreadSheetStatus.ACTIVE
        },
        include: { 
          spreadSheetVersions: {
            orderBy: { spreadSheetVersionNumber: 'desc' },
            take: 1
          }
        }
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
        spreadSheetId: spreadSheet.id,
        fileName: spreadSheet.fileName,
        // data: loadedData,
        spreadSheetVersionNumber: spreadSheet.latestVersion,
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
      let jsonData: any;

      // 프론트엔드에서 보낸 JSON을 그대로 저장 (변환하지 않음)
      jsonData = dto.jsonData;

      // 5. 트랜잭션으로 생성
      const result = await this.prisma.$transaction(async (tx) => {
        // SpreadSheet 생성 - 프론트엔드에서 제공한 ID 사용
        const spreadSheet = await tx.spreadSheet.create({
          data: {
            id: dto.spreadsheetId, // 프론트엔드에서 제공한 ID 사용
            fileName: dto.fileName,
            userId: dto.userId,
            chatId: dto.chatId, // 프론트엔드에서 제공한 chatId 사용
            editLockVersion: 1, // 낙관적 잠금용
            latestVersion: 1, // 최신 버전 번호
            status: SpreadSheetStatus.ACTIVE
          }
        });

        // SpreadSheetVersionData 생성 (버전 1로)
        const sheetVersionData = await tx.spreadSheetVersionData.create({
          data: {
            spreadSheetId: spreadSheet.id,
            spreadSheetVersionNumber: 1, // 첫 번째 버전
            name: null, // 기본 버전은 이름 없음
            data: jsonData as any, // JSON 객체 그대로 저장
            sheetCount: this.extractSheetCount(jsonData),
            fileSize: JSON.stringify(jsonData).length,
          }
        });

        return { spreadSheet, sheetVersionDataId: sheetVersionData.id };
      });

      this.logger.log(`Created new spreadsheet: ${result.spreadSheet.id}`);

      return {
        spreadSheetId: result.spreadSheet.id,
        fileName: result.spreadSheet.fileName,
        spreadSheetVersionNumber: 1,
        lastModified: result.spreadSheet.updatedAt
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to create spreadsheet: ${safeError.message}`, safeError.details);
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
          spreadSheetVersions: {
            select: {
              sheetCount: true,
              savedAt: true,
              fileSize: true
            },
            orderBy: { spreadSheetVersionNumber: 'desc' },
            take: 1
          },
          _count: {
            select: {
              chats: true,
            }
          }
        },
        orderBy: { lastOpened: 'desc' }
      });

      return spreadSheets.map(sheet => {
        const latestVersion = sheet.spreadSheetVersions[0]; // 첫 번째가 최신 버전
        return {
          id: sheet.id,
          fileName: sheet.fileName,
          fileSize: latestVersion?.fileSize || 0,
          version: sheet.latestVersion,
          createdAt: sheet.createdAt,
          updatedAt: sheet.updatedAt,
          lastOpened: sheet.lastOpened,
          sheetCount: latestVersion?.sheetCount || 1,
          chatCount: sheet._count.chats,
          isActive: false // 현재 캐싱을 사용하지 않으므로 항상 false
        };
      });

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
   * 새 버전의 스프레드시트 데이터 추가
   */
  async addNewVersionSpreadSheetData(addNewVersionSpreadSheetData: AddNewVersionSpreadSheetData): Promise<LoadSpreadSheetResponse> {
    try {
      // 1. 사용자 검증
      await this.userService.validateUser(addNewVersionSpreadSheetData.userId);
      this.logger.log(`User validated: ${addNewVersionSpreadSheetData.userId}`);

      // 2. 스프레드시트 존재 및 권한 확인
      const existingSpreadSheet = await this.prisma.spreadSheet.findFirst({
        where: {
          id: addNewVersionSpreadSheetData.spreadSheetId,
          userId: addNewVersionSpreadSheetData.userId,
          status: SpreadSheetStatus.ACTIVE
        }
      });

      if (!existingSpreadSheet) {
        throw new NotFoundException('SpreadSheet not found or access denied');
      }

      // 3. 현재 버전이 올바른지 확인 (낙관적 잠금)
      if (existingSpreadSheet.latestVersion !== addNewVersionSpreadSheetData.spreadSheetVersionNumber) {
        throw new BadRequestException(
          `Version conflict: Expected version ${addNewVersionSpreadSheetData.spreadSheetVersionNumber}, but current version is ${existingSpreadSheet.latestVersion}`
        );
      }

      // 새 버전 번호는 기존 버전 번호 + 1
      const newVersionNumber = addNewVersionSpreadSheetData.spreadSheetVersionNumber + 1;

      // 4. 트랜잭션으로 새 버전 생성 및 메타데이터 업데이트
      const result = await this.prisma.$transaction(async (tx) => {
        // 새 버전 데이터 생성
        const newVersionData = await tx.spreadSheetVersionData.create({
          data: {
            spreadSheetId: addNewVersionSpreadSheetData.spreadSheetId,
            spreadSheetVersionNumber: newVersionNumber,
            name: null, // 자동 생성된 버전은 이름 없음
            data: addNewVersionSpreadSheetData.jsonData as any,
            sheetCount: this.extractSheetCount(addNewVersionSpreadSheetData.jsonData),
            fileSize: JSON.stringify(addNewVersionSpreadSheetData.jsonData).length,
          }
        });

        // 스프레드시트 메타데이터 업데이트
        const updatedSpreadSheet = await tx.spreadSheet.update({
          where: { id: addNewVersionSpreadSheetData.spreadSheetId },
          data: {
            latestVersion: newVersionNumber,
            editLockVersion: newVersionNumber, // 낙관적 잠금 버전도 업데이트
            updatedAt: new Date()
          }
        });

        return { spreadSheet: updatedSpreadSheet, versionData: newVersionData };
      });

      this.logger.log(`Created new version ${newVersionNumber} for spreadsheet: ${addNewVersionSpreadSheetData.spreadSheetId}`);

      return {
        spreadSheetId: result.spreadSheet.id,
        fileName: result.spreadSheet.fileName,
        spreadSheetVersionNumber: result.spreadSheet.latestVersion,
        lastModified: result.spreadSheet.updatedAt
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to add new version: ${safeError.message}`, safeError.details);
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

  async loadWholeTableDataJson(spreadSheetId: string, userId: string, spreadSheetVersionNumber: number): Promise<Record<string, any>> {
    try {
      // 1. 사용자 검증
      await this.userService.validateUser(userId);

      // 2. 스프레드시트 존재 및 권한 확인
      const spreadSheet = await this.prisma.spreadSheet.findFirst({
        where: {
          id: spreadSheetId,
          userId,
          status: SpreadSheetStatus.ACTIVE
        }
      });

      if (!spreadSheet) {
        throw new NotFoundException('SpreadSheet not found or access denied');
      }

      // 3. 특정 버전의 데이터 조회
      const versionData = await this.prisma.spreadSheetVersionData.findUnique({
        where: {
          spreadSheetId_spreadSheetVersionNumber: {
            spreadSheetId,
            spreadSheetVersionNumber
          }
        },
        select: {
          data: true
        }
      });

      if (!versionData) {
        throw new NotFoundException(`Version ${spreadSheetVersionNumber} not found for spreadsheet ${spreadSheetId}`);
      }

      this.logger.log(`Loaded JSON data for spreadsheet: ${spreadSheetId}, version: ${spreadSheetVersionNumber}, user: ${userId}`);

      // 4. JSON 데이터 반환
      return versionData.data as Record<string, any>;

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to load whole table data JSON: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

  // ==============================================================
  // Private Methods
  // ==============================================================

  private extractSheetCount(json: Record<string, any>): number {
    try {
      const obj: any = typeof (json as any) === 'string' ? JSON.parse(json as unknown as string) : json;
      if (Array.isArray(obj?.sheets)) {
        return obj.sheets.length || 1;
      }
      if (obj?.sheets && typeof obj.sheets === 'object') {
        return Object.keys(obj.sheets).length || 1;
      }
      return 1;
    } catch {
      return 1;
    }
  }
}

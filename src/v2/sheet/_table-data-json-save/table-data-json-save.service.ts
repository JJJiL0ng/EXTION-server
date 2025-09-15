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

  //=============================================================
  // Create New SpreadSheet and New Version
  //=============================================================
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



  //=============================================================
  // Check is data existing and Load Whole Table Data JSON
  //=============================================================

  async checkSheetDataExistence(spreadSheetId: string, userId: string): Promise<{ exists: boolean; latestVersion: number | null }> {
    try {
      this.logger.log(`시트 데이터 존재 여부 확인 시작 - spreadSheetId: ${spreadSheetId}, userId: ${userId}`);

      // 1. 사용자 검증
      await this.userService.validateUser(userId);

      // 2. SpreadSheet 존재 및 권한 확인
      const spreadSheet = await this.prisma.spreadSheet.findFirst({
        where: {
          id: spreadSheetId,
          userId: userId,
          status: 'ACTIVE'
        },
        select: {
          id: true,
          latestVersion: true
        }
      });

      if (!spreadSheet) {
        this.logger.warn(`스프레드시트를 찾을 수 없거나 권한이 없음 - spreadSheetId: ${spreadSheetId}, userId: ${userId}`);
        return { exists: false, latestVersion: null };
      }

      this.logger.log(`시트 데이터 존재 확인 완료 - exists: true, latestVersion: ${spreadSheet.latestVersion}`);
      return {
        exists: true,
        latestVersion: spreadSheet.latestVersion
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`시트 데이터 존재 여부 확인 실패 - spreadSheetId: ${spreadSheetId}, userId: ${userId}: ${safeError.message}`, safeError.details);
      return { exists: false, latestVersion: null };
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

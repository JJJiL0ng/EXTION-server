// src/v2/sheet/table-data-json-save/table-data-json-save.service.ts

import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
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

      // 초기 데이터 준비 - 프론트엔드에서 보낸 JSON을 그대로 사용
      let jsonData: Record<string, any> = {};

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
            editLockVersion: 1, // 낙관적 잠금용
            status: SpreadSheetStatus.ACTIVE
          }
        });

        // 초기 버전 생성 (parentId가 null인 첫 번째 버전)
        const sheetVersionData = await tx.spreadSheetVersionData.create({
          data: {
            spreadSheetId: spreadSheet.id,
            parentId: null, // 첫 번째 버전이므로 부모 없음
            authorId: dto.userId, // 작성자 설정
            name: null, // 기본 버전은 이름 없음
            data: jsonData as any, // JSON 객체 그대로 저장
          }
        });

        // SpreadSheet의 headVersionId를 설정
        await tx.spreadSheet.update({
          where: { id: spreadSheet.id },
          data: {
            headVersionId: sheetVersionData.id
          }
        });

        // Chat 생성 (1:1 관계) - 사용자가 제공한 chatId 사용
        const chat = await tx.chat.create({
          data: {
            id: dto.chatId, // 사용자가 제공한 chatId를 직접 사용
            spreadSheetId: spreadSheet.id,
            userId: dto.userId,
          }
        });

        return { spreadSheet, sheetVersionDataId: sheetVersionData.id, chatId: chat.id };
      });

      this.logger.log(`Created new spreadsheet: ${result.spreadSheet.id} with chat: ${result.chatId}`);

      return {
        spreadSheetId: result.spreadSheet.id,
        fileName: result.spreadSheet.fileName,
        headVersionId: result.sheetVersionDataId,
        lastModified: result.spreadSheet.updatedAt,
        editLockVersion: result.spreadSheet.editLockVersion // 초기 버전 번호 (1) 반환
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

      // 3. 현재 헤드 버전 확인
      if (!existingSpreadSheet.headVersionId) {
        throw new BadRequestException('No head version found for this spreadsheet');
      }

      // 4. 트랜잭션으로 새 버전 생성 및 메타데이터 업데이트
      const result = await this.prisma.$transaction(async (tx) => {
        // 새 버전 데이터 생성 (현재 헤드를 부모로 설정)
        const newVersionData = await tx.spreadSheetVersionData.create({
          data: {
            spreadSheetId: addNewVersionSpreadSheetData.spreadSheetId,
            parentId: existingSpreadSheet.headVersionId, // 현재 헤드를 부모로 설정
            authorId: addNewVersionSpreadSheetData.userId, // 작성자 설정
            name: null, // 자동 생성된 버전은 이름 없음
            data: addNewVersionSpreadSheetData.jsonData as any,
          }
        });

        // 낙관적 잠금을 사용한 스프레드시트 업데이트
        try {
          const updatedSpreadSheet = await tx.spreadSheet.update({
            where: {
              id: addNewVersionSpreadSheetData.spreadSheetId,
              // ✅ 낙관적 잠금: 프론트엔드가 읽었던 버전과 현재 DB 버전이 일치할 때만 업데이트
              editLockVersion: addNewVersionSpreadSheetData.editLockVersion
            },
            data: {
              headVersionId: newVersionData.id, // 새로운 버전을 헤드로 설정
              // ✅ 원자적 증가 연산 사용
              editLockVersion: {
                increment: 1
              }
            }
          });

          return { spreadSheet: updatedSpreadSheet, versionData: newVersionData };

        } catch (error: any) {
          // ✅ Prisma P2025: 조건에 맞는 레코드를 찾지 못함 (다른 사용자가 먼저 수정함)
          if (error.code === 'P2025') {
            throw new ConflictException(
              '문서가 다른 사용자에 의해 변경되었습니다. 페이지를 새로고침 후 다시 시도해주세요.'
            );
          }
          // 그 외 에러는 그대로 전파
          throw error;
        }
      });

      this.logger.log(`Created new version for spreadsheet: ${addNewVersionSpreadSheetData.spreadSheetId}`);

      return {
        spreadSheetId: result.spreadSheet.id,
        fileName: result.spreadSheet.fileName,
        headVersionId: result.versionData.id,
        lastModified: result.spreadSheet.updatedAt,
        editLockVersion: result.spreadSheet.editLockVersion // 증가된 버전 번호 반환
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

  async checkSheetDataExistence(spreadSheetId: string, userId: string): Promise<{ exists: boolean; headVersionId: string | null }> {
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
          headVersionId: true
        }
      });

      if (!spreadSheet) {
        this.logger.warn(`스프레드시트를 찾을 수 없거나 권한이 없음 - spreadSheetId: ${spreadSheetId}, userId: ${userId}`);
        return { exists: false, headVersionId: null };
      }

      this.logger.log(`시트 데이터 존재 확인 완료 - exists: true, headVersionId: ${spreadSheet.headVersionId}`);
      return {
        exists: true,
        headVersionId: spreadSheet.headVersionId
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`시트 데이터 존재 여부 확인 실패 - spreadSheetId: ${spreadSheetId}, userId: ${userId}: ${safeError.message}`, safeError.details);
      return { exists: false, headVersionId: null };
    }
  }

  async loadWholeTableDataJson(spreadSheetId: string, userId: string, spreadSheetversionId?: string): Promise<Record<string, any>> {
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

      // 3. 버전 ID 결정 (제공되지 않으면 헤드 버전 사용)
      const targetVersionId = spreadSheetversionId || spreadSheet.headVersionId;

      if (!targetVersionId) {
        throw new NotFoundException('No version available for this spreadsheet');
      }

      // 4. 특정 버전의 데이터 조회
      const versionData = await this.prisma.spreadSheetVersionData.findUnique({
        where: {
          id: targetVersionId
        },
        select: {
          data: true
        }
      });

      if (!versionData) {
        throw new NotFoundException(`Version ${targetVersionId} not found for spreadsheet ${spreadSheetId}`);
      }

      this.logger.log(`Loaded JSON data for spreadsheet: ${spreadSheetId}, version: ${targetVersionId}, user: ${userId}`);

      // 5. JSON 데이터 반환
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

  /**
   * 스프레드시트 버전 히스토리를 조회 (Git-like 구조)
   */
  async getVersionHistory(spreadSheetId: string, userId: string): Promise<any[]> {
    try {
      // 사용자 검증
      await this.userService.validateUser(userId);

      // 스프레드시트 존재 및 권한 확인
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

      // 모든 버전 데이터 조회 (최신부터)
      const versions = await this.prisma.spreadSheetVersionData.findMany({
        where: {
          spreadSheetId: spreadSheetId
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true
            }
          }
        },
        orderBy: {
          savedAt: 'desc'
        }
      });

      return versions.map(version => ({
        id: version.id,
        name: version.name,
        parentId: version.parentId,
        author: version.author,
        savedAt: version.savedAt,
        isHead: version.id === spreadSheet.headVersionId
      }));

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to get version history: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

}

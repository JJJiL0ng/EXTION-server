// src/v2/sheet/table-data-json-save/table-data-json-save.service.ts

import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { UserService } from '../../user/user.service';
import { CreateSpreadSheetDto } from './dto/table-data-json-save.dto';
import {
  LoadSpreadSheetResponse,
  createSafeError,
  AddNewVersionSpreadSheetData
} from '../types/spreadsheet.types';
import { SpreadsheetRepository } from '../repositories/spreadsheet.repository';


@Injectable()
export class TableDataJsonSaveService {
  private readonly logger = new Logger(TableDataJsonSaveService.name);
  
  constructor(
    private readonly spreadsheetRepository: SpreadsheetRepository,
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
      const result = await this.spreadsheetRepository.transaction(async (tx) => {
        // SpreadSheet 생성 - 프론트엔드에서 제공한 ID 사용
        const spreadSheet = await this.spreadsheetRepository.createSpreadSheet({
          id: dto.spreadsheetId,
          fileName: dto.fileName,
          userId: dto.userId,
          editLockVersion: 1,
        }, tx);

        // 초기 버전 생성 (parentId가 null인 첫 번째 버전)
        const sheetVersionData = await this.spreadsheetRepository.createVersion({
          spreadSheetId: spreadSheet.id,
          parentId: null,
          authorId: dto.userId,
          name: null,
          data: jsonData,
        }, tx);

        // SpreadSheet의 headVersionId를 설정
        await this.spreadsheetRepository.updateHeadVersion(spreadSheet.id, sheetVersionData.id, tx);

        // Chat 생성 (1:1 관계) - 사용자가 제공한 chatId 사용
        const chat = await this.spreadsheetRepository.createChat({
          id: dto.chatId,
          spreadSheetId: spreadSheet.id,
          userId: dto.userId,
        }, tx);

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
      const existingSpreadSheet = await this.spreadsheetRepository.findActiveByIdAndUser(
        addNewVersionSpreadSheetData.spreadSheetId,
        addNewVersionSpreadSheetData.userId,
      );

      if (!existingSpreadSheet) {
        throw new NotFoundException('SpreadSheet not found or access denied');
      }

      // 3. 현재 헤드 버전 확인
      if (!existingSpreadSheet.headVersionId) {
        throw new BadRequestException('No head version found for this spreadsheet');
      }

      // 4. 트랜잭션으로 새 버전 생성 및 메타데이터 업데이트
      const result = await this.spreadsheetRepository.transaction(async (tx) => {
        // 새 버전 데이터 생성 (현재 헤드를 부모로 설정)
        const newVersionData = await this.spreadsheetRepository.createVersion({
          spreadSheetId: addNewVersionSpreadSheetData.spreadSheetId,
          parentId: existingSpreadSheet.headVersionId,
          authorId: addNewVersionSpreadSheetData.userId,
          name: null,
          data: addNewVersionSpreadSheetData.jsonData,
        }, tx);

        // 낙관적 잠금을 사용한 스프레드시트 업데이트
        try {
          const updatedSpreadSheet = await this.spreadsheetRepository.updateHeadWithOptimisticLock({
            spreadSheetId: addNewVersionSpreadSheetData.spreadSheetId,
            headVersionId: newVersionData.id,
            editLockVersion: addNewVersionSpreadSheetData.editLockVersion,
          }, tx);

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

  async checkSheetDataExistence(spreadSheetId: string, userId: string): Promise<{ exists: boolean; headVersionId: string | null; fileName?: string }> {
    try {
      this.logger.log(`시트 데이터 존재 여부 확인 시작 - spreadSheetId: ${spreadSheetId}, userId: ${userId}`);

      // 2. SpreadSheet 존재 및 권한 확인
      const spreadSheet = await this.spreadsheetRepository.findActiveByIdAndUser(
        spreadSheetId,
        userId,
      );

      if (!spreadSheet) {
        this.logger.warn(`스프레드시트를 찾을 수 없거나 권한이 없음 - spreadSheetId: ${spreadSheetId}, userId: ${userId}`);
        return { exists: false, headVersionId: null };
      }

      this.logger.log(`시트 데이터 존재 확인 완료 - exists: true, headVersionId: ${spreadSheet.headVersionId}`);
      return {
        exists: true,
        headVersionId: spreadSheet.headVersionId,
        fileName: spreadSheet.fileName
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
      const spreadSheet = await this.spreadsheetRepository.findActiveByIdAndUser(
        spreadSheetId,
        userId,
      );

      if (!spreadSheet) {
        throw new NotFoundException('SpreadSheet not found or access denied');
      }

      // 3. 버전 ID 결정 (제공되지 않으면 헤드 버전 사용)
      const targetVersionId = spreadSheetversionId || spreadSheet.headVersionId;

      if (!targetVersionId) {
        throw new NotFoundException('No version available for this spreadsheet');
      }

      // 4. 특정 버전의 데이터 조회
      const versionData = await this.spreadsheetRepository.findVersionData(targetVersionId);

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
      const spreadSheet = await this.spreadsheetRepository.findActiveByIdAndUser(
        spreadSheetId,
        userId,
      );

      if (!spreadSheet) {
        throw new NotFoundException('SpreadSheet not found or access denied');
      }

      // 모든 버전 데이터 조회 (최신부터)
      const versions = await this.spreadsheetRepository.findVersionsBySpreadSheet(spreadSheetId);

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

  //=============================================================
  // Rename SpreadSheet FileName
  //=============================================================
  async renameFileName(spreadSheetId: string, userId: string, newFileName: string): Promise<void> {
    try {
      this.logger.log(`파일 이름 변경 시작 - spreadSheetId: ${spreadSheetId}, userId: ${userId}, newFileName: ${newFileName}`);

      // 1. 사용자 검증
      await this.userService.validateUser(userId);

      // 2. 스프레드시트 존재 및 권한 확인
      const spreadSheet = await this.spreadsheetRepository.findActiveByIdAndUser(
        spreadSheetId,
        userId,
      );

      if (!spreadSheet) {
        this.logger.warn(`스프레드시트를 찾을 수 없거나 권한이 없음 - spreadSheetId: ${spreadSheetId}, userId: ${userId}`);
        throw new NotFoundException('스프레드시트를 찾을 수 없거나 접근 권한이 없습니다.');
      }

      // 3. 파일 이름 업데이트
      await this.spreadsheetRepository.updateFileName(spreadSheetId, newFileName);

      this.logger.log(`파일 이름 변경 완료 - spreadSheetId: ${spreadSheetId}, oldFileName: ${spreadSheet.fileName}, newFileName: ${newFileName}`);

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`파일 이름 변경 실패 - spreadSheetId: ${spreadSheetId}, userId: ${userId}: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

}

// src/common/services/spreadsheet.service.ts - 스프레드시트 저장 서비스
import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateSpreadsheetDto, UpdateSheetDataDto, DataStorageType } from '../dto/spreadsheet.dto';
import { getStorage } from 'firebase-admin/storage';
import * as crypto from 'crypto';

@Injectable()
export class SheetService {
    private readonly logger = new Logger(SheetService.name);
    private storage = getStorage();

    constructor(private firebaseService: FirebaseService) { }

    // === 스프레드시트 생성 및 저장 ===
    // === 스프레드시트 생성 및 저장 ===
    async createSpreadsheet(userId: string, dto: CreateSpreadsheetDto): Promise<string> {
        try {
            const spreadsheetRef = this.firebaseService.firestore.collection('spreadsheets').doc();

            // 데이터 크기에 따른 저장 전략 결정
            const storageStrategy = await this.determineStorageStrategy(dto);

            // 메타데이터만 저장 (실제 데이터는 제외)
            const spreadsheetData = {
                id: spreadsheetRef.id,
                userId,
                chatId: dto.chatId || null,
                fileName: dto.fileName,
                originalFileName: dto.originalFileName,
                fileSize: dto.fileSize,
                fileType: dto.fileType,
                sheets: dto.sheets.map(sheet => ({
                    sheetName: sheet.sheetName,
                    sheetIndex: sheet.sheetIndex,
                    headers: sheet.headers || [],
                    metadata: {
                        rowCount: sheet.data?.rows?.length || 0,
                        columnCount: sheet.headers?.length || 0,
                        headerRow: 0,
                        dataRange: this.calculateDataRange(sheet),
                        hasFormulas: Boolean(sheet.formulas && sheet.formulas.length > 0),
                        lastModified: new Date(),
                    }
                    // 실제 데이터는 여기서 제외하고 별도 저장
                })),
                activeSheetIndex: dto.activeSheetIndex || 0,
                dataStorageType: storageStrategy.type,
                dataPath: storageStrategy.path || null,
                version: 1,
                versionHistory: [{
                    version: 1,
                    timestamp: new Date(),
                    changeDescription: '초기 생성',
                    changedBy: 'user'
                }],
                permissions: {
                    owner: userId,
                    shared: []
                },
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // 메타데이터 저장
            await spreadsheetRef.set(spreadsheetData);

            // 실제 시트 데이터 저장 (별도 컬렉션에)
            await this.saveSheetData(spreadsheetRef.id, dto.sheets, storageStrategy);

            this.logger.log(`스프레드시트 생성 완료: ${spreadsheetRef.id}`);
            return spreadsheetRef.id;

        } catch (error) {
            this.logger.error('스프레드시트 생성 오류:', error);
            throw error;
        }
    }
    // === 데이터 크기에 따른 저장 전략 결정 ===
    private async determineStorageStrategy(dto: CreateSpreadsheetDto): Promise<{
        type: DataStorageType;
        path?: string;
    }> {
        const totalDataSize = this.calculateTotalDataSize(dto.sheets);

        if (totalDataSize < 1024 * 1024) { // 1MB 미만
            return { type: DataStorageType.FIRESTORE };
        } else if (totalDataSize < 10 * 1024 * 1024) { // 10MB 미만
            return {
                type: DataStorageType.CLOUD_STORAGE,
                path: `spreadsheets/${dto.chatId}/${Date.now()}.json`
            };
        } else {
            return {
                type: DataStorageType.ENCRYPTED,
                path: `spreadsheets/${dto.chatId}/${Date.now()}.encrypted`
            };
        }
    }

    // === 데이터 크기 계산 ===
    private calculateTotalDataSize(sheets: any[]): number {
        let totalSize = 0;

        sheets.forEach(sheet => {
            if (sheet.data) {
                const dataString = JSON.stringify(sheet.data);
                totalSize += Buffer.byteLength(dataString, 'utf8');
            }
        });

        return totalSize;
    }

    private async saveSheetData(
        spreadsheetId: string,
        sheets: any[],
        storageStrategy: { type: DataStorageType; path?: string }
    ): Promise<void> {

        for (const sheet of sheets) {
            const sheetRef = this.firebaseService.firestore
                .collection('spreadsheets')
                .doc(spreadsheetId)
                .collection('sheets')
                .doc(sheet.sheetIndex.toString());
            

            // 기본 시트 메타데이터
            const sheetMetadata = {
                sheetIndex: sheet.sheetIndex,
                sheetName: sheet.sheetName,
                spreadsheetId,
                headers: sheet.headers || [],
                createdAt: new Date(),
                updatedAt: new Date(),
                chatMetadata: {
                    messageCount: 0,
                    lastActivityAt: new Date(),
                    hasActiveFormulas: Boolean(sheet.formulas && sheet.formulas.length > 0),
                    hasArtifacts: false
                }
            };

            if (storageStrategy.type === DataStorageType.FIRESTORE) {
                // Firestore에 저장 시 데이터를 평면화
                const flattenedData = this.flattenSheetData(sheet);

                await sheetRef.set({
                    ...sheetMetadata,
                    ...flattenedData
                });

                // 행 데이터 별도 저장
                if (sheet.data?.rows && Array.isArray(sheet.data.rows)) {
                    await this.saveSheetRows(spreadsheetId, sheet.sheetIndex, sheet.data.rows);
                }

            } else {
                // Cloud Storage나 암호화 저장
                const storageData = {
                    headers: sheet.headers || [],
                    rows: sheet.data?.rows || [],
                    rawData: sheet.data?.rawData || [],
                    computedData: sheet.computedData || [],
                    formulas: sheet.formulas || []
                };

                if (storageStrategy.type === DataStorageType.CLOUD_STORAGE) {
                    const storagePath = `${storageStrategy.path}/${sheet.sheetIndex}.json`;
                    await this.saveToCloudStorage(storagePath, storageData);

                    await sheetRef.set({
                        ...sheetMetadata,
                        dataReference: {
                            storagePath,
                            format: 'json',
                            size: Buffer.byteLength(JSON.stringify(storageData), 'utf8'),
                            checksum: this.generateChecksum(JSON.stringify(storageData))
                        }
                    });
                } else if (storageStrategy.type === DataStorageType.ENCRYPTED) {
                    const encryptedData = await this.encryptData(storageData);
                    const storagePath = `${storageStrategy.path}/${sheet.sheetIndex}.encrypted`;
                    await this.saveToCloudStorage(storagePath, encryptedData);

                    await sheetRef.set({
                        ...sheetMetadata,
                        dataReference: {
                            storagePath,
                            format: 'encrypted',
                            size: Buffer.byteLength(encryptedData, 'utf8'),
                            checksum: this.generateChecksum(encryptedData)
                        }
                    });
                }
            }
        }
    }
    // === 시트 데이터를 Firestore에 저장 가능한 형태로 평면화 ===
    private flattenSheetData(sheet: any): any {
        const result: any = {};

        // 헤더 저장
        if (sheet.headers && Array.isArray(sheet.headers)) {
            result.headers = sheet.headers;
        }

        // 행 데이터를 개별 문서로 분할하여 저장
        if (sheet.data?.rows && Array.isArray(sheet.data.rows)) {
            result.rowCount = sheet.data.rows.length;
            result.hasData = true;

            // 실제 행 데이터는 별도 서브컬렉션에 저장될 예정
            // 여기서는 메타데이터만 저장
        } else {
            result.rowCount = 0;
            result.hasData = false;
        }

        // 수식 정보
        if (sheet.formulas && Array.isArray(sheet.formulas)) {
            result.formulas = sheet.formulas;
        }

        return result;
    }

    // === 행 데이터를 별도 서브컬렉션에 저장 ===
    private async saveSheetRows(
        spreadsheetId: string,
        sheetIndex: number,
        rows: string[][]
    ): Promise<void> {
        if (!rows || rows.length === 0) return;

        const batch = this.firebaseService.firestore.batch();
        const sheetRowsRef = this.firebaseService.firestore
            .collection('spreadsheets')
            .doc(spreadsheetId)
            .collection('sheets')
            .doc(sheetIndex.toString())
            .collection('rows');

        // 배치로 행 데이터 저장 (최대 500개씩)
        for (let i = 0; i < rows.length; i++) {
            const rowRef = sheetRowsRef.doc(i.toString());
            batch.set(rowRef, {
                rowIndex: i,
                data: rows[i] || [],
                createdAt: new Date()
            });

            // Firestore 배치 제한 (500개)에 도달하면 커밋
            if ((i + 1) % 500 === 0) {
                await batch.commit();
            }
        }

        // 남은 데이터 커밋
        await batch.commit();
    }



    // === Cloud Storage 저장 ===
    private async saveToCloudStorage(path: string, data: any): Promise<void> {
        try {
            const bucket = this.storage.bucket();
            const file = bucket.file(path);

            const dataString = typeof data === 'string' ? data : JSON.stringify(data);

            await file.save(dataString, {
                metadata: {
                    contentType: 'application/json',
                    cacheControl: 'private, max-age=0'
                }
            });

            this.logger.log(`Cloud Storage 저장 완료: ${path}`);
        } catch (error) {
            this.logger.error(`Cloud Storage 저장 오류: ${path}`, error);
            throw error;
        }
    }

    // === 데이터 암호화 ===
    private async encryptData(data: any): Promise<string> {
        const algorithm = 'aes-256-gcm';
        const key = Buffer.from(process.env.ENCRYPTION_KEY || 'your-32-char-encryption-key-here', 'utf8');
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv(algorithm, key, iv);

        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return JSON.stringify({
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        });
    }

    // === 체크섬 생성 ===
    private generateChecksum(data: string): string {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    private calculateDataRange(sheet: any) {
        const rowCount = sheet.data?.rows?.length || 0;
        const colCount = sheet.headers?.length || 0;

        return {
            startRow: 1,
            endRow: rowCount,
            startCol: 0,
            endCol: Math.max(0, colCount - 1),
            startColLetter: 'A',
            endColLetter: colCount > 0 ? String.fromCharCode(65 + colCount - 1) : 'A'
        };
    }

    // === 시트 데이터 조회 ===
    async getSheetData(spreadsheetId: string, sheetIndex: number): Promise<any> {
        try {
            const sheetDoc = await this.firebaseService.firestore
                .collection('spreadsheets')
                .doc(spreadsheetId)
                .collection('sheets')
                .doc(sheetIndex.toString())
                .get();

            const sheetData = sheetDoc.data();

            if (!sheetDoc.exists || !sheetData) {
                throw new Error('시트를 찾을 수 없습니다.');
            }

            if (sheetData.data) {
                // Firestore에 직접 저장된 경우
                return sheetData;
            } else if (sheetData.dataReference) {
                // Cloud Storage에 저장된 경우
                return await this.loadFromCloudStorage(sheetData.dataReference);
            }

            throw new Error('시트 데이터를 찾을 수 없습니다.');

        } catch (error) {
            this.logger.error('시트 데이터 조회 오류:', error);
            throw error;
        }
    }

    // === Cloud Storage에서 데이터 로드 ===
    private async loadFromCloudStorage(dataReference: any): Promise<any> {
        try {
            const bucket = this.storage.bucket();
            const file = bucket.file(dataReference.storagePath);

            const [contents] = await file.download();
            const dataString = contents.toString('utf8');

            if (dataReference.format === 'encrypted') {
                return await this.decryptData(dataString);
            } else {
                return JSON.parse(dataString);
            }

        } catch (error) {
            this.logger.error('Cloud Storage 로드 오류:', error);
            throw error;
        }
    }

    // === 데이터 복호화 ===
    private async decryptData(encryptedDataString: string): Promise<any> {
        const algorithm = 'aes-256-gcm';
        const key = Buffer.from(process.env.ENCRYPTION_KEY || 'your-32-char-encryption-key-here', 'utf8');

        const encryptedData = JSON.parse(encryptedDataString);
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const decipher = crypto.createDecipheriv(algorithm, key, iv);

        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    }

    // === 시트 데이터 업데이트 ===
    async updateSheetData(userId: string, dto: UpdateSheetDataDto): Promise<void> {
        try {
            // 스프레드시트 소유권 확인
            const spreadsheetDoc = await this.firebaseService.firestore
                .collection('spreadsheets')
                .doc(dto.spreadsheetId)
                .get();

            const spreadsheetData = spreadsheetDoc.data();
            if (!spreadsheetDoc.exists || !spreadsheetData || spreadsheetData.userId !== userId) {
                throw new Error('스프레드시트 접근 권한이 없습니다.');
            }

            // 시트 데이터 업데이트
            const sheetRef = this.firebaseService.firestore
                .collection('spreadsheets')
                .doc(dto.spreadsheetId)
                .collection('sheets')
                .doc(dto.sheetIndex.toString());

            const updateData: any = {
                updatedAt: new Date()
            };

            if (dto.data) {
                updateData.data = dto.data;
            }

            if (dto.computedData) {
                updateData.computedData = dto.computedData;
            }

            if (dto.formulas) {
                updateData.formulas = dto.formulas;
            }

            await sheetRef.update(updateData);

            // 버전 히스토리 업데이트
            await this.updateVersionHistory(dto.spreadsheetId, 'AI 데이터 수정');

            this.logger.log(`시트 데이터 업데이트 완료: ${dto.spreadsheetId}/${dto.sheetIndex}`);

        } catch (error) {
            this.logger.error('시트 데이터 업데이트 오류:', error);
            throw error;
        }
    }

    // === 버전 히스토리 업데이트 ===
    private async updateVersionHistory(spreadsheetId: string, changeDescription: string): Promise<void> {
        const spreadsheetRef = this.firebaseService.firestore.collection('spreadsheets').doc(spreadsheetId);

        await spreadsheetRef.update({
            version: this.firebaseService.FieldValue.increment(1),
            versionHistory: this.firebaseService.FieldValue.arrayUnion({
                version: Date.now(), // 임시로 timestamp 사용
                timestamp: new Date(),
                changeDescription,
                changedBy: 'ai'
            }),
            updatedAt: new Date()
        });
    }

    // === 스프레드시트 삭제 ===
    async deleteSpreadsheet(userId: string, spreadsheetId: string): Promise<void> {
        try {
            // 소유권 확인
            const spreadsheetDoc = await this.firebaseService.firestore
                .collection('spreadsheets')
                .doc(spreadsheetId)
                .get();

            const spreadsheetData = spreadsheetDoc.data();
            if (!spreadsheetDoc.exists || !spreadsheetData || spreadsheetData.userId !== userId) {
                throw new Error('스프레드시트 접근 권한이 없습니다.');
            }

            // 모든 시트 데이터 삭제
            const sheetsSnapshot = await this.firebaseService.firestore
                .collection('spreadsheets')
                .doc(spreadsheetId)
                .collection('sheets')
                .get();

            const batch = this.firebaseService.firestore.batch();

            sheetsSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            // 스프레드시트 메타데이터 삭제
            batch.delete(spreadsheetDoc.ref);

            await batch.commit();

            this.logger.log(`스프레드시트 삭제 완료: ${spreadsheetId}`);

        } catch (error) {
            this.logger.error('스프레드시트 삭제 오류:', error);
            throw error;
        }
    }
    // === 스프레드시트 메타데이터 조회 ===
    async getSpreadsheetMetadata(spreadsheetId: string, userId: string): Promise<any> {
        try {
          const spreadsheetDoc = await this.firebaseService.firestore
            .collection('spreadsheets')
            .doc(spreadsheetId)
            .get();
       
          if (!spreadsheetDoc.exists) {
            throw new Error('스프레드시트를 찾을 수 없습니다.');
          }
       
          const spreadsheetData = spreadsheetDoc.data();
       
          // 소유권 확인
          if (spreadsheetData!.userId !== userId) {
            throw new Error('스프레드시트 접근 권한이 없습니다.');
          }
       
          return {
            id: spreadsheetData!.id,
            fileName: spreadsheetData!.fileName,
            originalFileName: spreadsheetData!.originalFileName,
            fileSize: spreadsheetData!.fileSize,
            fileType: spreadsheetData!.fileType,
            activeSheetIndex: spreadsheetData!.activeSheetIndex,
            dataStorageType: spreadsheetData!.dataStorageType,
            sheets: spreadsheetData!.sheets,
            version: spreadsheetData!.version,
            createdAt: spreadsheetData!.createdAt,
            updatedAt: spreadsheetData!.updatedAt,
            chatId: spreadsheetData!.chatId
          };
       
        } catch (error) {
          this.logger.error('스프레드시트 메타데이터 조회 오류:', error);
          throw error;
        }
    }
   
   // === 시트 행 데이터 조회 (페이지네이션) ===
   async getSheetRows(
    spreadsheetId: string, 
    sheetIndex: number, 
    limit: number = 100, 
    offset: number = 0
   ): Promise<any[]> {
    try {
      // 먼저 스프레드시트와 시트가 존재하는지 확인
      const sheetDoc = await this.firebaseService.firestore
        .collection('spreadsheets')
        .doc(spreadsheetId)
        .collection('sheets')
        .doc(sheetIndex.toString())
        .get();
   
      if (!sheetDoc.exists) {
        throw new Error('시트를 찾을 수 없습니다.');
      }
   
      const sheetData = sheetDoc.data();
   
      // 데이터 저장 타입에 따라 다르게 처리
      if (sheetData!.dataReference) {
        // Cloud Storage나 암호화된 데이터인 경우
        return await this.loadFromCloudStorage(sheetData!.dataReference);
      } else if (sheetData!.hasData) {
        // Firestore 서브컬렉션에서 행 데이터 조회
        const rowsQuery = await this.firebaseService.firestore
          .collection('spreadsheets')
          .doc(spreadsheetId)
          .collection('sheets')
          .doc(sheetIndex.toString())
          .collection('rows')
          .orderBy('rowIndex')
          .offset(offset)
          .limit(limit)
          .get();
   
        const rows: { rowIndex: number; data: any[] }[] = [];
        rowsQuery.docs.forEach(doc => {
          const rowData = doc.data();
          rows.push({
            rowIndex: rowData.rowIndex,
            data: rowData.data || []
          });
        });
   
        return rows;
      } else {
        // 데이터가 없는 경우
        return [];
      }
   
    } catch (error) {
      this.logger.error('시트 행 데이터 조회 오류:', error);
      throw error;
    }
   }
   
   // === 전체 스프레드시트 조회 (메타데이터 + 모든 시트 데이터) ===
   async getFullSpreadsheet(spreadsheetId: string, userId: string): Promise<any> {
    try {
      // 메타데이터 조회
      const metadata = await this.getSpreadsheetMetadata(spreadsheetId, userId);
      
      // 모든 시트의 데이터 조회
      const sheetsWithData: any[] = [];
      
      for (let i = 0; i < metadata.sheets.length; i++) {
        const sheetMetadata = metadata.sheets[i];
        
        try {
          // 시트 기본 정보 조회
          const sheetDoc = await this.firebaseService.firestore
            .collection('spreadsheets')
            .doc(spreadsheetId)
            .collection('sheets')
            .doc(sheetMetadata.sheetIndex.toString())
            .get();
   
          if (sheetDoc.exists) {
            const sheetData = sheetDoc.data();
            
            let rows: any[] = [];
            let formulas: any[] = [];
            let computedData: any[] = [];
   
            // 데이터 타입에 따라 데이터 로드
            if (sheetData!.dataReference) {
              // Cloud Storage나 암호화된 데이터
              const storageData = await this.loadFromCloudStorage(sheetData!.dataReference);
              rows = storageData.rows || [];
              formulas = storageData.formulas || [];
              computedData = storageData.computedData || [];
            } else if (sheetData!.hasData) {
              // Firestore 서브컬렉션에서 모든 행 데이터 조회
              const allRowsQuery = await this.firebaseService.firestore
                .collection('spreadsheets')
                .doc(spreadsheetId)
                .collection('sheets')
                .doc(sheetMetadata.sheetIndex.toString())
                .collection('rows')
                .orderBy('rowIndex')
                .get();
   
              allRowsQuery.docs.forEach(doc => {
                const rowData = doc.data();
                rows.push(rowData.data || []);
              });
   
              formulas = sheetData!.formulas || [];
              computedData = sheetData!.computedData || [];
            }
   
            sheetsWithData.push({
              sheetName: sheetMetadata.sheetName,
              sheetIndex: sheetMetadata.sheetIndex,
              headers: sheetMetadata.headers,
              metadata: sheetMetadata.metadata,
              data: {
                headers: sheetMetadata.headers,
                rows: rows,
                rawData: rows // rawData와 rows는 동일하게 처리
              },
              computedData,
              formulas,
              chatMetadata: sheetData!.chatMetadata
            });
          }
        } catch (sheetError) {
          this.logger.warn(`시트 ${i} 데이터 로드 실패:`, sheetError);
          // 시트 데이터 로드 실패 시 메타데이터만 포함
          sheetsWithData.push({
            ...sheetMetadata,
            data: { headers: sheetMetadata.headers, rows: [] },
            error: '시트 데이터 로드 실패'
          });
        }
      }
   
      return {
        ...metadata,
        sheets: sheetsWithData
      };
   
    } catch (error) {
      this.logger.error('전체 스프레드시트 조회 오류:', error);
      throw error;
    }
   }
   
   // === 사용자 스프레드시트 목록 조회 ===
   async getUserSpreadsheets(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    chatId?: string
   ): Promise<any[]> {
    try {
      let query = this.firebaseService.firestore
        .collection('spreadsheets')
        .where('userId', '==', userId)
        .orderBy('updatedAt', 'desc');
   
      // 특정 채팅의 스프레드시트만 조회하는 경우
      if (chatId) {
        query = query.where('chatId', '==', chatId);
      }
   
      // 페이지네이션 적용
      const snapshot = await query
        .offset(offset)
        .limit(limit)
        .get();
   
      const spreadsheets: any[] = [];
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        spreadsheets.push({
          id: data.id,
          fileName: data.fileName,
          originalFileName: data.originalFileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
          chatId: data.chatId,
          activeSheetIndex: data.activeSheetIndex,
          sheetsCount: data.sheets?.length || 0,
          sheetsInfo: data.sheets?.map(sheet => ({
            sheetName: sheet.sheetName,
            sheetIndex: sheet.sheetIndex,
            rowCount: sheet.metadata?.rowCount || 0,
            columnCount: sheet.metadata?.columnCount || 0
          })) || [],
          version: data.version,
          dataStorageType: data.dataStorageType,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          permissions: data.permissions
        });
      });
   
      return spreadsheets;
   
    } catch (error) {
      this.logger.error('사용자 스프레드시트 목록 조회 오류:', error);
      throw error;
    }
   }
   
   // === 특정 채팅의 스프레드시트 조회 ===
   async getChatSpreadsheets(chatId: string, userId: string): Promise<any[]> {
    try {
      const snapshot = await this.firebaseService.firestore
        .collection('spreadsheets')
        .where('chatId', '==', chatId)
        .where('userId', '==', userId)
        .orderBy('updatedAt', 'desc')
        .get();
   
      const spreadsheets: any[] = [];
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        spreadsheets.push({
          id: data.id,
          fileName: data.fileName,
          originalFileName: data.originalFileName,
          fileType: data.fileType,
          activeSheetIndex: data.activeSheetIndex,
          sheetsCount: data.sheets?.length || 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });
   
      return spreadsheets;
   
    } catch (error) {
      this.logger.error('채팅 스프레드시트 조회 오류:', error);
      throw error;
    }
   }
   
   // === 스프레드시트 검색 ===
   async searchSpreadsheets(
    userId: string, 
    searchTerm: string, 
    limit: number = 10
   ): Promise<any[]> {
    try {
      // Firestore는 full-text search를 지원하지 않으므로 
      // 파일명으로 단순 필터링 (부분 검색은 클라이언트에서 처리)
      const snapshot = await this.firebaseService.firestore
        .collection('spreadsheets')
        .where('userId', '==', userId)
        .orderBy('updatedAt', 'desc')
        .limit(limit * 3) // 필터링을 고려해 더 많이 가져옴
        .get();
   
      const searchResults: any[] = [];
      const searchLower = searchTerm.toLowerCase();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const fileName = (data.fileName || '').toLowerCase();
        const originalFileName = (data.originalFileName || '').toLowerCase();
        
        // 파일명에 검색어가 포함된 경우
        if (fileName.includes(searchLower) || originalFileName.includes(searchLower)) {
          searchResults.push({
            id: data.id,
            fileName: data.fileName,
            originalFileName: data.originalFileName,
            fileType: data.fileType,
            chatId: data.chatId,
            sheetsCount: data.sheets?.length || 0,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          });
        }
      });
   
      return searchResults.slice(0, limit);
   
    } catch (error) {
      this.logger.error('스프레드시트 검색 오류:', error);
      throw error;
    }
   }
}
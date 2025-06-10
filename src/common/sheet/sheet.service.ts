// src/common/services/spreadsheet.service.ts - 스프레드시트 저장 서비스
import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateSpreadsheetDto, UpdateSheetDataDto, DataStorageType } from './dto/spreadsheet.dto';
import { getStorage } from 'firebase-admin/storage';
import * as crypto from 'crypto';

@Injectable()
export class SheetService {
    private readonly logger = new Logger(SheetService.name);
    private storage = getStorage();
    
    // 청크 크기 설정 (한 문서당 저장할 행 수)
    private readonly CHUNK_SIZE = 500; // 500행씩 묶어서 저장
    private readonly MAX_FIRESTORE_SIZE = 800 * 1024; // 800KB (1MB 한도의 80%)

    constructor(private firebaseService: FirebaseService) { }

    // === 스프레드시트 생성 및 저장 (개선된 버전) ===
    async createSpreadsheet(userId: string | undefined, dto: CreateSpreadsheetDto): Promise<{
        spreadsheetId: string;
        chatId: string;
        sheets: Array<{
            sheetId: string;
            sheetIndex: number;
            sheetName: string;
            rowCount: number;
        }>;
    }> {
        try {
            const spreadsheetId = dto.spreadsheetId || this.firebaseService.firestore.collection('spreadsheets').doc().id;
            const chatId = dto.chatId || this.firebaseService.firestore.collection('chats').doc().id;
            const spreadsheetRef = this.firebaseService.firestore.collection('spreadsheets').doc(spreadsheetId);
            const spreadsheetDoc = await spreadsheetRef.get();
    
            const isUpdate = spreadsheetDoc.exists;
    
            if (isUpdate) {
                // 업데이트 시 소유권 확인
                const existingData = spreadsheetDoc.data();
                if (!existingData || existingData.userId !== userId) {
                    throw new Error('스프레드시트 접근 권한이 없습니다.');
                }
                this.logger.log(`기존 스프레드시트 교체 시작: ${spreadsheetId}`);
                // 기존 시트 데이터 삭제
                await this.deleteAllSheetDataForReplace(spreadsheetId);
            } else {
                if (dto.spreadsheetId) {
                    this.logger.log(`제공된 ID로 새 스프레드시트 생성: ${spreadsheetId}`);
                } else {
                    this.logger.log(`새 스프레드시트 생성 (자동 ID): ${spreadsheetId}`);
                }
            }
    
            // 데이터 크기에 따른 저장 전략 결정
            const storageStrategy = await this.determineStorageStrategy(dto, chatId);
    
            // 실제 시트 데이터 저장
            const sheetInfos = await this.saveSheetData(spreadsheetId, dto.sheets, storageStrategy);
    
            // 공통 메타데이터
            const sheetMetadata = dto.sheets.map(sheet => ({
                sheetName: sheet.sheetName,
                sheetIndex: sheet.sheetIndex,
                metadata: {
                    rowCount: sheet.data?.length || 0,
                    columnCount: sheet.data?.[0]?.length || 0,
                    headerRow: 0,
                    dataRange: this.calculateDataRange(sheet),
                    hasFormulas: Boolean(sheet.formulas && sheet.formulas.length > 0),
                    lastModified: new Date(),
                    chunkCount: Math.ceil((sheet.data?.length || 0) / this.CHUNK_SIZE),
                    chunkSize: this.CHUNK_SIZE
                }
            }));

            const commonData = {
                fileName: dto.fileName,
                originalFileName: dto.originalFileName,
                fileSize: dto.fileSize,
                fileType: dto.fileType,
                sheets: sheetMetadata,
                activeSheetIndex: dto.activeSheetIndex || 0,
                dataStorageType: storageStrategy.type,
                dataPath: storageStrategy.path || null,
                updatedAt: new Date(),
                chatId: chatId,
            };
    
            if (isUpdate) {
                // 문서 업데이트
                await spreadsheetRef.update({
                    ...commonData,
                    version: this.firebaseService.FieldValue.increment(1),
                    versionHistory: this.firebaseService.FieldValue.arrayUnion({
                        version: Date.now(),
                        timestamp: new Date(),
                        changeDescription: '스프레드시트 교체 (save)',
                        changedBy: 'user'
                    }),
                });
            } else {
                // 새 문서 생성
                const finalUserId = userId || `guest_${this.firebaseService.firestore.collection('users').doc().id}`;
                await spreadsheetRef.set({
                    ...commonData,
                    id: spreadsheetId,
                    userId: finalUserId,
                    version: 1,
                    versionHistory: [{
                        version: 1,
                        timestamp: new Date(),
                        changeDescription: '초기 생성',
                        changedBy: userId ? 'user' : 'guest'
                    }],
                    permissions: {
                        owner: finalUserId,
                        shared: []
                    },
                    createdAt: new Date(),
                });
            }
    
            this.logger.log(`스프레드시트 저장/교체 완료: ${spreadsheetId}`);
            
            return {
                spreadsheetId,
                chatId,
                sheets: sheetInfos
            };
    
        } catch (error) {
            this.logger.error('스프레드시트 생성/교체 오류:', error);
            throw error;
        }
    }

    // === 데이터 크기에 따른 저장 전략 결정 (개선) ===
    private async determineStorageStrategy(dto: CreateSpreadsheetDto, chatId: string): Promise<{
        type: DataStorageType;
        path?: string;
    }> {
        const totalDataSize = this.calculateTotalDataSize(dto.sheets);
        
        // 청크 단위로 저장할 때의 예상 문서 수 계산
        const totalRows = dto.sheets.reduce((sum, sheet) => sum + (sheet.data?.length || 0), 0);
        const estimatedChunks = Math.ceil(totalRows / this.CHUNK_SIZE);
        
        // Firestore 한도 고려: 문서 크기 + 문서 수
        if (totalDataSize < this.MAX_FIRESTORE_SIZE && estimatedChunks < 50) {
            return { type: DataStorageType.FIRESTORE };
        } else if (totalDataSize < 10 * 1024 * 1024) { // 10MB 미만
            return {
                type: DataStorageType.CLOUD_STORAGE,
                path: `spreadsheets/${chatId}/${Date.now()}.json`
            };
        } else {
            return {
                type: DataStorageType.ENCRYPTED,
                path: `spreadsheets/${chatId}/${Date.now()}.encrypted`
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
    ): Promise<Array<{
        sheetId: string;
        sheetIndex: number;
        sheetName: string;
        rowCount: number;
    }>> {
        const sheetInfos: Array<{
            sheetId: string;
            sheetIndex: number;
            sheetName: string;
            rowCount: number;
        }> = [];

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
                // Firestore에 청크 단위로 저장
                const flattenedData = this.flattenSheetData(sheet);

                await sheetRef.set({
                    ...sheetMetadata,
                    ...flattenedData
                });

                // 행 데이터를 청크 단위로 저장
                if (sheet.data && Array.isArray(sheet.data)) {
                    await this.saveSheetRowsInChunks(spreadsheetId, sheet.sheetIndex, sheet.data);
                }

            } else {
                // Cloud Storage나 암호화 저장
                const storageData = {
                    rows: sheet.data || [],
                    rawData: sheet.data || [],
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

            sheetInfos.push({
                sheetId: sheetRef.id,
                sheetIndex: sheet.sheetIndex,
                sheetName: sheet.sheetName,
                rowCount: sheet.data?.length || 0
            });
        }

        return sheetInfos;
    }

    // === 시트 데이터를 Firestore에 저장 가능한 형태로 평면화 ===
    private flattenSheetData(sheet: any): any {
        const result: any = {};

        // 행 데이터는 청크 단위로 별도 저장하므로 메타데이터만 저장
        if (sheet.data && Array.isArray(sheet.data)) {
            result.rowCount = sheet.data.length;
            result.hasData = true;
            result.chunkCount = Math.ceil(sheet.data.length / this.CHUNK_SIZE);
            result.chunkSize = this.CHUNK_SIZE;
            // 실제 rows 데이터는 저장하지 않고 청크로 별도 저장
        } else {
            result.rowCount = 0;
            result.hasData = false;
            result.chunkCount = 0;
            result.chunkSize = this.CHUNK_SIZE;
        }

        // 수식 정보 (1차원 배열이므로 Firestore에 안전하게 저장 가능)
        if (sheet.formulas && Array.isArray(sheet.formulas)) {
            result.formulas = sheet.formulas;
        }

        return result;
    }

    // === 행 데이터를 청크 단위로 저장 (개선된 버전) ===
    private async saveSheetRowsInChunks(
        spreadsheetId: string,
        sheetIndex: number,
        rows: string[][]
    ): Promise<void> {
        if (!rows || rows.length === 0) return;

        const batch = this.firebaseService.firestore.batch();
        const sheetDataRef = this.firebaseService.firestore
            .collection('spreadsheetData') // 별도 컬렉션으로 분리
            .doc(`${spreadsheetId}_${sheetIndex}`);

        // 청크 단위로 행 데이터 분할
        const chunks: string[][][] = [];
        for (let i = 0; i < rows.length; i += this.CHUNK_SIZE) {
            chunks.push(rows.slice(i, i + this.CHUNK_SIZE));
        }

        // 각 청크를 별도 서브컬렉션에 저장 (Firestore 호환 형태로)
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunkRef = sheetDataRef.collection('chunks').doc(chunkIndex.toString());
            
            // 2차원 배열을 Firestore 호환 형태로 직렬화
            const serializedRows: { [key: string]: string[] } = {};
            chunks[chunkIndex].forEach((row, rowIndex) => {
                serializedRows[`row_${rowIndex}`] = row;
            });
            
            const chunkData = {
                chunkIndex,
                startRowIndex: chunkIndex * this.CHUNK_SIZE,
                endRowIndex: Math.min((chunkIndex + 1) * this.CHUNK_SIZE - 1, rows.length - 1),
                rowCount: chunks[chunkIndex].length,
                // 기존 rows 필드 제거하고 직렬화된 데이터 사용
                serializedRows: serializedRows,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            batch.set(chunkRef, chunkData);
        }

        // 메타데이터 저장
        batch.set(sheetDataRef, {
            spreadsheetId,
            sheetIndex,
            totalRows: rows.length,
            totalChunks: chunks.length,
            chunkSize: this.CHUNK_SIZE,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await batch.commit();
        this.logger.log(`청크 단위 저장 완료: ${chunks.length}개 청크, 총 ${rows.length}행`);
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
        const rowCount = sheet.data?.length || 0;
        const colCount = sheet.data?.[0]?.length || 0;

        return {
            startRow: 1,
            endRow: rowCount,
            startCol: 0,
            endCol: Math.max(0, colCount - 1),
            startColLetter: 'A',
            endColLetter: colCount > 0 ? String.fromCharCode(65 + colCount - 1) : 'A'
        };
    }

    // === 시트 데이터 조회 (개선된 버전) ===
    async getSheetData(spreadsheetId: string, sheetIndex: number, startRow?: number, endRow?: number): Promise<any> {
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

            if (sheetData.dataReference) {
                // Cloud Storage에 저장된 경우
                return await this.loadFromCloudStorage(sheetData.dataReference);
            } else if (sheetData.hasData) {
                // Firestore 청크에서 데이터 로드
                return await this.loadSheetDataFromChunks(spreadsheetId, sheetIndex, startRow, endRow);
            }

            // 데이터가 없는 경우 기본 구조 반환
            return {
                sheetIndex,
                sheetName: sheetData.sheetName,
                rows: [],
                rowCount: 0
            };

        } catch (error) {
            this.logger.error('시트 데이터 조회 오류:', error);
            throw error;
        }
    }

    // === 청크에서 시트 데이터 로드 ===
    private async loadSheetDataFromChunks(
        spreadsheetId: string, 
        sheetIndex: number, 
        startRow?: number, 
        endRow?: number
    ): Promise<any> {
        try {
            const sheetDataRef = this.firebaseService.firestore
                .collection('spreadsheetData')
                .doc(`${spreadsheetId}_${sheetIndex}`);

            const sheetMetaDoc = await sheetDataRef.get();
            if (!sheetMetaDoc.exists) {
                throw new Error('시트 데이터를 찾을 수 없습니다.');
            }

            const meta = sheetMetaDoc.data()!;
            
            // 필요한 청크 범위 계산
            const requestedStartRow = startRow ?? 0;
            const requestedEndRow = endRow ?? meta.totalRows - 1;
            
            const startChunk = Math.floor(requestedStartRow / this.CHUNK_SIZE);
            const endChunk = Math.floor(requestedEndRow / this.CHUNK_SIZE);

            // 필요한 청크들만 로드
            const chunks: any[] = [];
            for (let chunkIndex = startChunk; chunkIndex <= endChunk; chunkIndex++) {
                const chunkDoc = await sheetDataRef.collection('chunks').doc(chunkIndex.toString()).get();
                if (chunkDoc.exists) {
                    const chunkData = chunkDoc.data();
                    if (chunkData) {
                        chunks.push(chunkData);
                    }
                }
            }

            // 청크들을 합쳐서 전체 행 데이터 구성
            let allRows: string[][] = [];
            chunks.forEach((chunk: any) => {
                if (chunk && chunk.serializedRows) {
                    // 직렬화된 데이터를 역직렬화
                    const chunkRows = this.deserializeRowsFromFirestore(chunk.serializedRows);
                    allRows = allRows.concat(chunkRows);
                } else if (chunk && chunk.rows && Array.isArray(chunk.rows)) {
                    // 레거시 데이터 호환성
                    allRows = allRows.concat(chunk.rows);
                }
            });

            // 요청된 범위만 추출
            const startIdx = requestedStartRow - (startChunk * this.CHUNK_SIZE);
            const endIdx = startIdx + (requestedEndRow - requestedStartRow + 1);
            const filteredRows = allRows.slice(startIdx, endIdx);

            return {
                spreadsheetId,
                sheetIndex,
                totalRows: meta.totalRows,
                requestedRows: filteredRows.length,
                startRow: requestedStartRow,
                endRow: requestedEndRow,
                rows: filteredRows
            };

        } catch (error) {
            this.logger.error('청크에서 데이터 로드 오류:', error);
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

    // === 시트 데이터 업데이트 (개선된 버전) ===
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

            // 시트 메타데이터 업데이트
            const sheetRef = this.firebaseService.firestore
                .collection('spreadsheets')
                .doc(dto.spreadsheetId)
                .collection('sheets')
                .doc(dto.sheetIndex.toString());

            const updateData: any = {
                updatedAt: new Date()
            };

            if (dto.computedData) {
                updateData.computedData = dto.computedData;
            }

            if (dto.formulas) {
                updateData.formulas = dto.formulas;
            }

            await sheetRef.update(updateData);

            // 행 데이터 업데이트가 있는 경우
            if (dto.data && dto.data.length > 0) {
                await this.updateSheetRowsInChunks(dto.spreadsheetId, dto.sheetIndex, dto.data);
            }

            // 버전 히스토리 업데이트
            await this.updateVersionHistory(dto.spreadsheetId, 'AI 데이터 수정');

            this.logger.log(`시트 데이터 업데이트 완료: ${dto.spreadsheetId}/${dto.sheetIndex}`);

        } catch (error) {
            this.logger.error('시트 데이터 업데이트 오류:', error);
            throw error;
        }
    }

    // === 청크 단위 행 데이터 업데이트 ===
    private async updateSheetRowsInChunks(
        spreadsheetId: string,
        sheetIndex: number,
        rows: string[][]
    ): Promise<void> {
        if (!rows || rows.length === 0) return;

        const sheetDataRef = this.firebaseService.firestore
            .collection('spreadsheetData')
            .doc(`${spreadsheetId}_${sheetIndex}`);

        // 기존 청크들 삭제
        const existingChunksSnapshot = await sheetDataRef.collection('chunks').get();
        const batch = this.firebaseService.firestore.batch();
        
        existingChunksSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        // 새로운 청크들로 다시 저장 (Firestore 호환 형태로)
        await this.saveSheetRowsInChunks(spreadsheetId, sheetIndex, rows);
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

    // === 스프레드시트 삭제 (개선된 버전) ===
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

            const batch = this.firebaseService.firestore.batch();

            // 모든 시트 데이터 삭제
            const sheetsSnapshot = await this.firebaseService.firestore
                .collection('spreadsheets')
                .doc(spreadsheetId)
                .collection('sheets')
                .get();

            sheetsSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            // 스프레드시트 메타데이터 삭제
            batch.delete(spreadsheetDoc.ref);

            await batch.commit();

            // 별도 컬렉션의 시트 데이터들 삭제
            for (const sheetDoc of sheetsSnapshot.docs) {
                const sheetIndex = sheetDoc.data().sheetIndex;
                await this.deleteSheetDataChunks(spreadsheetId, sheetIndex);
            }

            this.logger.log(`스프레드시트 삭제 완료: ${spreadsheetId}`);

        } catch (error) {
            this.logger.error('스프레드시트 삭제 오류:', error);
            throw error;
        }
    }

    // === 시트 데이터 청크들 삭제 ===
    private async deleteSheetDataChunks(spreadsheetId: string, sheetIndex: number): Promise<void> {
        try {
            const sheetDataRef = this.firebaseService.firestore
                .collection('spreadsheetData')
                .doc(`${spreadsheetId}_${sheetIndex}`);

            // 모든 청크 삭제
            const chunksSnapshot = await sheetDataRef.collection('chunks').get();
            const batch = this.firebaseService.firestore.batch();

            chunksSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            // 메타데이터 문서 삭제
            batch.delete(sheetDataRef);

            await batch.commit();

        } catch (error) {
            this.logger.error('시트 데이터 청크 삭제 오류:', error);
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
   
   // === 시트 행 데이터 조회 (페이지네이션, 개선된 버전) ===
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
        const fullData = await this.loadFromCloudStorage(sheetData!.dataReference);
        return fullData.rows.slice(offset, offset + limit);
      } else if (sheetData!.hasData) {
        // Firestore 청크에서 행 데이터 조회
        const endRow = offset + limit - 1;
        const sheetDataResult = await this.loadSheetDataFromChunks(
          spreadsheetId, 
          sheetIndex, 
          offset, 
          endRow
        );
        
        return sheetDataResult.rows.map((row: string[], index: number) => ({
          rowIndex: offset + index,
          data: row
        }));
      } else {
        // 데이터가 없는 경우
        return [];
      }
   
    } catch (error) {
      this.logger.error('시트 행 데이터 조회 오류:', error);
      throw error;
    }
   }
   
   // === 전체 스프레드시트 조회 (메타데이터 + 모든 시트 데이터, 개선된 버전) ===
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
              // Firestore 청크에서 모든 행 데이터 조회
              const sheetDataResult = await this.loadSheetDataFromChunks(
                spreadsheetId, 
                sheetMetadata.sheetIndex
              );
              
              rows = sheetDataResult.rows || [];
              formulas = sheetData!.formulas || [];
              computedData = sheetData!.computedData || [];
            }
   
            sheetsWithData.push({
              sheetName: sheetMetadata.sheetName,
              sheetIndex: sheetMetadata.sheetIndex,
              metadata: sheetMetadata.metadata,
              data: {
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
            data: { rows: [] },
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

   // === 전체 스프레드시트 교체 ===
   async replaceFullSpreadsheet(userId: string, spreadsheetId: string, newSheetsData: any[]): Promise<Array<{
        sheetId: string;
        sheetIndex: number;
        sheetName: string;
        rowCount: number;
    }>> {
    try {
      this.logger.log(`전체 스프레드시트 교체 시작: ${spreadsheetId}`);

      // 소유권 확인
      const spreadsheetDoc = await this.firebaseService.firestore
        .collection('spreadsheets')
        .doc(spreadsheetId)
        .get();

      const spreadsheetData = spreadsheetDoc.data();
      if (!spreadsheetDoc.exists || !spreadsheetData || spreadsheetData.userId !== userId) {
        throw new Error('스프레드시트 접근 권한이 없습니다.');
      }

      // 기존 모든 시트 데이터 삭제
      await this.deleteAllSheetDataForReplace(spreadsheetId);

      // 새로운 시트 데이터 저장
      const storageStrategy = { type: DataStorageType.FIRESTORE }; // 기본값으로 설정
      const sheetInfos = await this.saveSheetData(spreadsheetId, newSheetsData, storageStrategy);

      // 스프레드시트 메타데이터 업데이트
      await this.updateSpreadsheetMetadataAfterReplace(spreadsheetId, newSheetsData);

      this.logger.log(`전체 스프레드시트 교체 완료: ${spreadsheetId}`);
      return sheetInfos;
    } catch (error) {
      this.logger.error('전체 스프레드시트 교체 오류:', error);
      throw error;
    }
   }

   // === 교체를 위한 기존 시트 데이터 삭제 ===
   private async deleteAllSheetDataForReplace(spreadsheetId: string): Promise<void> {
    try {
      const batch = this.firebaseService.firestore.batch();

      // 기존 sheets 서브컬렉션의 모든 문서 삭제
      const sheetsSnapshot = await this.firebaseService.firestore
        .collection('spreadsheets')
        .doc(spreadsheetId)
        .collection('sheets')
        .get();

      sheetsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      // spreadsheetData 컬렉션의 시트 데이터들 삭제
      const dataSnapshot = await this.firebaseService.firestore
        .collection('spreadsheetData')
        .where('spreadsheetId', '==', spreadsheetId)
        .get();

      if (!dataSnapshot.empty) {
        const dataBatch = this.firebaseService.firestore.batch();
        
        for (const doc of dataSnapshot.docs) {
          // 각 시트의 chunks 서브컬렉션 삭제
          const chunksSnapshot = await doc.ref.collection('chunks').get();
          chunksSnapshot.docs.forEach(chunkDoc => {
            dataBatch.delete(chunkDoc.ref);
          });
          
          // 시트 데이터 메타문서 삭제
          dataBatch.delete(doc.ref);
        }

        await dataBatch.commit();
      }

      this.logger.log(`기존 시트 데이터 삭제 완료: ${spreadsheetId}`);
    } catch (error) {
      this.logger.error('기존 시트 데이터 삭제 오류:', error);
      throw error;
    }
   }

   // === 교체 후 스프레드시트 메타데이터 업데이트 ===
   private async updateSpreadsheetMetadataAfterReplace(spreadsheetId: string, newSheetsData: any[]): Promise<void> {
    try {
      const updateData = {
        sheets: newSheetsData.map((sheet: any, index: number) => ({
          sheetName: sheet.sheetName || `Sheet${index + 1}`,
          sheetIndex: sheet.sheetIndex !== undefined ? sheet.sheetIndex : index,
          metadata: {
            rowCount: sheet.data?.length || 0,
            columnCount: sheet.data?.[0]?.length || 0,
            headerRow: 0,
            dataRange: this.calculateDataRange(sheet),
            hasFormulas: Boolean(sheet.formulas && sheet.formulas.length > 0),
            lastModified: new Date(),
            chunkCount: Math.ceil((sheet.data?.length || 0) / this.CHUNK_SIZE),
            chunkSize: this.CHUNK_SIZE
          }
        })),
        version: this.firebaseService.FieldValue.increment(1),
        versionHistory: this.firebaseService.FieldValue.arrayUnion({
          version: Date.now(),
          timestamp: new Date(),
          changeDescription: '전체 시트 데이터 교체',
          changedBy: 'ai'
        }),
        updatedAt: new Date()
      };

      await this.firebaseService.firestore
        .collection('spreadsheets')
        .doc(spreadsheetId)
        .update(updateData);

      this.logger.log(`스프레드시트 메타데이터 업데이트 완료: ${spreadsheetId}`);
    } catch (error) {
      this.logger.error('스프레드시트 메타데이터 업데이트 오류:', error);
      throw error;
    }
   }

   // === Firestore 데이터 역직렬화 헬퍼 함수 ===
   private deserializeRowsFromFirestore(serializedData: { [key: string]: string[] }): string[][] {
       const rows: string[][] = [];
       
       // row_0, row_1, ... 순서대로 정렬
       const sortedKeys = Object.keys(serializedData)
           .filter(key => key.startsWith('row_'))
           .sort((a, b) => {
               const aIndex = parseInt(a.split('_')[1]);
               const bIndex = parseInt(b.split('_')[1]);
               return aIndex - bIndex;
           });
       
       sortedKeys.forEach(key => {
           rows.push(serializedData[key]);
       });
       
       return rows;
   }
}
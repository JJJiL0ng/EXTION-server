// src/common/services/firebase.service.ts - Firebase 서비스
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { FirebaseChat, FirebaseMessage, FirebaseUser } from '../interfaces/firebase.interface';
import { CreateChatDto, CreateMessageDto } from '../dto/chat.dto';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private db: Firestore;

  public get firestore(): Firestore {
    return this.db;
  }

  public get FieldValue() {
    return FieldValue;
  }

  constructor(private configService: ConfigService) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (getApps().length === 0) {
      const projectId = this.configService.get('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get('FIREBASE_CLIENT_EMAIL');
      const privateKeyRaw = this.configService.get('FIREBASE_PRIVATE_KEY');
      
      if (!privateKeyRaw || !projectId || !clientEmail) {
        throw new Error('Firebase configuration is incomplete. Please check your environment variables.');
      }
      
      // Private key 처리
      let privateKey = privateKeyRaw;
      
      // 따옴표 제거
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }
      
      // \n을 실제 개행으로 변환
      privateKey = privateKey.replace(/\\n/g, '\n');

      const serviceAccount = {
        projectId,
        clientEmail,
        privateKey,
      };

      try {
        initializeApp({
          credential: cert(serviceAccount),
        });
        this.logger.log('Firebase 앱 초기화 성공');
      } catch (error) {
        this.logger.error('Firebase 초기화 에러:', error);
        throw error;
      }
    }

    this.db = getFirestore();
    this.logger.log('Firebase 초기화 완료');
  }

  // === 채팅 관련 메서드 ===
  async createChat(userId: string, createChatDto: CreateChatDto): Promise<string> {
    try {
      const chatRef = this.db.collection('chats').doc();
      
      // undefined 값들을 필터링하여 Firestore 호환 데이터 생성
      const chatData: Omit<FirebaseChat, 'id'> = {
        userId,
        title: createChatDto.title,
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0,
        status: 'active',
        analytics: {
          formulaCount: 0,
          artifactCount: 0,
          dataGenerationCount: 0,
          dataFixCount: 0,
        },
      };

      // spreadsheetId가 유효한 경우에만 추가
      if (createChatDto.spreadsheetId && createChatDto.spreadsheetId.trim() !== '') {
        chatData.spreadsheetId = createChatDto.spreadsheetId;
      }

      await chatRef.set(chatData);
      this.logger.log(`새 채팅 생성: ${chatRef.id}`);
      return chatRef.id;
    } catch (error) {
      this.logger.error('채팅 생성 오류:', error);
      throw error;
    }
  }

  // 특정 ID로 채팅 생성
  async createChatWithId(userId: string, chatId: string, createChatDto: CreateChatDto): Promise<string> {
    try {
      const chatRef = this.db.collection('chats').doc(chatId);
      
      // undefined 값들을 필터링하여 Firestore 호환 데이터 생성
      const chatData: Omit<FirebaseChat, 'id'> = {
        userId,
        title: createChatDto.title,
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0,
        status: 'active',
        analytics: {
          formulaCount: 0,
          artifactCount: 0,
          dataGenerationCount: 0,
          dataFixCount: 0,
        },
      };

      // spreadsheetId가 유효한 경우에만 추가
      if (createChatDto.spreadsheetId && createChatDto.spreadsheetId.trim() !== '') {
        chatData.spreadsheetId = createChatDto.spreadsheetId;
      }

      await chatRef.set(chatData);
      this.logger.log(`특정 ID로 채팅 생성: ${chatId}`);
      return chatId;
    } catch (error) {
      this.logger.error('특정 ID로 채팅 생성 오류:', error);
      throw error;
    }
  }

  async getChat(chatId: string): Promise<FirebaseChat | null> {
    try {
      const chatDoc = await this.db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        return null;
      }
      return { id: chatDoc.id, ...chatDoc.data() } as FirebaseChat;
    } catch (error) {
      this.logger.error('채팅 조회 오류:', error);
      throw error;
    }
  }

  async getUserChats(userId: string, limit = 50): Promise<FirebaseChat[]> {
    try {
      const chatsSnapshot = await this.db
        .collection('chats')
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .orderBy('updatedAt', 'desc')
        .limit(limit)
        .get();

      return chatsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as FirebaseChat[];
    } catch (error) {
      this.logger.error('사용자 채팅 목록 조회 오류:', error);
      throw error;
    }
  }

  // === 메시지 관련 메서드 ===
  async createMessage(chatId: string, messageDto: CreateMessageDto): Promise<string> {
    try {
      this.logger.log(`=== Firebase 메시지 생성 시작 ===`);
      this.logger.log(`채팅 ID: ${chatId}`);
      this.logger.log(`메시지 타입: ${messageDto.type}`);
      this.logger.log(`메시지 모드: ${messageDto.mode}`);
      this.logger.log(`메시지 역할: ${messageDto.role}`);
      this.logger.log(`메시지 내용 길이: ${messageDto.content?.length || 0} 문자`);
      
      // Firebase 연결 상태 확인
      if (!this.db) {
        this.logger.error('Firebase Firestore 인스턴스가 초기화되지 않음');
        throw new Error('Firebase가 초기화되지 않았습니다.');
      }
      
      const messageRef = this.db.collection('chats').doc(chatId).collection('messages').doc();
      this.logger.log(`메시지 레퍼런스 생성: ${messageRef.path}`);
      
      // undefined 값들을 필터링하여 Firestore 호환 데이터 생성
      const messageData: any = {
        chatId,
        role: messageDto.role,
        content: messageDto.content,
        timestamp: new Date(),
        type: messageDto.type,
      };

      // 선택적 필드들을 유효한 경우에만 추가
      if (messageDto.mode) {
        messageData.mode = messageDto.mode;
      }

      if (messageDto.sheetContext) {
        messageData.sheetContext = this.filterUndefinedValues(messageDto.sheetContext);
      }

      if (messageDto.formulaData) {
        messageData.formulaData = this.filterUndefinedValues(messageDto.formulaData);
      }

      if (messageDto.artifactData) {
        messageData.artifactData = this.filterUndefinedValues(messageDto.artifactData);
      }

      if (messageDto.dataChangeInfo) {
        messageData.dataChangeInfo = this.filterUndefinedValues(messageDto.dataChangeInfo);
      }

      if (messageDto.fileUploadInfo) {
        messageData.fileUploadInfo = this.filterUndefinedValues(messageDto.fileUploadInfo);
      }

      // 각 필드별 상세 로깅
      this.logger.log(`=== 저장할 메시지 데이터 상세 분석 ===`);
      this.logger.log(`chatId: ${messageData.chatId}`);
      this.logger.log(`role: ${messageData.role}`);
      this.logger.log(`type: ${messageData.type}`);
      this.logger.log(`mode: ${messageData.mode || 'undefined'}`);
      this.logger.log(`content 길이: ${messageData.content.length}`);
      this.logger.log(`timestamp: ${messageData.timestamp}`);
      
      if (messageData.sheetContext) {
        this.logger.log(`sheetContext 존재:`, JSON.stringify({
          sheetIndex: messageData.sheetContext.sheetIndex,
          sheetName: messageData.sheetContext.sheetName,
          affectedCells: messageData.sheetContext.affectedCells?.length || 0,
          totalRows: messageData.sheetContext.totalRows,
          totalColumns: messageData.sheetContext.totalColumns,
          headers: messageData.sheetContext.headers?.length || 0
        }));
      }
      
      if (messageData.formulaData) {
        this.logger.log(`formulaData 존재:`, JSON.stringify({
          formula: messageData.formulaData.formula,
          cellAddress: messageData.formulaData.cellAddress,
          functionType: messageData.formulaData.functionType,
          hasExplanation: !!messageData.formulaData.explanation,
          explanationType: typeof messageData.formulaData.explanation,
          hasExamples: !!messageData.formulaData.examples,
          hasAlternatives: !!messageData.formulaData.alternatives,
          hasWarning: !!messageData.formulaData.warning
        }));
        
        // explanation 필드 상세 분석
        if (messageData.formulaData.explanation) {
          this.logger.log(`explanation 내용:`, JSON.stringify(messageData.formulaData.explanation));
        }
      }

      this.logger.log(`메시지 문서 저장 시작...`);
      await messageRef.set(messageData);
      this.logger.log(`✅ 메시지 문서 저장 성공: ${messageRef.id}`);

      // 채팅 문서의 lastMessage와 messageCount 업데이트
      this.logger.log(`채팅 마지막 메시지 업데이트 시작...`);
      await this.updateChatLastMessage(chatId, messageData);
      this.logger.log(`✅ 채팅 마지막 메시지 업데이트 성공`);

      this.logger.log(`✅ 메시지 생성 완료: ${messageRef.id}`);
      return messageRef.id;
    } catch (error) {
      this.logger.error('❌ Firebase 메시지 생성 오류:', error);
      this.logger.error(`오류 타입: ${error.constructor.name}`);
      this.logger.error(`오류 메시지: ${error.message}`);
      this.logger.error(`오류 코드: ${error.code || 'N/A'}`);
      this.logger.error(`오류 스택:`, error.stack);
      this.logger.error(`채팅 ID: ${chatId}`);
      
      // 메시지 DTO의 문제가 있는 필드들 상세 분석
      this.logger.error(`=== 오류 발생 시 메시지 DTO 분석 ===`);
      this.logger.error(`메시지 DTO 타입:`, typeof messageDto);
      this.logger.error(`메시지 DTO 키들:`, Object.keys(messageDto));
      
      if (messageDto.formulaData) {
        this.logger.error(`formulaData 키들:`, Object.keys(messageDto.formulaData));
        this.logger.error(`formulaData:`, JSON.stringify(messageDto.formulaData, null, 2));
      }
      
      if (messageDto.sheetContext) {
        this.logger.error(`sheetContext:`, JSON.stringify(messageDto.sheetContext, null, 2));
      }
      
      throw error;
    }
  }

  // === undefined 값들을 필터링하는 헬퍼 메서드 ===
  private filterUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (Array.isArray(obj)) {
      return obj.filter(item => item !== undefined).map(item => this.filterUndefinedValues(item));
    }

    if (typeof obj === 'object') {
      const filtered: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          filtered[key] = this.filterUndefinedValues(value);
        }
      }
      return filtered;
    }

    return obj;
  }

  async getChatMessages(chatId: string, limit = 50): Promise<FirebaseMessage[]> {
    try {
      const messagesSnapshot = await this.db
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as FirebaseMessage[];
    } catch (error) {
      this.logger.error('채팅 메시지 조회 오류:', error);
      throw error;
    }
  }

  // === 채팅 메시지를 시간순으로 조회 (가장 오래된 것부터) ===
  async getChatMessagesAsc(chatId: string, limit = 50): Promise<FirebaseMessage[]> {
    try {
      const messagesSnapshot = await this.db
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .limit(limit)
        .get();

      return messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as FirebaseMessage[];
    } catch (error) {
      this.logger.error('채팅 메시지 순차 조회 오류:', error);
      throw error;
    }
  }

  // === 특정 타입/모드의 메시지만 조회 ===
  async getChatMessagesByType(
    chatId: string, 
    messageType?: string, 
    messageMode?: string, 
    limit = 50
  ): Promise<FirebaseMessage[]> {
    try {
      let query: any = this.db
        .collection('chats')
        .doc(chatId)
        .collection('messages');

      if (messageType) {
        query = query.where('type', '==', messageType);
      }

      if (messageMode) {
        query = query.where('mode', '==', messageMode);
      }

      const messagesSnapshot = await query
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as FirebaseMessage[];
    } catch (error) {
      this.logger.error('타입별 채팅 메시지 조회 오류:', error);
      throw error;
    }
  }

  // === Artifact 메시지만 조회 ===
  async getArtifactMessages(chatId: string, limit = 50): Promise<FirebaseMessage[]> {
    try {
      const messagesSnapshot = await this.db
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .where('type', '==', 'artifact')
        .where('mode', '==', 'artifact')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return messagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as FirebaseMessage[];
    } catch (error) {
      this.logger.error('아티팩트 메시지 조회 오류:', error);
      throw error;
    }
  }

  private async updateChatLastMessage(chatId: string, message: any) {
    try {
      await this.db.collection('chats').doc(chatId).update({
        lastMessage: {
          content: message.content.substring(0, 100),
          timestamp: message.timestamp,
          role: message.role,
          type: message.type,
        },
        messageCount: FieldValue.increment(1),
        updatedAt: new Date(),
      });
    } catch (error) {
      this.logger.error('채팅 마지막 메시지 업데이트 오류:', error);
      throw error;
    }
  }

  // === 사용자 관련 메서드 ===
  async createOrUpdateUser(uid: string, userData: Partial<FirebaseUser>): Promise<void> {
    try {
      const userRef = this.db.collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        // 기존 사용자 업데이트
        await userRef.update({
          ...userData,
          lastActiveAt: new Date(),
        });
      } else {
        // 새 사용자 생성
        const newUserData: Omit<FirebaseUser, 'id'> = {
          email: userData.email || '',
          displayName: userData.displayName || '',
          photoURL: userData.photoURL,
          createdAt: new Date(),
          lastActiveAt: new Date(),
          preferences: {
            sidebarCollapsed: false,
            theme: 'light',
            defaultFileFormat: 'xlsx',
          },
          statistics: {
            totalChats: 0,
            totalSpreadsheets: 0,
            lastLoginAt: new Date(),
          },
          ...userData,
        };
        await userRef.set(newUserData);
      }
    } catch (error) {
      this.logger.error('사용자 생성/업데이트 오류:', error);
      throw error;
    }
  }

  async getUser(uid: string): Promise<FirebaseUser | null> {
    try {
      const userDoc = await this.db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return null;
      }
      return { id: userDoc.id, ...userDoc.data() } as FirebaseUser;
    } catch (error) {
      this.logger.error('사용자 조회 오류:', error);
      throw error;
    }
  }

  // === 채팅에 스프레드시트 ID 연결 ===
  async updateChatSpreadsheetId(chatId: string, spreadsheetId: string): Promise<void> {
    try {
      // spreadsheetId가 유효한지 확인
      if (!spreadsheetId || spreadsheetId.trim() === '') {
        this.logger.warn(`유효하지 않은 spreadsheetId로 업데이트 시도: ${spreadsheetId}`);
        return;
      }

      await this.db.collection('chats').doc(chatId).update({
        spreadsheetId: spreadsheetId.trim(),
        updatedAt: new Date(),
      });
      this.logger.log(`채팅 ${chatId}에 스프레드시트 ID ${spreadsheetId} 연결 완료`);
    } catch (error) {
      this.logger.error('채팅 스프레드시트 ID 업데이트 오류:', error);
      throw error;
    }
  }

  // === 스프레드시트 ID로 연결된 채팅들 조회 ===
  async getChatsBySpreadsheetId(spreadsheetId: string, userId: string): Promise<FirebaseChat[]> {
    try {
      const chatsSnapshot = await this.db
        .collection('chats')
        .where('spreadsheetId', '==', spreadsheetId)
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .orderBy('updatedAt', 'desc')
        .get();

      const chats = chatsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as FirebaseChat[];

      this.logger.log(`스프레드시트 ${spreadsheetId}에 연결된 채팅 ${chats.length}개 조회`);
      return chats;
    } catch (error) {
      this.logger.error('스프레드시트 연결 채팅 조회 오류:', error);
      throw error;
    }
  }

  // === 채팅 ID로 연결된 스프레드시트 ID 조회 ===
  async getSpreadsheetIdByChat(chatId: string): Promise<string | null> {
    try {
      const chatDoc = await this.db.collection('chats').doc(chatId).get();
      
      if (!chatDoc.exists) {
        return null;
      }

      const chatData = chatDoc.data() as FirebaseChat;
      return chatData.spreadsheetId || null;
    } catch (error) {
      this.logger.error('채팅 연결 스프레드시트 ID 조회 오류:', error);
      throw error;
    }
  }

  // === 스프레드시트 메타데이터 업데이트 ===
  async updateSpreadsheetMetadata(spreadsheetId: string, spreadsheetData: any): Promise<void> {
    try {
      // 스프레드시트 문서가 존재하는지 확인
      const spreadsheetRef = this.db.collection('spreadsheets').doc(spreadsheetId);
      const spreadsheetDoc = await spreadsheetRef.get();

      if (!spreadsheetDoc.exists) {
        this.logger.warn(`스프레드시트 문서가 존재하지 않음: ${spreadsheetId}`);
        return;
      }

      // 메타데이터 업데이트
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (spreadsheetData.fileName) {
        updateData.fileName = spreadsheetData.fileName;
      }

      if (spreadsheetData.totalSheets) {
        updateData.totalSheets = spreadsheetData.totalSheets;
      }

      if (spreadsheetData.activeSheetIndex !== undefined) {
        updateData.activeSheetIndex = spreadsheetData.activeSheetIndex;
      }

      if (spreadsheetData.sheets && Array.isArray(spreadsheetData.sheets)) {
        updateData.sheets = spreadsheetData.sheets.map(sheet => ({
          sheetName: sheet.sheetName,
          sheetIndex: sheet.sheetIndex,
          headers: sheet.headers || [],
          metadata: {
            rowCount: 0, // 실제 데이터에서 계산 필요
            columnCount: sheet.headers?.length || 0,
            lastModified: new Date(),
          }
        }));
      }

      // 버전 정보 업데이트
      updateData.version = FieldValue.increment(1);
      updateData.versionHistory = FieldValue.arrayUnion({
        version: Date.now(),
        timestamp: new Date(),
        changeDescription: 'DataFix 모듈에서 데이터 수정',
        changedBy: 'datafix'
      });

      await spreadsheetRef.update(updateData);
      this.logger.log(`스프레드시트 메타데이터 업데이트 완료: ${spreadsheetId}`);
    } catch (error) {
      this.logger.error('스프레드시트 메타데이터 업데이트 오류:', error);
      throw error;
    }
  }

  // === 분석 카운터 업데이트 ===
  async incrementAnalyticsCounter(chatId: string, counterType: keyof FirebaseChat['analytics']): Promise<void> {
    try {
      await this.db.collection('chats').doc(chatId).update({
        [`analytics.${counterType}`]: FieldValue.increment(1),
        updatedAt: new Date(),
      });
    } catch (error) {
      this.logger.error('분석 카운터 업데이트 오류:', error);
      throw error;
    }
  }

  // === 스프레드시트 완전 교체 관련 메서드 ===
  async replaceSpreadsheetData(spreadsheetId: string, userId: string, newSheetsData: any[]): Promise<void> {
    try {
      // 소유권 확인
      const spreadsheetDoc = await this.db.collection('spreadsheets').doc(spreadsheetId).get();
      const spreadsheetData = spreadsheetDoc.data();
      
      if (!spreadsheetDoc.exists || !spreadsheetData || spreadsheetData.userId !== userId) {
        throw new Error('스프레드시트 접근 권한이 없습니다.');
      }

      // 기존 모든 시트 데이터 삭제
      await this.deleteAllSheetData(spreadsheetId);

      // 새로운 시트 데이터로 완전 교체
      await this.createNewSheetData(spreadsheetId, newSheetsData);

      // 스프레드시트 메타데이터 업데이트
      await this.updateSpreadsheetAfterReplace(spreadsheetId, newSheetsData);

      this.logger.log(`스프레드시트 완전 교체 완료: ${spreadsheetId}`);
    } catch (error) {
      this.logger.error('스프레드시트 완전 교체 오류:', error);
      throw error;
    }
  }

  // === 기존 모든 시트 데이터 삭제 ===
  async deleteAllSheetData(spreadsheetId: string): Promise<void> {
    try {
      const batch = this.db.batch();

      // 기존 sheets 서브컬렉션의 모든 문서 삭제
      const sheetsSnapshot = await this.db
        .collection('spreadsheets')
        .doc(spreadsheetId)
        .collection('sheets')
        .get();

      sheetsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      // spreadsheetData 컬렉션의 모든 시트 데이터 삭제
      const dataSnapshot = await this.db
        .collection('spreadsheetData')
        .where('spreadsheetId', '==', spreadsheetId)
        .get();

      if (!dataSnapshot.empty) {
        const dataBatch = this.db.batch();
        
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

  // === 새로운 시트 데이터 생성 ===
  async createNewSheetData(spreadsheetId: string, sheetsData: any[]): Promise<void> {
    try {
      const batch = this.db.batch();

      for (const sheet of sheetsData) {
        const sheetRef = this.db
          .collection('spreadsheets')
          .doc(spreadsheetId)
          .collection('sheets')
          .doc(sheet.sheetIndex.toString());

        // 시트 메타데이터 생성
        const sheetMetadata = {
          sheetIndex: sheet.sheetIndex,
          sheetName: sheet.sheetName,
          spreadsheetId,
          headers: sheet.headers || [],
          rowCount: sheet.data?.rows?.length || 0,
          hasData: Boolean(sheet.data?.rows && sheet.data.rows.length > 0),
          chunkCount: Math.ceil((sheet.data?.rows?.length || 0) / 500), // CHUNK_SIZE = 500
          chunkSize: 500,
          formulas: sheet.formulas || [],
          computedData: sheet.computedData || [],
          createdAt: new Date(),
          updatedAt: new Date(),
          chatMetadata: {
            messageCount: 0,
            lastActivityAt: new Date(),
            hasActiveFormulas: Boolean(sheet.formulas && sheet.formulas.length > 0),
            hasArtifacts: false
          }
        };

        batch.set(sheetRef, sheetMetadata);
      }

      await batch.commit();

      // 행 데이터를 청크 단위로 저장
      for (const sheet of sheetsData) {
        if (sheet.data?.rows && Array.isArray(sheet.data.rows) && sheet.data.rows.length > 0) {
          await this.saveSheetRowsInChunks(spreadsheetId, sheet.sheetIndex, sheet.data.rows);
        }
      }

      this.logger.log(`새로운 시트 데이터 생성 완료: ${spreadsheetId}`);
    } catch (error) {
      this.logger.error('새로운 시트 데이터 생성 오류:', error);
      throw error;
    }
  }

  // === 행 데이터를 청크 단위로 저장 (FirebaseService 버전) ===
  async saveSheetRowsInChunks(spreadsheetId: string, sheetIndex: number, rows: string[][]): Promise<void> {
    try {
      if (!rows || rows.length === 0) return;

      const CHUNK_SIZE = 500;
      const batch = this.db.batch();
      const sheetDataRef = this.db
        .collection('spreadsheetData')
        .doc(`${spreadsheetId}_${sheetIndex}`);

      // 청크 단위로 행 데이터 분할
      const chunks: string[][][] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + CHUNK_SIZE));
      }

      // 각 청크를 별도 서브컬렉션에 저장 (Firestore 호환 형태로)
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunkRef = sheetDataRef.collection('chunks').doc(chunkIndex.toString());
        
        // 2차원 배열을 Firestore 호환 형태로 직렬화
        const serializedChunkData = this.serializeChunkData(chunks[chunkIndex]);
        
        const chunkData = {
          chunkIndex,
          startRowIndex: chunkIndex * CHUNK_SIZE,
          endRowIndex: Math.min((chunkIndex + 1) * CHUNK_SIZE - 1, rows.length - 1),
          rowCount: chunks[chunkIndex].length,
          // 기존 rows 필드 제거하고 직렬화된 데이터 사용
          serializedRows: serializedChunkData.serializedRows,
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
        chunkSize: CHUNK_SIZE,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await batch.commit();
      this.logger.log(`청크 단위 저장 완료: ${chunks.length}개 청크, 총 ${rows.length}행`);
    } catch (error) {
      this.logger.error('청크 단위 저장 오류:', error);
      throw error;
    }
  }

  // === 스프레드시트 메타데이터 업데이트 (교체 후) ===
  async updateSpreadsheetAfterReplace(spreadsheetId: string, newSheetsData: any[]): Promise<void> {
    try {
      const updateData = {
        sheets: newSheetsData.map((sheet: any, index: number) => ({
          sheetName: sheet.sheetName || `Sheet${index + 1}`,
          sheetIndex: sheet.sheetIndex !== undefined ? sheet.sheetIndex : index,
          headers: sheet.headers || [],
          metadata: {
            rowCount: sheet.data?.rows?.length || 0,
            columnCount: sheet.headers?.length || 0,
            headerRow: 0,
            dataRange: this.calculateDataRange(sheet),
            hasFormulas: Boolean(sheet.formulas && sheet.formulas.length > 0),
            lastModified: new Date(),
            chunkCount: Math.ceil((sheet.data?.rows?.length || 0) / 100),
            chunkSize: 100
          }
        })),
        version: FieldValue.increment(1),
        versionHistory: FieldValue.arrayUnion({
          version: Date.now(),
          timestamp: new Date(),
          changeDescription: '전체 시트 데이터 교체',
          changedBy: 'user'
        }),
        updatedAt: new Date()
      };

      await this.db.collection('spreadsheets').doc(spreadsheetId).update(updateData);
      this.logger.log(`스프레드시트 메타데이터 업데이트 완료: ${spreadsheetId}`);
    } catch (error) {
      this.logger.error('스프레드시트 메타데이터 업데이트 오류:', error);
      throw error;
    }
  }

  // === 데이터 범위 계산 헬퍼 함수 ===
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

  // === Firestore 호환 데이터 변환 헬퍼 함수들 ===
  
  // 2차원 배열을 Firestore 호환 형태로 직렬화
  private serializeRowsForFirestore(rows: string[][]): { [key: string]: string[] } {
    const serializedRows: { [key: string]: string[] } = {};
    
    rows.forEach((row, index) => {
      serializedRows[`row_${index}`] = row;
    });
    
    return serializedRows;
  }

  // Firestore에서 가져온 데이터를 2차원 배열로 역직렬화
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

  // 청크 데이터를 Firestore 호환 형태로 변환
  private serializeChunkData(chunkRows: string[][]): { serializedRows: { [key: string]: string[] }; rowCount: number } {
    return {
      serializedRows: this.serializeRowsForFirestore(chunkRows),
      rowCount: chunkRows.length
    };
  }

  // Firestore에서 청크 데이터를 역직렬화
  private deserializeChunkData(chunkData: any): string[][] {
    if (chunkData.serializedRows) {
      return this.deserializeRowsFromFirestore(chunkData.serializedRows);
    }
    
    // 레거시 데이터 호환성 (기존 rows 필드가 있는 경우)
    if (chunkData.rows && Array.isArray(chunkData.rows)) {
      return chunkData.rows;
    }
    
    return [];
  }

  // === 새로운 시트를 저장 (데이터 생성용) ===
  async saveSheet(userId: string, sheetData: any): Promise<string> {
    try {
      // 스프레드시트 ID 생성 (사용자별 고유 ID)
      const spreadsheetId = `${userId}_${Date.now()}`;
      
      this.logger.log(`새 시트 저장 시작: ${sheetData.name} (${spreadsheetId})`);

      // 1. 스프레드시트 메타데이터 생성
      const spreadsheetRef = this.db.collection('spreadsheets').doc(spreadsheetId);
      const spreadsheetMetadata = {
        userId,
        fileName: sheetData.name,
        totalSheets: 1,
        activeSheetIndex: 0,
        sheets: [{
          sheetName: sheetData.name,
          sheetIndex: sheetData.metadata?.sheetIndex || 0,
          headers: sheetData.headers || [],
          metadata: {
            rowCount: sheetData.data?.length || 0,
            columnCount: sheetData.headers?.length || 0,
            headerRow: 0,
            dataRange: this.calculateDataRange({
              data: { rows: sheetData.data },
              headers: sheetData.headers
            }),
            hasFormulas: false,
            lastModified: new Date(),
            chunkCount: Math.ceil((sheetData.data?.length || 0) / 100),
            chunkSize: 100
          }
        }],
        createdAt: new Date(),
        updatedAt: new Date(),
        source: sheetData.metadata?.source || 'data_generation',
        version: 1,
        versionHistory: [{
          version: 1,
          timestamp: new Date(),
          changeDescription: '데이터 생성으로 시트 생성',
          changedBy: 'data_generation'
        }]
      };

      await spreadsheetRef.set(spreadsheetMetadata);

      // 2. 시트 세부 메타데이터 생성
      const sheetRef = this.db
        .collection('spreadsheets')
        .doc(spreadsheetId)
        .collection('sheets')
        .doc('0');

      const sheetDetailMetadata = {
        sheetIndex: 0,
        sheetName: sheetData.name,
        spreadsheetId,
        headers: sheetData.headers || [],
        rowCount: sheetData.data?.length || 0,
        hasData: Boolean(sheetData.data && sheetData.data.length > 0),
        chunkCount: Math.ceil((sheetData.data?.length || 0) / 100),
        chunkSize: 100,
        formulas: [],
        computedData: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        source: sheetData.metadata?.source || 'data_generation',
        chatMetadata: {
          messageCount: 0,
          lastActivityAt: new Date(),
          hasActiveFormulas: false,
          hasArtifacts: false
        }
      };

      await sheetRef.set(sheetDetailMetadata);

      // 3. 데이터 행 저장 (청크 단위로)
      if (sheetData.data && Array.isArray(sheetData.data) && sheetData.data.length > 0) {
        await this.saveSheetRowsInChunks(spreadsheetId, 0, sheetData.data);
      }

      this.logger.log(`새 시트 저장 완료: ${sheetData.name} (${spreadsheetId})`);
      return spreadsheetId;

    } catch (error) {
      this.logger.error('새 시트 저장 오류:', error);
      throw error;
    }
  }
}
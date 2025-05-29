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
      const serviceAccount = {
        projectId: this.configService.get('FIREBASE_PROJECT_ID'),
        clientEmail: this.configService.get('FIREBASE_CLIENT_EMAIL'),
        privateKey: this.configService.get('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
      };

      initializeApp({
        credential: cert(serviceAccount),
      });
    }

    this.db = getFirestore();
    this.logger.log('Firebase 초기화 완료');
  }

  // === 채팅 관련 메서드 ===
  async createChat(userId: string, createChatDto: CreateChatDto): Promise<string> {
    try {
      const chatRef = this.db.collection('chats').doc();
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
      const messageRef = this.db.collection('chats').doc(chatId).collection('messages').doc();
      const messageData: Omit<FirebaseMessage, 'id'> = {
        chatId,
        ...messageDto,
        timestamp: new Date(),
      };

      await messageRef.set(messageData);

      // 채팅 문서의 lastMessage와 messageCount 업데이트
      await this.updateChatLastMessage(chatId, messageData);

      this.logger.log(`메시지 생성: ${messageRef.id}`);
      return messageRef.id;
    } catch (error) {
      this.logger.error('메시지 생성 오류:', error);
      throw error;
    }
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

  private async updateChatLastMessage(chatId: string, message: Omit<FirebaseMessage, 'id'>) {
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

  // === 스프레드시트 메타데이터 업데이트 ===
  async updateSpreadsheetMetadata(chatId: string, spreadsheetData: any): Promise<void> {
    try {
      await this.db.collection('chats').doc(chatId).update({
        spreadsheetData: {
          hasSpreadsheet: true,
          fileName: spreadsheetData.fileName,
          totalSheets: spreadsheetData.totalSheets,
          activeSheetIndex: spreadsheetData.activeSheetIndex,
          sheetNames: spreadsheetData.sheetNames,
          lastModifiedAt: new Date(),
        },
        updatedAt: new Date(),
      });
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
}
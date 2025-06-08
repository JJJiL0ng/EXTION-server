// src/common/cache/chat-history-cache.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { MessageRole, MessageMode } from '../dto/chat.dto';

interface CachedMessage {
  id: string;
  content: string;
  role: MessageRole;
  mode: MessageMode;
  timestamp: Date;
  metadata?: any;
  sheetContext?: any;
}

interface ChatHistoryCache {
  messages: CachedMessage[];
  lastFetched: Date;
  totalMessages: number;
}

@Injectable()
export class ChatHistoryCacheService {
  private readonly logger = new Logger(ChatHistoryCacheService.name);
  private readonly cache = new Map<string, ChatHistoryCache>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5분
  private readonly MAX_MESSAGES_FOR_AI = 10; // AI에게 보낼 최대 메시지 수

  constructor(private firebaseService: FirebaseService) {}

  /**
   * 채팅 히스토리를 가져옵니다 (캐시 우선)
   * @param chatId 채팅 ID
   * @param forAI AI 요청용인지 여부 (true면 최근 메시지만 반환)
   * @returns 메시지 배열
   */
  async getChatHistory(chatId: string, forAI: boolean = false): Promise<CachedMessage[]> {
    this.logger.log(`채팅 히스토리 요청: ${chatId}, AI용: ${forAI}`);

    // 캐시 확인
    const cached = this.cache.get(chatId);
    const now = new Date();

    if (cached && (now.getTime() - cached.lastFetched.getTime() < this.CACHE_DURATION)) {
      this.logger.log(`캐시에서 히스토리 반환: ${cached.messages.length}개 메시지`);
      return forAI ? this.getLimitedMessagesForAI(cached.messages) : cached.messages;
    }

    // 캐시가 없거나 만료된 경우 Firebase에서 가져오기
    this.logger.log('Firebase에서 최신 히스토리 가져오기');
    const messages = await this.fetchFromFirebase(chatId);

    // 캐시 업데이트
    this.cache.set(chatId, {
      messages,
      lastFetched: now,
      totalMessages: messages.length
    });

    return forAI ? this.getLimitedMessagesForAI(messages) : messages;
  }

  /**
   * 새 메시지를 캐시에 추가
   * @param chatId 채팅 ID
   * @param message 새 메시지
   */
  addMessageToCache(chatId: string, message: CachedMessage): void {
    const cached = this.cache.get(chatId);
    
    if (cached) {
      cached.messages.push(message);
      cached.totalMessages = cached.messages.length;
      cached.lastFetched = new Date();
      this.logger.log(`캐시에 새 메시지 추가: ${chatId}`);
    }
  }

  /**
   * 특정 채팅의 캐시를 무효화
   * @param chatId 채팅 ID
   */
  invalidateCache(chatId: string): void {
    this.cache.delete(chatId);
    this.logger.log(`캐시 무효화: ${chatId}`);
  }

  /**
   * 모든 캐시를 무효화
   */
  invalidateAllCache(): void {
    this.cache.clear();
    this.logger.log('모든 캐시 무효화');
  }

  /**
   * OpenAI API용 메시지 형식으로 변환
   * @param chatId 채팅 ID
   * @param includeSystem 시스템 메시지 포함 여부
   * @returns OpenAI API 형식의 메시지 배열
   */
  async getMessagesForOpenAI(chatId: string, includeSystem: boolean = false): Promise<any[]> {
    const messages = await this.getChatHistory(chatId, true);
    
    const openAIMessages = messages
      .filter(msg => {
        // 시스템 메시지 필터링
        if (!includeSystem && msg.role === MessageRole.SYSTEM) {
          return false;
        }
        return true;
      })
      .map(msg => ({
        role: this.convertToOpenAIRole(msg.role),
        content: msg.content
      }));

    this.logger.log(`OpenAI용 메시지 변환 완료: ${openAIMessages.length}개`);
    return openAIMessages;
  }

  /**
   * 채팅 컨텍스트 정보 가져오기 (최근 메시지 기반)
   * @param chatId 채팅 ID
   * @returns 컨텍스트 정보
   */
  async getChatContext(chatId: string): Promise<{
    messageCount: number;
    lastActivity: Date | null;
    hasSpreadsheetContext: boolean;
    chatModes: MessageMode[];
  }> {
    const messages = await this.getChatHistory(chatId, false);
    
    const lastMessage = messages[messages.length - 1];
    const modes = [...new Set(messages.map(msg => msg.mode))];
    const hasSpreadsheetContext = messages.some(msg => msg.sheetContext);

    return {
      messageCount: messages.length,
      lastActivity: lastMessage?.timestamp || null,
      hasSpreadsheetContext,
      chatModes: modes
    };
  }

  /**
   * Firebase에서 메시지를 가져오는 내부 메서드
   */
  private async fetchFromFirebase(chatId: string): Promise<CachedMessage[]> {
    try {
      // getChatMessages를 사용하고, 사용자 요청에 따라 최근 10개 메시지만 가져오도록 수정
      const messages = await this.firebaseService.getChatMessages(chatId, this.MAX_MESSAGES_FOR_AI);
      
      // Firebase에서 가져온 메시지는 최신순(desc)이므로, 시간순(asc)으로 변경하여 반환
      return messages.reverse().map(msg => ({
        id: msg.id,
        content: msg.content,
        role: msg.role as MessageRole, // FirebaseMessage의 role이 string으로 추론될 수 있어 enum으로 캐스팅
        mode: (msg as any).mode || MessageMode.NORMAL, // FirebaseMessage 타입에 mode가 없을 수 있어 any로 캐스팅
        // Firestore Timestamp는 toDate() 메서드로 Date 객체로 변환
        timestamp: (msg.timestamp as any)?.toDate ? (msg.timestamp as any).toDate() : new Date(msg.timestamp),
        metadata: (msg as any).metadata, // FirebaseMessage 타입에 metadata가 없을 수 있어 any로 캐스팅
        sheetContext: (msg as any).sheetContext // FirebaseMessage 타입에 sheetContext가 없을 수 있어 any로 캐스팅
      }));
    } catch (error) {
      this.logger.error(`Firebase에서 메시지 가져오기 실패: ${chatId}`, error);
      return [];
    }
  }

  /**
   * AI 요청용으로 메시지 수 제한
   */
  private getLimitedMessagesForAI(messages: CachedMessage[]): CachedMessage[] {
    if (messages.length <= this.MAX_MESSAGES_FOR_AI) {
      return messages;
    }

    // 캐시된 메시지 중에서도 최신 메시지만 사용
    const recentMessages = messages.slice(-this.MAX_MESSAGES_FOR_AI);
    
    this.logger.log(`AI용 메시지 제한: ${messages.length} -> ${recentMessages.length}`);
    return recentMessages;
  }

  /**
   * MessageRole을 OpenAI 형식으로 변환
   */
  private convertToOpenAIRole(role: MessageRole): string {
    switch (role) {
      case MessageRole.USER:
        return 'user';
      case MessageRole.EXTION_AI:
        return 'assistant';
      case MessageRole.SYSTEM:
        return 'system';
      default:
        this.logger.warn(`알 수 없는 역할 '${role}'이(가) 'user'로 변환되었습니다.`);
        return 'user';
    }
  }

  /**
   * 캐시 상태 정보 반환 (디버깅용)
   */
  getCacheStats(): {
    totalChats: number;
    totalMessages: number;
    cacheSize: string;
  } {
    const totalMessages = Array.from(this.cache.values())
      .reduce((sum, cache) => sum + cache.messages.length, 0);
    
    const cacheSize = `${(JSON.stringify([...this.cache]).length / 1024).toFixed(2)}KB`;

    return {
      totalChats: this.cache.size,
      totalMessages,
      cacheSize
    };
  }
}
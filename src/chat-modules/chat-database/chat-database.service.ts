import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageRole } from '../../common/dto/chat.dto';

export interface ChatListItem {
  chatId: string;
  title: string;
  messageCount: number;
  lastUpdated: Date;
  createdAt: Date;
  sheetMetaDataId?: string;
  status: string;
}

export interface ChatMessage {
  messageId: string;
  content: string;
  role: MessageRole;
  type: string;
  mode: string;
  timestamp: Date;
  sheetContext?: any;
  formulaData?: any;
  artifactData?: any;
  dataChangeInfo?: any;
  fileUploadInfo?: any;
  metadata?: any;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class ChatDatabaseService {
  private readonly logger = new Logger(ChatDatabaseService.name);

  constructor(private prismaService: PrismaService) {}

  /**
   * 새 채팅 생성
   */
  async createChat(title: string, userId: string, spreadsheetId?: string): Promise<ChatListItem> {
    try {
      this.logger.log(`새 채팅 생성: ${title}, 사용자: ${userId}`);

      // sheetMetaData 연결 처리
      let sheetMetaDataId: string | undefined = undefined;
      
      if (spreadsheetId) {
        // 스프레드시트 ID가 있으면 sheetMetaData에서 찾거나 생성
        const existingSheetMetaData = await this.prismaService.sheetMetaData.findFirst({
          where: { 
            fileName: spreadsheetId,
            userId,
          },
        });

        if (existingSheetMetaData) {
          sheetMetaDataId = existingSheetMetaData.id;
        } else {
          // 새로운 sheetMetaData 생성 (필요한 경우)
          const newSheetMetaData = await this.prismaService.sheetMetaData.create({
            data: {
              fileName: spreadsheetId,
              originalFileName: `스프레드시트 ${spreadsheetId.substring(0, 8)}...`,
              userId,
            },
          });
          sheetMetaDataId = newSheetMetaData.id;
        }
      }

      // 새 채팅 생성
      const newChat = await this.prismaService.chat.create({
        data: {
          title,
          userId,
          messageCount: 0,
          status: 'ACTIVE',
          sheetMetaDataId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      this.logger.log(`새 채팅 생성 완료: ${newChat.id}`);

      return {
        chatId: newChat.id,
        title: newChat.title,
        messageCount: newChat.messageCount,
        lastUpdated: newChat.updatedAt,
        createdAt: newChat.createdAt,
        sheetMetaDataId: newChat.sheetMetaDataId || undefined,
        status: newChat.status,
      };

    } catch (error) {
      this.logger.error('새 채팅 생성 중 오류:', error);
      throw error;
    }
  }

  /**
   * 사용자의 채팅 목록 가져오기
   */
  async getChatList(userId: string): Promise<ChatListItem[]> {
    try {
      this.logger.log(`채팅 목록 조회: ${userId}`);

      const chats = await this.prismaService.chat.findMany({
        where: { 
          userId,
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { messages: true },
          },
        },
      });

      const chatList = chats.map(chat => ({
        chatId: chat.id,
        title: chat.title,
        messageCount: chat.messageCount,
        lastUpdated: chat.updatedAt,
        createdAt: chat.createdAt,
        sheetMetaDataId: chat.sheetMetaDataId || undefined,
        status: chat.status,
      }));

      this.logger.log(`채팅 목록 조회 완료: ${chatList.length}개`);
      return chatList;

    } catch (error) {
      this.logger.error('채팅 목록 조회 중 오류:', error);
      throw error;
    }
  }

  /**
   * 특정 채팅의 메시지 가져오기
   */
  async getChatMessages(chatId: string, userId: string, limit?: number): Promise<ChatMessage[]> {
    try {
      this.logger.log(`채팅 메시지 조회: ${chatId}, 사용자: ${userId}`);

      // 채팅방 소유권 확인
      const chat = await this.prismaService.chat.findFirst({
        where: { 
          id: chatId,
          userId,
        },
      });

      if (!chat) {
        throw new BadRequestException('채팅방을 찾을 수 없거나 접근 권한이 없습니다.');
      }

      const messages = await this.prismaService.message.findMany({
        where: { chatId },
        orderBy: { timestamp: 'asc' },
        ...(limit && { take: limit }),
      });

      const chatMessages = messages.map(msg => ({
        messageId: msg.id,
        content: msg.content,
        role: msg.role as MessageRole,
        type: msg.type as any,
        mode: msg.mode as any,
        timestamp: msg.timestamp,
        sheetContext: msg.sheetContext,
        formulaData: msg.formulaData,
        artifactData: msg.artifactData,
        dataChangeInfo: msg.dataChangeInfo,
        fileUploadInfo: msg.fileUploadInfo,
        metadata: msg.metadata,
      }));

      this.logger.log(`채팅 메시지 조회 완료: ${chatMessages.length}개`);
      return chatMessages;

    } catch (error) {
      this.logger.error('채팅 메시지 조회 중 오류:', error);
      throw error;
    }
  }

  /**
   * AI 모델용 대화 기록 가져오기 (Anthropic Claude 형식)
   */
  async getChatHistory(chatId: string, limit: number = 20): Promise<AnthropicMessage[]> {
    try {
      this.logger.log(`대화 기록 조회: ${chatId}, 제한: ${limit}개`);

      const messages = await this.prismaService.message.findMany({
        where: { chatId },
        orderBy: { timestamp: 'desc' }, // 최신순으로 가져와서
        take: limit,
      });

      // 시간순으로 다시 정렬하고 Anthropic 형식으로 변환
      const historyMessages = messages
        .reverse() // 시간순으로 정렬
        .slice(0, -1) // 마지막 메시지(현재 사용자 메시지) 제외
        .map(msg => ({
          role: this.convertToAnthropicRole(msg.role as MessageRole),
          content: msg.content,
        }));

      this.logger.log(`대화 기록 조회 완료: ${historyMessages.length}개`);
      return historyMessages;

    } catch (error) {
      this.logger.error('대화 기록 조회 중 오류:', error);
      return []; // 오류 발생 시 빈 배열 반환 (채팅 처리가 중단되지 않도록)
    }
  }

  /**
   * 채팅방 존재 여부 확인
   */
  async chatExists(chatId: string, userId: string): Promise<boolean> {
    try {
      this.logger.log(`채팅 존재 확인: chatId=${chatId}, userId=${userId}`);
      
      const chat = await this.prismaService.chat.findFirst({
        where: { 
          id: chatId,
          userId,
          status: 'ACTIVE', // ACTIVE 상태인 채팅만 확인
        },
      });

      this.logger.log(`채팅 존재 확인 결과: ${!!chat ? '존재함' : '존재하지 않음'}`);
      return !!chat;

    } catch (error) {
      this.logger.error('채팅 존재 확인 중 오류:', error);
      return false;
    }
  }

  /**
   * 채팅방 정보 가져오기
   */
  async getChatInfo(chatId: string, userId: string): Promise<any> {
    try {
      const chat = await this.prismaService.chat.findFirst({
        where: { 
          id: chatId,
          userId,
        },
        include: {
          sheetMetaData: true,
        },
      });

      if (!chat) {
        return null;
      }

      return {
        chatId: chat.id,
        title: chat.title,
        userId: chat.userId,
        messageCount: chat.messageCount,
        status: chat.status,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        sheetMetaDataId: chat.sheetMetaDataId,
        sheetMetaData: chat.sheetMetaData,
      };

    } catch (error) {
      this.logger.error('채팅 정보 조회 중 오류:', error);
      return null;
    }
  }

  /**
   * 채팅방 삭제 (소프트 삭제)
   */
  async deleteChat(chatId: string, userId: string): Promise<boolean> {
    try {
      this.logger.log(`채팅방 삭제: ${chatId}, 사용자: ${userId}`);

      // 채팅방 소유권 확인
      const chat = await this.prismaService.chat.findFirst({
        where: { 
          id: chatId,
          userId,
        },
      });

      if (!chat) {
        throw new BadRequestException('채팅방을 찾을 수 없거나 접근 권한이 없습니다.');
      }

      // 소프트 삭제 (상태를 DELETED로 변경)
      await this.prismaService.chat.update({
        where: { id: chatId },
        data: { 
          status: 'DELETED',
          updatedAt: new Date(),
        },
      });

      this.logger.log(`채팅방 삭제 완료: ${chatId}`);
      return true;

    } catch (error) {
      this.logger.error('채팅방 삭제 중 오류:', error);
      return false;
    }
  }

  /**
   * 채팅방 제목 업데이트
   */
  async updateChatTitle(chatId: string, userId: string, newTitle: string): Promise<{
    id: string;
    title: string;
    updatedAt: Date;
  }> {
    try {
      this.logger.log(`채팅방 제목 업데이트: ${chatId}, 새 제목: ${newTitle}`);

      // 채팅방 소유권 확인
      const chat = await this.prismaService.chat.findFirst({
        where: { 
          id: chatId,
          userId,
          status: 'ACTIVE', // ACTIVE 상태인 채팅만 업데이트 가능
        },
      });

      if (!chat) {
        throw new BadRequestException('채팅방을 찾을 수 없거나 접근 권한이 없습니다.');
      }

      const updatedChat = await this.prismaService.chat.update({
        where: { id: chatId },
        data: { 
          title: newTitle,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          title: true,
          updatedAt: true,
        },
      });

      this.logger.log(`채팅방 제목 업데이트 완료: ${chatId}`);
      return updatedChat;

    } catch (error) {
      this.logger.error('채팅방 제목 업데이트 중 오류:', error);
      throw error;
    }
  }

  /**
   * 최근 메시지 가져오기 (미리보기용)
   */
  async getRecentMessages(chatId: string, userId: string, limit: number = 5): Promise<ChatMessage[]> {
    try {
      // 채팅방 소유권 확인
      const chat = await this.prismaService.chat.findFirst({
        where: { 
          id: chatId,
          userId,
        },
      });

      if (!chat) {
        return [];
      }

      const messages = await this.prismaService.message.findMany({
        where: { chatId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return messages.map(msg => ({
        messageId: msg.id,
        content: msg.content,
        role: msg.role as MessageRole,
        type: msg.type as any,
        mode: msg.mode as any,
        timestamp: msg.timestamp,
        sheetContext: msg.sheetContext,
        formulaData: msg.formulaData,
        artifactData: msg.artifactData,
        dataChangeInfo: msg.dataChangeInfo,
        fileUploadInfo: msg.fileUploadInfo,
        metadata: msg.metadata,
      }));

    } catch (error) {
      this.logger.error('최근 메시지 조회 중 오류:', error);
      return [];
    }
  }

  /**
   * MessageRole을 Anthropic 형식으로 변환
   */
  private convertToAnthropicRole(role: MessageRole): 'user' | 'assistant' {
    switch (role) {
      case MessageRole.USER:
        return 'user';
      case MessageRole.EXTION_AI:
        return 'assistant';
      case MessageRole.SYSTEM:
        return 'assistant'; // Anthropic에서는 system을 assistant로 처리
      default:
        return 'user';
    }
  }

  /**
   * 채팅 통계 정보 가져오기
   */
  async getChatStats(userId: string): Promise<{
    totalChats: number;
    totalMessages: number;
    activeChatCount: number;
    recentChatCount: number;
  }> {
    try {
      const [totalChats, activeChatCount, recentChatCount, messageStats] = await Promise.all([
        // 전체 채팅 수
        this.prismaService.chat.count({
          where: { userId },
        }),
        // 활성 채팅 수
        this.prismaService.chat.count({
          where: { 
            userId,
            status: 'ACTIVE',
          },
        }),
        // 최근 7일 내 채팅 수
        this.prismaService.chat.count({
          where: { 
            userId,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
        // 총 메시지 수
        this.prismaService.message.count({
          where: {
            chat: {
              userId,
            },
          },
        }),
      ]);

      return {
        totalChats,
        totalMessages: messageStats,
        activeChatCount,
        recentChatCount,
      };

    } catch (error) {
      this.logger.error('채팅 통계 조회 중 오류:', error);
      return {
        totalChats: 0,
        totalMessages: 0,
        activeChatCount: 0,
        recentChatCount: 0,
      };
    }
  }

  /**
   * 어드민용: 특정 채팅의 메시지 가져오기 (권한 체크 우회)
   */
  async getAdminChatMessages(chatId: string, limit?: number): Promise<ChatMessage[]> {
    try {
      this.logger.log(`어드민용 채팅 메시지 조회: ${chatId}`);

      const messages = await this.prismaService.message.findMany({
        where: { chatId },
        orderBy: { timestamp: 'asc' },
        ...(limit && { take: limit }),
      });

      const chatMessages = messages.map(msg => ({
        messageId: msg.id,
        content: msg.content,
        role: msg.role as MessageRole,
        type: msg.type as any,
        mode: msg.mode as any,
        timestamp: msg.timestamp,
        sheetContext: msg.sheetContext,
        formulaData: msg.formulaData,
        artifactData: msg.artifactData,
        dataChangeInfo: msg.dataChangeInfo,
        fileUploadInfo: msg.fileUploadInfo,
        metadata: msg.metadata,
      }));

      this.logger.log(`어드민용 채팅 메시지 조회 완료: ${chatMessages.length}개`);
      return chatMessages;

    } catch (error) {
      this.logger.error('어드민용 채팅 메시지 조회 중 오류:', error);
      throw error;
    }
  }

  /**
   * 어드민용: 채팅 정보 가져오기 (권한 체크 우회)
   */
  async getAdminChatInfo(chatId: string): Promise<any> {
    try {
      this.logger.log(`어드민용 채팅 정보 조회: ${chatId}`);

      const chat = await this.prismaService.chat.findUnique({
        where: { id: chatId },
        include: {
          _count: {
            select: { messages: true }
          }
        }
      });

      if (!chat) {
        this.logger.warn(`어드민용 채팅 정보 조회 - 채팅을 찾을 수 없음: ${chatId}`);
        return null;
      }

      this.logger.log(`어드민용 채팅 정보 조회 완료: ${chatId}`);
      
      return {
        id: chat.id,
        title: chat.title,
        userId: chat.userId,
        status: chat.status,
        messageCount: chat._count.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        sheetMetaDataId: chat.sheetMetaDataId,
      };

    } catch (error) {
      this.logger.error('어드민용 채팅 정보 조회 중 오류:', error);
      throw error;
    }
  }

  /**
   * 어드민용: 모든 채팅 목록 가져오기
   */
  async getAllChats(): Promise<ChatListItem[]> {
    try {
      this.logger.log('어드민용 모든 채팅 목록 조회');

      const chats = await this.prismaService.chat.findMany({
        where: { 
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { messages: true },
          },
          user: {
            select: {
              displayName: true,
              email: true,
            }
          }
        },
      });

      const chatList = chats.map(chat => ({
        chatId: chat.id,
        title: chat.title,
        messageCount: chat.messageCount,
        lastUpdated: chat.updatedAt,
        createdAt: chat.createdAt,
        sheetMetaDataId: chat.sheetMetaDataId || undefined,
        status: chat.status,
        userId: chat.userId,
        userDisplayName: chat.user?.displayName,
        userEmail: chat.user?.email,
      }));

      this.logger.log(`어드민용 모든 채팅 목록 조회 완료: ${chatList.length}개`);
      return chatList as ChatListItem[];

    } catch (error) {
      this.logger.error('어드민용 모든 채팅 목록 조회 중 오류:', error);
      throw error;
    }
  }
}

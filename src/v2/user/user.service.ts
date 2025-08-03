// src/v2/user/user.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/v2/prisma/prisma.service';
import { randomUUID } from 'crypto';
import { ChatStatus } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 사용자 생성
   * - 프론트엔드에서 제공한 userId로 사용자 생성
   */
  public async createUser(userId: string, displayName?: string, isGuest: boolean = false): Promise<{ id: string; displayName: string; isGuest: boolean }> {
    try {
      const user = await this.prisma.user.create({
        data: {
          id: userId,
          displayName: displayName || (isGuest ? `Guest User ${Date.now()}` : `User ${userId}`),
          isGuest,
        }
      });

      return {
        id: user.id,
        displayName: user.displayName,
        isGuest: user.isGuest
      };
    } catch (error) {
      // 이미 존재하는 사용자인 경우
      if (error.code === 'P2002') {
        const existingUser = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, displayName: true, isGuest: true }
        });
        
        if (existingUser) {
          return existingUser;
        }
      }
      throw error;
    }
  }

  /**
   * 사용자 존재 여부 검증
   * - guest 사용자는 자동 생성
   * - 일반 사용자는 프론트엔드에서 미리 생성되어야 함
   */
  public async validateUser(userId: string): Promise<void> {
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    // guest 사용자가 없으면 자동 생성
    if (!user && userId.startsWith('guest_')) {
      try {
        user = await this.prisma.user.create({
          data: {
            id: userId,
            displayName: `Guest User ${Date.now()}`,
            isGuest: true,
          },
          select: { id: true },
        });
      } catch (error) {
        // 동시 요청으로 이미 생성된 경우 다시 조회
        if (error.code === 'P2002') {
          user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
          });
        } else {
          throw error;
        }
      }
    }

    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }
  }

  /**
   * 채팅 조회 또는 생성
   * - chatId가 주어지면 해당 채팅이 존재 + 소유자 일치 여부 확인
   * - chatId가 없으면 서버에서 UUID를 발급해 새 채팅을 만든 뒤 반환
   */
  public async ensureChat(
    chatId: string | undefined,
    userId: string,
    title: string = 'New Chat',
  ) {
    if (chatId) {
      // 기존 채팅 확인
      const existingChat = await this.prisma.chat.findFirst({
        where: { id: chatId, userId, status: ChatStatus.ACTIVE },
        select: { id: true },
      });

      if (existingChat) {
        return existingChat; // 기존 채팅 반환
      }

      // 기존 채팅이 없으면 해당 chatId로 새 채팅 생성
      return this.prisma.chat.create({
        data: {
          id: chatId,          // ← 프론트에서 제공한 UUID 사용
          title,
          userId,
          status: ChatStatus.ACTIVE,
          messageCount: 0,
        },
        select: { id: true },
      });
    }

    // chatId가 없으면 서버에서 UUID 생성하여 새 채팅 생성
    return this.prisma.chat.create({
      data: {
        id: randomUUID(),      // ← 서버에서 안전하게 생성
        title,
        userId,
        status: ChatStatus.ACTIVE,
        messageCount: 0,
      },
      select: { id: true },
    });
  }

  /**
   * (선택) 스프레드시트 ID 기반 소유·존재 확인 헬퍼
   *  ─ 이름 중복과 무관하게 ID 절대 키만 사용
   */
  public async assertSpreadsheetOwner(
    spreadsheetId: string,
    userId: string,
  ): Promise<void> {
    const sheet = await this.prisma.spreadSheet.findFirst({
      where: { id: spreadsheetId, userId },
      select: { id: true },
    });

    if (!sheet) {
      throw new NotFoundException(
        `Spreadsheet not found or access denied: ${spreadsheetId}`,
      );
    }
  }
}

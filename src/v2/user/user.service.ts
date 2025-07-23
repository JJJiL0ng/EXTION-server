import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/v2/prisma/prisma.service';

@Injectable()
export class UserService {
    constructor(private readonly prisma: PrismaService) { }

    // user 관련 검증 로직들 모음 (Userid로 검증하는 모든 검증 로직)

    //user존재 여부  검증
    public async validateUser(userId: string) {
        let user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });

        // 게스트 유저인 경우 자동 생성
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
                // 동시 생성으로 인한 중복 에러는 무시하고 다시 조회
                user = await this.prisma.user.findUnique({
                    where: { id: userId },
                    select: { id: true },
                });
            }
        }

        if (!user) {
            throw new NotFoundException(`User not found: ${userId}`);
        }
    }
    //chat 생성 또는 존재 확인
    public async ensureChat(chatId: string, userId: string, title: string = 'New Chat') {
        let chat = await this.prisma.chat.findFirst({
            where: { id: chatId, userId },
            select: { id: true },
        });

        if (!chat) {
            // 채팅이 없으면 새로 생성
            chat = await this.prisma.chat.create({
                data: {
                    id: chatId,
                    title,
                    userId,
                },
                select: { id: true },
            });
        }

        return chat;
    }
    //기존 스프레드시트 존재 여부 검증
    public async findExistingSpreadSheet(userId: string, fileName: string, chatId?: string) {
        return await this.prisma.spreadSheet.findFirst({
          where: {
            userId,
            fileName,
            chatId,
          },
          select: { id: true },
        });
      }
}


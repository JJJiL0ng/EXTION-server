import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserService {
    constructor(private readonly prisma: PrismaService) { }

    // user 관련 검증 로직들 모음 (Userid로 검증하는 모든 검증 로직)

    //user존재 여부  검증
    public async validateUser(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });

        if (!user) {
            throw new NotFoundException(`User not found: ${userId}`);
        }
    }
    //chat존재 여부 검증
    public async validateChat(chatId: string, userId: string) {
        const chat = await this.prisma.chat.findFirst({
            where: { id: chatId, userId },
            select: { id: true },
        });

        if (!chat) {
            throw new NotFoundException(`Chat not found or access denied: ${chatId}`);
        }
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


import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AiChatUserService {
  private readonly logger = new Logger(AiChatUserService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureUserExists(userId: string, tx?: any): Promise<void> {
    const prismaClient = tx || this.prisma;

    const existingUser = await prismaClient.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (existingUser) {
      return;
    }

    this.logger.log(`User not found, creating new user - userId: ${userId}`);

    try {
      await prismaClient.user.create({
        data: {
          id: userId,
          displayName: userId.startsWith('guest_')
            ? `Guest User ${Date.now()}`
            : `User ${userId}`,
          isGuest: userId.startsWith('guest_'),
        },
      });
      this.logger.log(`User created successfully - userId: ${userId}`);
    } catch (error) {
      if (error.code === 'P2002') {
        this.logger.log(`User already exists (concurrent creation) - userId: ${userId}`);
        return;
      }

      throw error;
    }
  }
}

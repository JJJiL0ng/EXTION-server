import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { aiChatApiRes } from '../types/aiChat.types';

type PrismaExecutor = PrismaService | any;

@Injectable()
export class AiChatMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(callback);
  }

  findChat(chatId: string, client: PrismaExecutor = this.prisma) {
    return client.chat.findUnique({
      where: { id: chatId },
    });
  }

  findOwnedChat(
    chatId: string,
    userId: string,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    });
  }

  findMessagesBySession(
    chatSessionId: string,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.message.findMany({
      where: {
        chatSessionBranch: {
          chatSessionId,
        },
      },
    });
  }

  createUserMessage(
    input: {
      content: string;
      chatSessionBranchId: string;
    },
    client: PrismaExecutor = this.prisma,
  ) {
    return client.message.create({
      data: {
        content: input.content,
        role: 'USER',
        type: 'TEXT',
        chatSessionBranchId: input.chatSessionBranchId,
      },
    });
  }

  createAssistantMessage(
    input: {
      content: string;
      chatSessionBranchId: string;
      aiChatRes: aiChatApiRes;
    },
    client: PrismaExecutor = this.prisma,
  ) {
    return client.message.create({
      data: {
        content: input.content,
        role: 'ASSISTANT',
        type: 'SUGGESTION',
        chatSessionBranchId: input.chatSessionBranchId,
        aiChatRes: input.aiChatRes as unknown as any,
      },
    });
  }
}

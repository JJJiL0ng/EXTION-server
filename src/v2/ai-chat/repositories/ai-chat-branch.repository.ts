import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaExecutor = PrismaService | any;

@Injectable()
export class AiChatBranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(callback);
  }

  findChat(chatId: string, client: PrismaExecutor = this.prisma) {
    return client.chat.findUnique({
      where: { id: chatId },
    });
  }

  findChatLatestSession(chatId: string, client: PrismaExecutor = this.prisma) {
    return client.chat.findUnique({
      where: { id: chatId },
      select: { latestChatSessionId: true },
    });
  }

  createChat(
    data: {
      id: string;
      title: string;
      status: string;
      messageCount: number;
      spreadSheetId: string;
      userId: string;
    },
    client: PrismaExecutor = this.prisma,
  ) {
    return client.chat.create({ data });
  }

  updateChatLatestSession(
    chatId: string,
    chatSessionId: string,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.chat.update({
      where: { id: chatId },
      data: { latestChatSessionId: chatSessionId },
    });
  }

  findSessionWithBranches(
    chatId: string,
    chatSessionId: string,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.chatSession.findFirst({
      where: {
        id: chatSessionId,
        chatId,
      },
      include: {
        branches: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
  }

  upsertSession(
    chatId: string,
    chatSessionId: string,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.chatSession.upsert({
      where: {
        id: chatSessionId,
      },
      update: {
        chatId,
      },
      create: {
        id: chatSessionId,
        chatId,
        name: '새 대화',
      },
    });
  }

  findBranch(branchId: string, client: PrismaExecutor = this.prisma) {
    return client.chatSessionBranch.findUnique({
      where: { id: branchId },
    });
  }

  findBranchForRollback(branchId: string, client: PrismaExecutor = this.prisma) {
    return client.chatSessionBranch.findUnique({
      where: { id: branchId },
      select: {
        parentBranchId: true,
        chatSessionId: true,
      },
    });
  }

  findParentBranchForRollback(branchId: string, client: PrismaExecutor = this.prisma) {
    return client.chatSessionBranch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        spreadSheetVersionId: true,
      },
    });
  }

  createBranch(
    data: {
      id?: string;
      chatSessionId: string;
      parentBranchId: string | null;
      spreadSheetVersionId?: string;
    },
    client: PrismaExecutor = this.prisma,
  ) {
    return client.chatSessionBranch.create({ data });
  }

  updateSessionLatestBranch(
    chatSessionId: string,
    branchId: string,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.chatSession.update({
      where: { id: chatSessionId },
      data: { latestBranchId: branchId },
    });
  }

  incrementSpreadsheetEditLockVersion(
    spreadSheetId: string,
    client: PrismaExecutor = this.prisma,
  ) {
    return client.spreadSheet.update({
      where: { id: spreadSheetId },
      data: { editLockVersion: { increment: 1 } },
      select: { editLockVersion: true },
    });
  }
}

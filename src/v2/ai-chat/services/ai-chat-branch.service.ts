import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RollbackBranchResult {
  spreadSheetVersionId: string;
  lastestBranchID: string;
  editLockVersion: number;
}

export interface ActiveBranchResult {
  chat: any;
  session: any;
  branch: any;
}

@Injectable()
export class AiChatBranchService {
  private readonly logger = new Logger(AiChatBranchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async rollPreviousMessage(
    spreadSheetId: string,
    chatSessionId: string,
    chatSessionBranchId: string,
  ): Promise<RollbackBranchResult> {
    return await this.prisma.$transaction(async (tx) => {
      const currentBranch = await tx.chatSessionBranch.findUnique({
        where: { id: chatSessionBranchId },
        select: {
          parentBranchId: true,
          chatSessionId: true,
        },
      });

      if (!currentBranch) {
        throw new Error(`ChatSessionBranch with id ${chatSessionBranchId} not found`);
      }

      if (!currentBranch.parentBranchId) {
        throw new Error(`Cannot roll back: ChatSessionBranch ${chatSessionBranchId} has no parent branch`);
      }

      const parentBranch = await tx.chatSessionBranch.findUnique({
        where: { id: currentBranch.parentBranchId },
        select: {
          id: true,
          spreadSheetVersionId: true,
        },
      });

      if (!parentBranch) {
        throw new Error(`Parent branch with id ${currentBranch.parentBranchId} not found`);
      }

      await tx.chatSession.update({
        where: { id: chatSessionId },
        data: { latestBranchId: parentBranch.id },
      });

      const updatedSpreadSheet = await tx.spreadSheet.update({
        where: { id: spreadSheetId },
        data: { editLockVersion: { increment: 1 } },
        select: { editLockVersion: true },
      });

      return {
        spreadSheetVersionId: parentBranch.spreadSheetVersionId || '',
        lastestBranchID: parentBranch.id,
        editLockVersion: updatedSpreadSheet.editLockVersion,
      };
    });
  }

  async getMessagesFromActiveBranchLineage(
    chatId: string,
    chatSessionId?: string,
  ): Promise<any[]> {
    try {
      let targetSessionId = chatSessionId;

      if (!targetSessionId) {
        const basicChat = await this.prisma.chat.findUnique({
          where: { id: chatId },
          select: { latestChatSessionId: true },
        });
        targetSessionId = basicChat?.latestChatSessionId ?? undefined;
      }

      if (!targetSessionId) {
        this.logger.log(`활성 채팅 세션이 없음 - chatId: ${chatId}, chatSessionId: ${chatSessionId}`);
        return [];
      }

      const session = await this.prisma.chatSession.findFirst({
        where: {
          id: targetSessionId,
          chatId: chatId,
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

      if (!session) {
        this.logger.log(`지정된 채팅 세션을 찾을 수 없음 - chatId: ${chatId}, sessionId: ${targetSessionId}`);
        return [];
      }

      if (!session.latestBranchId) {
        this.logger.log(`활성 브랜치가 없음 - chatId: ${chatId}, sessionId: ${session.id}`);
        return [];
      }

      const branchLineage: string[] = [];
      let currentBranchId: string | null = session.latestBranchId;

      while (currentBranchId) {
        branchLineage.unshift(currentBranchId);
        const currentBranch = session.branches.find((branch) => branch.id === currentBranchId);
        currentBranchId = currentBranch?.parentBranchId || null;
      }

      this.logger.log(`브랜치 계보 추적 완료 - chatId: ${chatId}, sessionId: ${targetSessionId}, 브랜치 순서: ${branchLineage.join(' -> ')}`);

      const orderedMessages: any[] = [];
      for (const branchId of branchLineage) {
        const branch = session.branches.find((item) => item.id === branchId);
        if (branch) {
          orderedMessages.push(...branch.messages);
        }
      }

      return orderedMessages
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-10);
    } catch (error) {
      this.logger.error(`브랜치 계보 추적 실패 - chatId: ${chatId}: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  async getOrCreateActiveBranch(
    chatId: string,
    chatSessionId: string,
    spreadSheetId: string,
    userId: string,
    tx: any,
  ): Promise<ActiveBranchResult> {
    let chat = await tx.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      this.logger.log(`Chat not found, creating new chat: ${chatId}`);

      chat = await tx.chat.create({
        data: {
          id: chatId,
          title: '새 채팅',
          status: 'ACTIVE',
          messageCount: 0,
          spreadSheetId: spreadSheetId,
          userId: userId,
        },
      });

      this.logger.log(`새 Chat 생성 완료: ${chatId}, spreadSheetId: ${spreadSheetId}`);
    }

    const session: any = await tx.chatSession.upsert({
      where: {
        id: chatSessionId,
      },
      update: {
        chatId: chatId,
      },
      create: {
        id: chatSessionId,
        chatId: chatId,
        name: '새 대화',
      },
    });

    await tx.chat.update({
      where: { id: chatId },
      data: { latestChatSessionId: session.id },
    });

    this.logger.log(`ChatSession 준비됨 - sessionId: ${session.id}`);

    let branch: any = null;
    if (session.latestBranchId) {
      branch = await tx.chatSessionBranch.findUnique({
        where: { id: session.latestBranchId },
      });
    }

    if (!branch) {
      branch = await tx.chatSessionBranch.create({
        data: {
          chatSessionId: session.id,
          parentBranchId: null,
        },
      });

      await tx.chatSession.update({
        where: { id: session.id },
        data: { latestBranchId: branch.id },
      });

      this.logger.log(`새 ChatSessionBranch 생성됨 - branchId: ${branch.id}`);
    }

    return { chat, session, branch };
  }
}

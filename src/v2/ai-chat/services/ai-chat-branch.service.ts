import { Injectable, Logger } from '@nestjs/common';
import { AiChatBranchRepository } from '../repositories/ai-chat-branch.repository';

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

  constructor(private readonly branchRepository: AiChatBranchRepository) {}

  async rollPreviousMessage(
    spreadSheetId: string,
    chatSessionId: string,
    chatSessionBranchId: string,
  ): Promise<RollbackBranchResult> {
    return await this.branchRepository.transaction(async (tx) => {
      const currentBranch = await this.branchRepository.findBranchForRollback(
        chatSessionBranchId,
        tx,
      );

      if (!currentBranch) {
        throw new Error(`ChatSessionBranch with id ${chatSessionBranchId} not found`);
      }

      if (!currentBranch.parentBranchId) {
        throw new Error(`Cannot roll back: ChatSessionBranch ${chatSessionBranchId} has no parent branch`);
      }

      const parentBranch = await this.branchRepository.findParentBranchForRollback(
        currentBranch.parentBranchId,
        tx,
      );

      if (!parentBranch) {
        throw new Error(`Parent branch with id ${currentBranch.parentBranchId} not found`);
      }

      await this.branchRepository.updateSessionLatestBranch(chatSessionId, parentBranch.id, tx);

      const updatedSpreadSheet = await this.branchRepository.incrementSpreadsheetEditLockVersion(
        spreadSheetId,
        tx,
      );

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
        const basicChat = await this.branchRepository.findChatLatestSession(chatId);
        targetSessionId = basicChat?.latestChatSessionId ?? undefined;
      }

      if (!targetSessionId) {
        this.logger.log(`활성 채팅 세션이 없음 - chatId: ${chatId}, chatSessionId: ${chatSessionId}`);
        return [];
      }

      const session = await this.branchRepository.findSessionWithBranches(
        chatId,
        targetSessionId,
      );

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
    let chat = await this.branchRepository.findChat(chatId, tx);

    if (!chat) {
      this.logger.log(`Chat not found, creating new chat: ${chatId}`);

      chat = await this.branchRepository.createChat({
        id: chatId,
        title: '새 채팅',
        status: 'ACTIVE',
        messageCount: 0,
        spreadSheetId: spreadSheetId,
        userId: userId,
      }, tx);

      this.logger.log(`새 Chat 생성 완료: ${chatId}, spreadSheetId: ${spreadSheetId}`);
    }

    const session: any = await this.branchRepository.upsertSession(chatId, chatSessionId, tx);

    await this.branchRepository.updateChatLatestSession(chatId, session.id, tx);

    this.logger.log(`ChatSession 준비됨 - sessionId: ${session.id}`);

    let branch: any = null;
    if (session.latestBranchId) {
      branch = await this.branchRepository.findBranch(session.latestBranchId, tx);
    }

    if (!branch) {
      branch = await this.branchRepository.createBranch({
        chatSessionId: session.id,
        parentBranchId: null,
      }, tx);

      await this.branchRepository.updateSessionLatestBranch(session.id, branch.id, tx);

      this.logger.log(`새 ChatSessionBranch 생성됨 - branchId: ${branch.id}`);
    }

    return { chat, session, branch };
  }
}

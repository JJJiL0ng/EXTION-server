import { Injectable, Logger } from '@nestjs/common';
import { createSafeError } from '../../sheet/types/spreadsheet.types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  aiChatApiReq,
  aiChatApiRes,
  AiPreviousMessage,
  ChatHistory,
  previousMessagesContent,
  UserPreviousMessage,
} from '../types/aiChat.types';
import { AiChatBranchService } from './ai-chat-branch.service';
import { AiChatUserService } from './ai-chat-user.service';

function isAiChatApiRes(obj: any): obj is aiChatApiRes {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.jobId === 'string' &&
    obj.taskManagerOutput &&
    typeof obj.taskManagerOutput === 'object' &&
    obj.dataEditChatRes &&
    typeof obj.dataEditChatRes === 'object'
  );
}

function parseAiChatApiRes(jsonValue: any): aiChatApiRes | null {
  if (!jsonValue) {
    return null;
  }

  try {
    const obj = typeof jsonValue === 'string' ? JSON.parse(jsonValue) : jsonValue;
    return isAiChatApiRes(obj) ? obj : null;
  } catch (error) {
    return null;
  }
}

@Injectable()
export class AiChatMessageService {
  private readonly logger = new Logger(AiChatMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly branchService: AiChatBranchService,
    private readonly userService: AiChatUserService,
  ) {}

  async saveUserMessage(aiReq: aiChatApiReq): Promise<string> {
    try {
      this.logger.log(`사용자 메시지 저장 시작 - chatId: ${aiReq.chatId}, userId: ${aiReq.userId}, userChatSessionBranchId: ${aiReq.userChatSessionBranchId}`);
      this.logger.log(`🔍 DEBUG: aiReq.spreadSheetVersionId = ${aiReq.spreadSheetVersionId} (type: ${typeof aiReq.spreadSheetVersionId})`);

      return await this.prisma.$transaction(async (tx) => {
        if (!aiReq.chatSessionId) {
          throw new Error('chatSessionId is required to save user message');
        }

        await this.userService.ensureUserExists(aiReq.userId, tx);

        const { session } = await this.branchService.getOrCreateActiveBranch(
          aiReq.chatId,
          aiReq.chatSessionId,
          aiReq.spreadsheetId,
          aiReq.userId,
          tx,
        );

        const existingMessages = await tx.message.findMany({
          where: {
            chatSessionBranch: {
              chatSessionId: session.id,
            },
          },
        });

        let targetBranchId: string;

        if (existingMessages.length === 0) {
          this.logger.log(`첫 번째 채팅 - 부모 노드 생성 후 자식 노드를 userChatSessionBranchId로 생성`);

          this.logger.log(`🔍 DEBUG: 부모 브랜치 생성 - spreadSheetVersionId: ${aiReq.spreadSheetVersionId}, 조건: ${!!aiReq.spreadSheetVersionId}`);
          const parentBranch = await tx.chatSessionBranch.create({
            data: {
              chatSessionId: session.id,
              parentBranchId: null,
              ...(aiReq.spreadSheetVersionId && { spreadSheetVersionId: aiReq.spreadSheetVersionId }),
            },
          });
          this.logger.log(`🔍 DEBUG: 부모 브랜치 생성 완료 - id: ${parentBranch.id}, spreadSheetVersionId: ${(parentBranch as any).spreadSheetVersionId}`);

          this.logger.log(`🔍 DEBUG: 자식 브랜치 생성 - spreadSheetVersionId: ${aiReq.spreadSheetVersionId}, 조건: ${!!aiReq.spreadSheetVersionId}`);
          const childBranch = await tx.chatSessionBranch.create({
            data: {
              id: aiReq.userChatSessionBranchId,
              chatSessionId: session.id,
              parentBranchId: parentBranch.id,
              ...(aiReq.spreadSheetVersionId && { spreadSheetVersionId: aiReq.spreadSheetVersionId }),
            },
          });
          this.logger.log(`🔍 DEBUG: 자식 브랜치 생성 완료 - id: ${childBranch.id}, spreadSheetVersionId: ${(childBranch as any).spreadSheetVersionId}`);

          targetBranchId = childBranch.id;

          await tx.chatSession.update({
            where: { id: session.id },
            data: { latestBranchId: childBranch.id },
          });

          this.logger.log(`첫 번째 채팅 브랜치 생성 완료 - parentId: ${parentBranch.id}, childId: ${childBranch.id}`);
        } else {
          this.logger.log(`후속 채팅 - userChatSessionBranchId를 브랜치 ID로 직접 사용`);

          const existingBranch = await tx.chatSessionBranch.findUnique({
            where: { id: aiReq.userChatSessionBranchId },
          });

          if (!existingBranch) {
            const currentBranch = await tx.chatSessionBranch.findUnique({
              where: { id: session.latestBranchId },
            });

            if (!currentBranch) {
              throw new Error('Current branch not found');
            }

            this.logger.log(`🔍 DEBUG: 후속 브랜치 생성 - spreadSheetVersionId: ${aiReq.spreadSheetVersionId}, 조건: ${!!aiReq.spreadSheetVersionId}`);
            const newBranch = await tx.chatSessionBranch.create({
              data: {
                id: aiReq.userChatSessionBranchId,
                chatSessionId: session.id,
                parentBranchId: currentBranch.id,
                ...(aiReq.spreadSheetVersionId && { spreadSheetVersionId: aiReq.spreadSheetVersionId }),
              },
            });
            this.logger.log(`🔍 DEBUG: 후속 브랜치 생성 완료 - id: ${newBranch.id}, spreadSheetVersionId: ${(newBranch as any).spreadSheetVersionId}`);

            targetBranchId = newBranch.id;

            await tx.chatSession.update({
              where: { id: session.id },
              data: { latestBranchId: newBranch.id },
            });

            this.logger.log(`후속 채팅 브랜치 생성 완료 - branchId: ${newBranch.id}`);
          } else {
            targetBranchId = existingBranch.id;
            this.logger.log(`기존 브랜치 사용 - branchId: ${existingBranch.id}`);
          }
        }

        const message = await tx.message.create({
          data: {
            content: aiReq.userQuestionMessage,
            role: 'USER',
            type: 'TEXT',
            chatSessionBranchId: targetBranchId,
          },
        });

        this.logger.log(`사용자 메시지 저장 완료 - messageId: ${message.id}, branchId: ${targetBranchId}, beforeSheetVersionId: ${aiReq.spreadSheetVersionId || 'none'}`);
        return message.id;
      });
    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`사용자 메시지 저장 실패: ${safeError.message}`, safeError.details);
      throw new Error(`사용자 메시지 저장 실패: ${safeError.message}`);
    }
  }

  async saveAssistantMessage(
    chatId: string,
    chatSessionId: string,
    aiChatRes: aiChatApiRes,
    spreadSheetVersionId: string | null,
  ): Promise<string> {
    try {
      this.logger.log(`AI 응답 메시지 저장 시작 - chatId: ${chatId}, jobId: ${aiChatRes.jobId}`);

      if (!isAiChatApiRes(aiChatRes)) {
        throw new Error('유효하지 않은 aiChatApiRes 데이터입니다');
      }

      return await this.prisma.$transaction(async (tx) => {
        const existingChat = await tx.chat.findUnique({
          where: { id: chatId },
        });

        if (!existingChat) {
          throw new Error(`Chat not found for saveAssistantMessage: ${chatId}`);
        }

        await this.userService.ensureUserExists(existingChat.userId, tx);

        const { session, branch: currentBranch } = await this.branchService.getOrCreateActiveBranch(
          chatId,
          chatSessionId,
          existingChat.spreadSheetId,
          existingChat.userId,
          tx,
        );

        const newBranch = await tx.chatSessionBranch.create({
          data: {
            chatSessionId: session.id,
            parentBranchId: currentBranch.id,
            ...(spreadSheetVersionId && { spreadSheetVersionId }),
          },
        });

        const message = await tx.message.create({
          data: {
            content: aiChatRes.taskManagerOutput.reason,
            role: 'ASSISTANT',
            type: 'SUGGESTION',
            chatSessionBranchId: newBranch.id,
            aiChatRes: aiChatRes as unknown as any,
          },
        });

        await tx.chatSession.update({
          where: { id: session.id },
          data: { latestBranchId: newBranch.id },
        });

        this.logger.log(`AI 응답 메시지 저장 완료 - messageId: ${message.id}, branchId: ${newBranch.id}, afterSheetVersionId: ${spreadSheetVersionId || 'none'}`);
        return message.id;
      });
    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`AI 응답 메시지 저장 실패: ${safeError.message}`, safeError.details);
      throw new Error(`AI 응답 메시지 저장 실패: ${safeError.message}`);
    }
  }

  async loadMultiturnMessages(chatId: string, chatSessionId: string): Promise<ChatHistory> {
    try {
      this.logger.log(`멀티턴 메시지 로드 시작 - chatId: ${chatId}`);

      const messagesInOrder = await this.branchService.getMessagesFromActiveBranchLineage(
        chatId,
        chatSessionId,
      );

      if (messagesInOrder.length === 0) {
        this.logger.log(`메시지를 찾을 수 없음 - chatId: ${chatId}`);
        return [];
      }

      const chatHistory: ChatHistory = messagesInOrder.map((message) => {
        if (message.role === 'USER') {
          const userMessage: UserPreviousMessage = {
            role: 'user',
            userQuestionMessage: message.content,
            chatSessionBranchId: message.chatSessionBranchId || message.id,
          };
          return userMessage;
        }

        if (message.role === 'ASSISTANT' && message.aiChatRes) {
          const parsedAiChatRes = parseAiChatApiRes(message.aiChatRes);

          if (parsedAiChatRes) {
            const assistantMessage: AiPreviousMessage = {
              role: 'assistant',
              aiChatRes: parsedAiChatRes,
              chatSessionBranchId: message.chatSessionBranchId,
            };
            return assistantMessage;
          }

          this.logger.warn(`aiChatRes 파싱 실패 - messageId: ${message.id}, chatId: ${chatId}`);
        }

        const userMessage: UserPreviousMessage = {
          role: 'user',
          userQuestionMessage: message.content,
          chatSessionBranchId: message.chatSessionBranchId || message.id,
        };
        return userMessage;
      });

      this.logger.log(`멀티턴 메시지 로드 완료 - 총 ${chatHistory.length}개 메시지`);
      return chatHistory;
    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`멀티턴 메시지 로드 실패: ${safeError.message}`, safeError.details);
      throw new Error(`멀티턴 메시지 로드 실패: ${safeError.message}`);
    }
  }

  async loadUserAiChatHistory(
    chatId: string,
    userId: string,
    chatSessionId?: string,
  ): Promise<previousMessagesContent[] | null> {
    try {
      this.logger.log(`채팅 히스토리 로드 시작 - chatId: ${chatId}, userId: ${userId}`);

      const chat = await this.prisma.chat.findFirst({
        where: {
          id: chatId,
          userId: userId,
        },
      });

      if (!chat) {
        this.logger.warn(`채팅을 찾을 수 없거나 권한이 없음 - chatId: ${chatId}, userId: ${userId}`);
        return null;
      }

      const messagesFromLineage = await this.branchService.getMessagesFromActiveBranchLineage(
        chatId,
        chatSessionId,
      );

      if (messagesFromLineage.length === 0) {
        this.logger.log(`채팅 히스토리가 비어있음 - chatId: ${chatId}`);
        return [];
      }

      const messages = messagesFromLineage
        .filter((msg) => ['USER', 'ASSISTANT'].includes(msg.role))
        .slice(-50);

      let startIndex = 0;
      if (messages.length > 0 && messages[0].role === 'ASSISTANT') {
        startIndex = 1;
      }

      const chatHistory: previousMessagesContent[] = [];

      for (let i = startIndex; i < messages.length; i++) {
        const message = messages[i];

        if (message.role === 'USER') {
          chatHistory.push({
            role: 'user',
            content: message.content,
            chatSessionBranchId: message.chatSessionBranchId || message.id,
          });
        } else if (message.role === 'ASSISTANT') {
          chatHistory.push({
            role: 'assistant',
            content: message.content,
            chatSessionBranchId: message.chatSessionBranchId,
          });
        }
      }

      this.logger.log(`채팅 히스토리 로드 완료 - ${chatHistory.length}개 메시지, 첫 메시지 role: ${chatHistory[0]?.role || 'none'}`);
      return chatHistory;
    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`채팅 히스토리 로드 실패 - chatId: ${chatId}, userId: ${userId}: ${safeError.message}`, safeError.details);
      return null;
    }
  }
}

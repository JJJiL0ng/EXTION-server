import { Injectable } from '@nestjs/common';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import {
  aiChatApiReq,
  aiChatApiRes,
  ChatHistory,
  filteredSheetReturns,
  PreviousChatMessage,
  previousMessagesContent,
} from './types/aiChat.types';
import { TaskManagerOutput } from 'src/v2/ai-agent/types/taskManager.types';
import { AiChatSpreadsheetContextService } from './services/ai-chat-spreadsheet-context.service';
import { AiChatMessageService } from './services/ai-chat-message.service';
import {
  AiChatBranchService,
  RollbackBranchResult,
} from './services/ai-chat-branch.service';

@Injectable()
export class AiChatService {
  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly spreadsheetContextService: AiChatSpreadsheetContextService,
    private readonly messageService: AiChatMessageService,
    private readonly branchService: AiChatBranchService,
  ) {}

  async planTasks(
    aiChatApiReq: aiChatApiReq,
    dataContext: filteredSheetReturns,
    previousMessages: PreviousChatMessage[],
  ) {
    const plan = await this.aiAgentService.runTaskManager(
      aiChatApiReq.userQuestionMessage,
      dataContext,
      previousMessages,
    );

    return { plan };
  }

  async runPlannedTasks(
    aiChatApiReq: aiChatApiReq,
    taskManagerOutput: TaskManagerOutput,
    dataContext: filteredSheetReturns,
    previousMessages: PreviousChatMessage[],
  ) {
    const results = await Promise.all(
      taskManagerOutput.tasks.map((task) => {
        return this.aiAgentService.runSingleTask(
          previousMessages,
          task,
          aiChatApiReq.userQuestionMessage,
          dataContext,
          aiChatApiReq.aiModel,
        );
      }),
    );

    return { results };
  }

  async loadParsedSpreadsheetData(
    spreadsheetId: string,
    parsedSheetNames: string[],
    userId: string,
    spreadSheetVersionId?: string,
  ): Promise<filteredSheetReturns | null> {
    return this.spreadsheetContextService.loadParsedSpreadsheetData(
      spreadsheetId,
      parsedSheetNames,
      userId,
      spreadSheetVersionId,
    );
  }

  async parseNewVersionSpreadSheetData(
    parsedSheetNames: string[],
    newVersionSpreadSheetData: Record<string, any>,
  ): Promise<filteredSheetReturns | null> {
    return this.spreadsheetContextService.parseNewVersionSpreadSheetData(
      parsedSheetNames,
      newVersionSpreadSheetData,
    );
  }

  async saveUserMessage(aiReq: aiChatApiReq): Promise<string> {
    return this.messageService.saveUserMessage(aiReq);
  }

  async saveAssistantMessage(
    chatId: string,
    chatSessionId: string,
    aiChatRes: aiChatApiRes,
    spreadSheetVersionId: string | null,
  ): Promise<string> {
    return this.messageService.saveAssistantMessage(
      chatId,
      chatSessionId,
      aiChatRes,
      spreadSheetVersionId,
    );
  }

  async loadMultiturnMessages(
    chatId: string,
    chatSessionId: string,
  ): Promise<ChatHistory> {
    return this.messageService.loadMultiturnMessages(chatId, chatSessionId);
  }

  async loadUserAiChatHistory(
    chatId: string,
    userId: string,
    chatSessionId?: string,
  ): Promise<previousMessagesContent[] | null> {
    return this.messageService.loadUserAiChatHistory(chatId, userId, chatSessionId);
  }

  async rollPreviousMessage(
    spreadSheetId: string,
    chatSessionId: string,
    chatSessionBranchId: string,
  ): Promise<RollbackBranchResult> {
    return this.branchService.rollPreviousMessage(
      spreadSheetId,
      chatSessionId,
      chatSessionBranchId,
    );
  }
}

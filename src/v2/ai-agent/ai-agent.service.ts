import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { routeAndRunSingleTask } from './task-run-route/routeAndRunSingleTask';
import type { Task, TaskManagerOutput } from './types/taskManager.types';
import type { dataEditChatRes, dataEditCommand } from './types/dataEdit.types';

import { filteredSheetReturns, PreviousChatMessage } from '../ai-chat/ai-chat.service';

import { createTaskManagerRunnable } from './runnables/task_manager/task_manager.runnable';

@Injectable()
export class AiAgentService {
  private readonly geminiSmall: ChatGoogleGenerativeAI; // 2.5 flash lite
  private readonly geminiNormal: ChatGoogleGenerativeAI; // 2.5 flash
  private readonly geminiLarge: ChatGoogleGenerativeAI; // 2.5 pro

  constructor(
    private readonly configService: ConfigService,
    // private readonly cacheService: TableDataCacheService,
  ) {
    // LLM 초기화 - Gemini 2.5 Flash-lite 스트리밍 설정
    this.geminiSmall = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GEMINI_API_KEY'),
      model: 'gemini-2.5-flash-lite',
      temperature: 0.3,
      maxOutputTokens: 8000,
      streaming: false,  // 스트리밍 비활성화
    });

    this.geminiNormal = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GEMINI_API_KEY'),
      model: 'gemini-2.5-flash',
      temperature: 0.3,
      maxOutputTokens: 6000,
      streaming: false, // 스트리밍 비활성화
    });

    this.geminiLarge = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GEMINI_API_KEY'),
      model: 'gemini-2.5-pro',
      temperature: 0.3,
      maxOutputTokens: 8000,
      streaming: false,  // 스트리밍 비활성화
    });
  }

  async runTaskManager(
    question: string,
    dataContext: filteredSheetReturns,
    previousMessages: PreviousChatMessage[]
  ): Promise<TaskManagerOutput> {
    const dataContextString =
      typeof dataContext === 'string'
        ? dataContext
        : JSON.stringify(dataContext ?? {}, null, 2);

    const taskManager = createTaskManagerRunnable(this.geminiSmall);

    // 디버깅을 위해 중간 결과를 확인
    try {
      const result = await taskManager.invoke({ previousMessages, question, dataContext: dataContextString });
      console.log('DEBUG: TaskManager raw result:', JSON.stringify(result, null, 2));
      return result as TaskManagerOutput;
    } catch (error) {
      console.error('DEBUG: TaskManager error:', error);
      console.error('DEBUG: Question:', question);
      console.error('DEBUG: DataContext length:', dataContextString.length);
      throw error;
    }
  }

  async runSingleTask(
    previousMessages: PreviousChatMessage[],
    task: Task,
    question: string,
    dataContext: string | Record<string, unknown>,
    model: 'small' | 'normal' | 'large' = 'normal',
  ): Promise<dataEditCommand> {
    const selected =
      model === 'small'
        ? this.geminiSmall
        : model === 'large'
          ? this.geminiLarge
          : this.geminiNormal;

    return routeAndRunSingleTask({ previousMessages, task, question, dataContext, model: selected });
  }
}

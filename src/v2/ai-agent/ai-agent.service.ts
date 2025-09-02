import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { routeAndRunSingleTask } from './task-run-route/routeAndRunSingleTask';
import type { Task, TaskManagerOutput } from './types/taskManager.types';
import type { dataEditChatRes, dataEditCommand } from './types/dataEdit.types';

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
      streaming: true,  // 스트리밍 활성화
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
    dataContext: string | Record<string, unknown>,
  ): Promise<TaskManagerOutput> {
    const dataContextString =
      typeof dataContext === 'string'
        ? dataContext
        : JSON.stringify(dataContext ?? {}, null, 2);

    const taskManager = createTaskManagerRunnable(this.geminiSmall);
    const result = await taskManager.invoke({ question, dataContext: dataContextString });
    return result as TaskManagerOutput;
  }

  async runSingleTask(
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

    return routeAndRunSingleTask({ task, question, dataContext, model: selected });
  }
}

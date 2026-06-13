import { Injectable, Logger } from '@nestjs/common';

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { routeAndRunSingleTask } from './task-run-route/routeAndRunSingleTask';
import type { Task, TaskManagerOutput } from './types/taskManager.types';
import type { dataEditCommand } from './types/dataEdit.types';

import { filteredSheetReturns, PreviousChatMessage } from '../ai-chat/types/aiChat.types';

import { createTaskManagerRunnable } from './runnables/task_manager/task_manager.runnable';
import { createFileNameMakerRunnable } from './runnables/fileNameMaker/fileNameMaker.runnable';

import { aiModelType } from 'src/v2/ai-chat/types/aiChat.types';
import { LlmModelFactoryService } from './model/llm-model-factory.service';

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);
  private readonly geminiSmall: ChatGoogleGenerativeAI; // 2.5 flash lite
  private readonly geminiNormal: ChatGoogleGenerativeAI; // 2.5 flash
  private readonly geminiLarge: ChatGoogleGenerativeAI; // 2.5 pro
  private readonly ExtionLarge: ChatGoogleGenerativeAI; // extion-1.0-large
  private readonly ExtionMedium: ChatGoogleGenerativeAI; // extion-1.0-medium
  private readonly ExtionSmall: ChatGoogleGenerativeAI; // extion-1.0-small
  private readonly TaskManagerModel: ChatGoogleGenerativeAI; // task manager 전용 모델

  constructor(
    private readonly llmModelFactory: LlmModelFactoryService,
  ) {
    this.geminiSmall = this.llmModelFactory.create('gemini-small');
    this.geminiNormal = this.llmModelFactory.create('gemini-normal');
    this.geminiLarge = this.llmModelFactory.create('gemini-large');
    this.ExtionLarge = this.llmModelFactory.create('extion-large');
    this.ExtionMedium = this.llmModelFactory.create('extion-medium');
    this.ExtionSmall = this.llmModelFactory.create('extion-small');
    this.TaskManagerModel = this.llmModelFactory.create('task-manager');
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

    const taskManager = createTaskManagerRunnable(this.TaskManagerModel);

    try {
      const result = await taskManager.invoke({ question, previousMessages, dataContext: dataContextString });
      this.logger.debug(`TaskManager completed - tasks: ${(result as TaskManagerOutput)?.tasks?.length ?? 0}`);
      return result as TaskManagerOutput;
    } catch (error) {
      this.logger.error(
        `TaskManager failed - questionLength: ${question.length}, dataContextLength: ${dataContextString.length}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async runSingleTask(
    previousMessages: PreviousChatMessage[],
    task: Task,
    question: string,
    dataContext: string | Record<string, unknown>,
    aiModel: aiModelType,
  ): Promise<dataEditCommand> {
    const selected =
      aiModel === 'Extion small' ? this.ExtionSmall :
      aiModel === 'Extion medium' ? this.ExtionMedium :
      aiModel === 'Extion large' ? this.ExtionLarge :
      this.geminiSmall; // 기본값

    return routeAndRunSingleTask({ previousMessages, task, question, dataContext, model: selected });
  }

  async fileNameMaker(dataContext: string | Record<string, unknown>): Promise<string> {
    // dataContext를 문자열로 변환
    const dataContextString =
      typeof dataContext === 'string'
        ? dataContext
        : JSON.stringify(dataContext ?? {}, null, 2);

    // fileNameMaker 러너블 생성
    const fileNameMaker = createFileNameMakerRunnable(this.ExtionSmall);

    try {
      const result = await fileNameMaker.invoke({ dataContext: dataContextString });

      const fileName = typeof result === 'string' ? result : String(result);
      return fileName.trim();
    } catch (error) {
      this.logger.error(
        `FileNameMaker failed - dataContextLength: ${dataContextString.length}`,
        error instanceof Error ? error.stack : undefined,
      );

      // 에러 발생 시 기본 파일명 반환
      return 'Extion-Sheet';
    }
  }
}

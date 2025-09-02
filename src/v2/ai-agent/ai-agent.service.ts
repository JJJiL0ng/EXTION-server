import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { routeAndRunSingleTask } from './task-run-route/routeAndRunSingleTask';
import type { Task, TaskManagerOutput } from './types/taskManager.types';
import type { dataEditChatRes } from './types/dataEdit.types';

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

  async runTaskManager(params: {
    question: string;
    dataContext: string | Record<string, unknown>;
  }): Promise<TaskManagerOutput> {
    const { question } = params;
    const dataContext =
      typeof params.dataContext === 'string'
        ? params.dataContext
        : JSON.stringify(params.dataContext ?? {}, null, 2);

    const taskManager = createTaskManagerRunnable(this.geminiSmall);
    const result = await taskManager.invoke({ question, dataContext });
    return result as TaskManagerOutput;
  }

  /**
   * 단일 task를 받아 해당 taskType에 맞는 러너블을 실행하고 결과를 반환합니다.
   * @param params.task 실행할 Task (data_edit 하위 타입 지원)
   * @param params.question 프롬프트에 주입할 사용자 질문
   * @param params.dataContext 프롬프트에 주입할 데이터 컨텍스트(문자열 또는 객체)
   * @param params.model 선택적 모델 크기: 'small' | 'normal' | 'large' (기본: 'normal')
   */
  async runSingleTask(params: {
    task: Task;
    question: string;
    dataContext: string | Record<string, unknown>;
    model: 'small' | 'normal' | 'large';
  }): Promise<dataEditChatRes> {
    const { task, question, dataContext } = params;
    const which = params.model ?? 'normal';

    const model =
      which === 'small'
        ? this.geminiSmall
        : which === 'large'
        ? this.geminiLarge
        : this.geminiNormal;

    return routeAndRunSingleTask({ task, model, question, dataContext });
  }
}

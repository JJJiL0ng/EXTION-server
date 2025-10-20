import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { routeAndRunSingleTask } from './task-run-route/routeAndRunSingleTask';
import type { Task, TaskManagerOutput } from './types/taskManager.types';
import type { dataEditChatRes, dataEditCommand } from './types/dataEdit.types';

import { filteredSheetReturns, PreviousChatMessage } from '../ai-chat/types/aiChat.types';

import { createTaskManagerRunnable } from './runnables/task_manager/task_manager.runnable';
import { createFileNameMakerRunnable } from './runnables/fileNameMaker/fileNameMaker.runnable';

import { aiModelType } from 'src/v2/ai-chat/types/aiChat.types';

@Injectable()
export class AiAgentService {
  private readonly geminiSmall: ChatGoogleGenerativeAI; // 2.5 flash lite
  private readonly geminiNormal: ChatGoogleGenerativeAI; // 2.5 flash
  private readonly geminiLarge: ChatGoogleGenerativeAI; // 2.5 pro
  private readonly ExtionLarge: ChatGoogleGenerativeAI; // extion-1.0-large
  private readonly ExtionMedium: ChatGoogleGenerativeAI; // extion-1.0-medium
  private readonly ExtionSmall: ChatGoogleGenerativeAI; // extion-1.0-small
  private readonly TaskManagerModel: ChatGoogleGenerativeAI; // task manager 전용 모델

  constructor(
    private readonly configService: ConfigService,
    // private readonly cacheService: TableDataCacheService,
  ) {
    // LLM 초기화 - Gemini 2.5 Flash-lite 스트리밍 설정
    this.geminiSmall = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
      model: 'gemini-2.5-flash-lite',
      temperature: 0.3,
      maxOutputTokens: 8000,
      streaming: false,  // 스트리밍 비활성화
    });

    this.geminiNormal = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
      model: 'gemini-2.5-flash',
      temperature: 0.3,
      maxOutputTokens: 6000,
      streaming: false, // 스트리밍 비활성화
    });

    this.geminiLarge = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
      model: 'gemini-2.5-pro',
      temperature: 0.3,
      maxOutputTokens: 8000,
      streaming: false,  // 스트리밍 비활성화
    });
    //----------------------------------------------------------------
    // LLM 초기화 - Extion 1.0 Large
    //----------------------------------------------------------------
    this.ExtionLarge = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
      model: 'gemini-2.5-flash', 
      temperature: 0.3,
      maxOutputTokens: 8000,
      streaming: false,  // 스트리밍 비활성화
    });
     this.ExtionMedium = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
      model: 'gemini-2.5-flash-lite', 
      temperature: 0.3,
      maxOutputTokens: 8000,
      streaming: false,  // 스트리밍 비활성화
    });
     this.ExtionSmall = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
      model: 'gemini-2.0-flash-lite', 
      temperature: 0.3,
      maxOutputTokens: 8000,
      streaming: false,  // 스트리밍 비활성화
    });
    //----------------------------------------------------------------
    // task manager 전용 튜닝 모델
    //----------------------------------------------------------------
    this.TaskManagerModel = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
      model: 'gemini-2.5-flash-lite',
      temperature: 0.1,
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

    const taskManager = createTaskManagerRunnable(this.TaskManagerModel);

    // 디버깅을 위해 중간 결과를 확인
    try {
      const result = await taskManager.invoke({ question, previousMessages, dataContext: dataContextString });
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
      // 러너블 실행하여 파일명 생성
      const result = await fileNameMaker.invoke({ dataContext: dataContextString });
      console.log('DEBUG: FileNameMaker raw result:', result);
      
      // 결과가 문자열인지 확인하고 반환
      const fileName = typeof result === 'string' ? result : String(result);
      return fileName.trim();
    } catch (error) {
      console.error('DEBUG: FileNameMaker error:', error);
      console.error('DEBUG: DataContext length:', dataContextString.length);
      
      // 에러 발생 시 기본 파일명 반환
      return 'Extion-Sheet';
    }
  }
}

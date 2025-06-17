import { Injectable, Logger } from '@nestjs/common';
import { GeminiApiService } from '../gemini-api/gemini-api.service';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

export enum ChatModule {
  VISUALIZATION = 'visualization-chat',
  GENERATION = 'generate-chat',
  EDIT = 'edit-chat',
  FUNCTION = 'function-chat',
  GENERAL = 'general-chat',
}

interface IntentPrompt {
  system_prompt: string;
}

interface IntentKeywords {
  visualization_keywords: string[];
  generation_keywords: string[];
  edit_keywords: string[];
  function_keywords: string[];
}

@Injectable()
export class AnalyzeUserIntentService {
  private readonly logger = new Logger(AnalyzeUserIntentService.name);
  private readonly intentPrompt: IntentPrompt;
  private readonly intentKeywords: IntentKeywords;

  constructor(private readonly geminiApiService: GeminiApiService) {
    // TODO: 'kr' 부분을 사용자 언어 설정에 따라 동적으로 변경하도록 추후 개선 가능
    const language = 'kr';

    const promptPath = path.join(
      process.cwd(),
      `src/chat-modules/prompts/${language}/system/intent.yml`,
    );
    this.intentPrompt = yaml.load(
      fs.readFileSync(promptPath, 'utf8'),
    ) as IntentPrompt;

    const keywordsPath = path.join(
      process.cwd(),
      `src/chat-modules/prompts/${language}/keywords.yml`,
    );
    this.intentKeywords = yaml.load(
      fs.readFileSync(keywordsPath, 'utf8'),
    ) as IntentKeywords;
  }

  /**
   * 사용자 메시지를 분석하여 적절한 채팅 모듈을 결정합니다.
   * @param message 사용자 입력 메시지
   * @returns 분석된 채팅 모듈 (ChatModule)
   */
  public async analyze(message: string): Promise<ChatModule> {
    this.logger.log(`사용자 의도 분석 시작: "${message}"`);
    const lowerMessage = message.toLowerCase();

    // 키워드 기반으로 사용자 의도 분석
    switch (true) {
      // 시각화 (Artifact) 관련 키워드
      case this.hasKeywords(lowerMessage, this.intentKeywords.visualization_keywords):
        this.logger.log('의도 분석 결과: Visualization Chat');
        return ChatModule.VISUALIZATION;

      // 데이터 생성 (Data Generation) 관련 키워드
      case this.hasKeywords(lowerMessage, this.intentKeywords.generation_keywords):
        this.logger.log('의도 분석 결과: Generation Chat');
        return ChatModule.GENERATION;
        
      // 데이터 수정 (Data Fix) 관련 키워드
      case this.hasKeywords(lowerMessage, this.intentKeywords.edit_keywords):
        this.logger.log('의도 분석 결과: Edit Chat');
        return ChatModule.EDIT;

      // 함수/계산 (Function) 관련 키워드
      case this.hasKeywords(lowerMessage, this.intentKeywords.function_keywords):
        this.logger.log('의도 분석 결과: Function Chat');
        return ChatModule.FUNCTION;

      // 그 외에는 Gemini를 통해 의도 분석
      default:
        this.logger.log('키워드 매칭 실패, Gemini로 의도 분석 시도');

        // TODO: 향후 다국어 지원 시 이 부분을 언어 설정에 따라 동적으로 변경해야 합니다.
        const userMessagePrefix = '사용자 메시지:';
        const fullPrompt = `${this.intentPrompt.system_prompt}\n\n${userMessagePrefix} "${message}"`;

        const intent = await this.geminiApiService.generateContent(
          fullPrompt,
        );
        return this.mapIntentToChatModule(intent);
    }
  }

  /**
   * 메시지에 특정 키워드 목록 중 하나라도 포함되어 있는지 확인합니다.
   * @param message 확인할 메시지 (소문자)
   * @param keywords 키워드 배열
   * @returns 포함 여부 (boolean)
   */
  private hasKeywords(message: string, keywords: string[]): boolean {
    return keywords.some(keyword => message.includes(keyword));
  }

  private mapIntentToChatModule(intent: string): ChatModule {
    this.logger.log(`Gemini 의도 분석 결과: ${intent}`);
    switch (intent) {
      case 'visualization':
        return ChatModule.VISUALIZATION;
      case 'generation':
        return ChatModule.GENERATION;
      case 'function':
        return ChatModule.FUNCTION;
      case 'edit':
        return ChatModule.EDIT;
      case 'general':
      default:
        return ChatModule.GENERAL;
    }
  }
}

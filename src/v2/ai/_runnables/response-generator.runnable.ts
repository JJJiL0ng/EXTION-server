// src/v2/ai/runnables/response-generator.runnable.ts

import { Runnable } from '@langchain/core/runnables';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChainState, StreamUpdate, IntentType } from '../_types/chain.types';
import { Logger } from '@nestjs/common';
import { 
  BaseAiRequestResult, 
  ExcelFormulaResult, 
  PythonCodeGeneratorResult, 
  WholeDataResult, 
  GeneralHelpResult 
} from '../_types/ai-request-result.types';

/**
 * 선택된 프롬프트를 사용하여 최종 응답을 생성하는 Runnable
 */
export class ResponseGeneratorRunnable extends Runnable<ChainState, ChainState> {
lc_namespace: string[] = ['extion', 'runnables', 'response_generator'];
  private readonly logger = new Logger(ResponseGeneratorRunnable.name);
  private readonly llm: ChatAnthropic;
  private readonly outputParser: StringOutputParser;
  private streamCallback?: (update: StreamUpdate) => void;

  constructor(llm: ChatAnthropic) {
    super();
    this.llm = llm;
    this.outputParser = new StringOutputParser();
  }

  /**
   * 스트리밍 콜백 설정
   */
  setStreamCallback(callback: (update: StreamUpdate) => void): void {
    this.streamCallback = callback;
  }

  /**
   * 최종 응답 생성 실행
   */
  async invoke(input: ChainState): Promise<ChainState> {
    const startTime = Date.now();

    try {
      if (!input.selectedPrompt) {
        throw new Error('No selected prompt found in chain state');
      }

      this.logger.debug(
        `Generating response using prompt: ${input.selectedPrompt.id}`
      );

      // 스트리밍 업데이트: 단계 시작
      this.streamCallback?.({
        type: 'step_start',
        step: 'response_generation',
        timestamp: Date.now(),
        progress: { current: 0, total: 4, message: '응답 생성을 시작합니다...' }
      });

      // 1. 프롬프트 템플릿 생성
      this.streamCallback?.({
        type: 'step_progress',
        step: 'response_generation',
        timestamp: Date.now(),
        progress: { current: 1, total: 4, message: '프롬프트 템플릿을 생성하고 있습니다...' }
      });

      const promptTemplate = ChatPromptTemplate.fromTemplate(input.selectedPrompt.template);

      // 2. LLM 체인 구성
      this.streamCallback?.({
        type: 'step_progress',
        step: 'response_generation',
        timestamp: Date.now(),
        progress: { current: 2, total: 4, message: 'AI 모델 체인을 구성하고 있습니다...' }
      });

      const responseChain = promptTemplate
        .pipe(this.llm)
        .pipe(this.outputParser);

      // 3. 응답 생성
      this.streamCallback?.({
        type: 'step_progress',
        step: 'response_generation',
        timestamp: Date.now(),
        progress: { current: 3, total: 4, message: 'AI 모델이 응답을 생성하고 있습니다...' }
      });

      const llmResponse = await responseChain.invoke(input.selectedPrompt.variables);

      // 4. 응답 후처리
      this.streamCallback?.({
        type: 'step_progress',
        step: 'response_generation',
        timestamp: Date.now(),
        progress: { current: 4, total: 4, message: '응답을 후처리하고 있습니다...' }
      });

      // 4. JSON 파싱 및 타입별 처리
      const parsedResponse = this.parseJsonResponse(llmResponse, input);
      const finalResponse = this.postProcessResponse(llmResponse, input);

      const processingTime = Date.now() - startTime;
      this.logger.debug(
        `Response generated successfully in ${processingTime}ms ` +
        `(${llmResponse.length} characters)`
      );

      // 5. ChainState 업데이트
      const updatedState = {
        ...input,
        llmResponse,
        finalResponse,
        parsedResponse, // 파싱된 타입별 응답 추가
        metadata: {
          ...input.metadata,
          responseTime: input.metadata.responseTime + processingTime,
          processingSteps: [...input.metadata.processingSteps, 'response_generation']
        }
      };

      // 스트리밍 업데이트: 단계 완료
      this.streamCallback?.({
        type: 'step_complete',
        step: 'response_generation',
        timestamp: Date.now(),
        data: updatedState,
        progress: { current: 4, total: 4, message: '응답 생성이 완료되었습니다!' }
      });

      return updatedState;

    } catch (error) {
      this.logger.error(`Response generation failed: ${error.message}`, error.stack);

      // 스트리밍 업데이트: 에러 발생
      this.streamCallback?.({
        type: 'error',
        step: 'response_generation',
        timestamp: Date.now(),
        error: error.message
      });

      // 에러 발생 시 기본 응답 생성
      const fallbackResponse = this.generateFallbackResponse(input, error);

      const fallbackState = {
        ...input,
        llmResponse: fallbackResponse,
        finalResponse: fallbackResponse,
        metadata: {
          ...input.metadata,
          responseTime: input.metadata.responseTime + (Date.now() - startTime),
          processingSteps: [...input.metadata.processingSteps, 'response_generation_failed']
        }
      };

      // 스트리밍 업데이트: 폴백 결과
      this.streamCallback?.({
        type: 'step_complete',
        step: 'response_generation',
        timestamp: Date.now(),
        data: fallbackState,
        progress: { current: 4, total: 4, message: '응답 생성 실패, 기본 응답으로 폴백' }
      });

      return fallbackState;
    }
  }

  /**
   * JSON 응답 파싱 및 타입별 처리
   */
  private parseJsonResponse(response: string, chainState: ChainState): BaseAiRequestResult | undefined {
    try {
      // JSON 블록 추출 (```json...``` 형태)
      const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n\s*```/);
      if (!jsonMatch) {
        this.logger.warn('No JSON block found in response');
        return undefined;
      }

      const jsonString = jsonMatch[1].trim();
      const parsedJson = JSON.parse(jsonString);

      // 의도에 따른 타입 검증 및 변환
      const intent = chainState.analyzedIntent?.intent;
      return this.validateAndTransformResponse(parsedJson, intent);

    } catch (error) {
      this.logger.error(`Failed to parse JSON response: ${error.message}`);
      return undefined;
    }
  }

  /**
   * 의도별 응답 검증 및 변환
   */
  private validateAndTransformResponse(parsedJson: any, intent?: string): BaseAiRequestResult | undefined {
    try {
      // 기본 필드 검증
      if (!parsedJson || typeof parsedJson !== 'object') {
        throw new Error('Invalid JSON structure');
      }

      const baseResult: BaseAiRequestResult = {
        success: parsedJson.success ?? true,
        tokensUsed: parsedJson.tokensUsed ?? 0,
        responseTime: parsedJson.responseTime ?? 0,
        model: parsedJson.model ?? 'claude',
        cached: parsedJson.cached ?? false,
        confidence: parsedJson.confidence ?? 0.9
      };

      // 의도별 타입 변환
      switch (intent) {
        case 'excel_formula':
          if (!parsedJson.formulaDetails) {
            throw new Error('Missing formulaDetails in excel_formula response');
          }
          return {
            ...baseResult,
            formulaDetails: parsedJson.formulaDetails
          } as ExcelFormulaResult;

        case 'python_code_generator':
          if (!parsedJson.codeGenerator) {
            throw new Error('Missing codeGenerator in python_code_generator response');
          }
          return {
            ...baseResult,
            codeGenerator: parsedJson.codeGenerator
          } as PythonCodeGeneratorResult;

        case 'whole_data':
          if (!parsedJson.dataTransformation) {
            throw new Error('Missing dataTransformation in whole_data response');
          }
          return {
            ...baseResult,
            dataTransformation: parsedJson.dataTransformation
          } as WholeDataResult;

        case 'general_help':
          if (!parsedJson.generalHelp) {
            throw new Error('Missing generalHelp in general_help response');
          }
          return {
            ...baseResult,
            generalHelp: parsedJson.generalHelp
          } as GeneralHelpResult;

        default:
          this.logger.warn(`Unknown intent: ${intent}, returning base result`);
          return baseResult;
      }

    } catch (error) {
      this.logger.error(`Failed to validate response for intent ${intent}: ${error.message}`);
      return undefined;
    }
  }

  /**
   * 생성된 응답의 후처리
   */
  private postProcessResponse(response: string, chainState: ChainState): string {
    try {
      // 1. 기본 정리
      let processed = response.trim();

      // 2. 불필요한 마크다운 제거/정리
      processed = processed.replace(/```\n\n```/g, ''); // 빈 코드 블록 제거
      processed = processed.replace(/\n{3,}/g, '\n\n'); // 과도한 줄바꿈 정리

      // 3. 의도별 특별 처리
      if (chainState.analyzedIntent) {
        processed = this.applyIntentSpecificFormatting(processed, chainState.analyzedIntent.intent);
      }

      // 4. 길이 검증 (너무 짧거나 긴 응답 처리)
      if (processed.length < 10) {
        this.logger.warn('Generated response is too short, adding fallback message');
        processed += '\n\n추가적인 도움이 필요하시면 언제든 말씀해 주세요.';
      }

      if (processed.length > 4000) {
        this.logger.warn('Generated response is too long, truncating');
        processed = processed.substring(0, 3900) + '\n\n...(응답이 길어 일부 생략됨)';
      }

      return processed;

    } catch (error) {
      this.logger.error(`Failed to post-process response: ${error.message}`);
      return response; // 원본 응답 반환
    }
  }

  /**
   * 의도별 특별한 포맷팅 적용
   */
  private applyIntentSpecificFormatting(response: string, intent: string): string {
    switch (intent) {
      case 'excel_formula':
        // 공식은 코드 블록으로 감싸기
        return response.replace(/([A-Z]+\([^)]*\))/g, '`$1`');

      case 'calculation':
        // 숫자 결과는 강조 표시
        return response.replace(/(\d+\.?\d*)/g, '**$1**');

      case 'data_analysis':
        // 통계 수치 강조
        return response.replace(/(평균|최대|최소|합계):\s*(\d+\.?\d*)/g, '$1: **$2**');

      default:
        return response;
    }
  }

  /**
   * 에러 발생 시 폴백 응답 생성
   */
  private generateFallbackResponse(chainState: ChainState, error: Error): string {
    const question = chainState.originalInput.question;
    const intent = chainState.analyzedIntent?.intent || 'unknown';

    return `죄송합니다. 요청하신 "${question}"에 대한 응답을 생성하는 중 문제가 발생했습니다.

현재 파악된 의도: ${intent}

다음과 같은 방법으로 다시 시도해보세요:
1. 질문을 더 구체적으로 표현해주세요
2. 단계별로 나누어서 질문해주세요
3. 예시를 포함해서 질문해주세요

기술적 도움이 필요하시면 관리자에게 문의해주세요.`;
  }
}
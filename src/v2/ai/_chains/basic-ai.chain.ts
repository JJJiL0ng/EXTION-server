// src/v2/ai/chains/basic-analysis.chain.ts

import { RunnableSequence } from '@langchain/core/runnables';
// import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChainInput, ChainState, ChainResult, StreamUpdate, StreamResult } from '../_types/chain.types';
import { IntentAnalyzerRunnable } from '../_runnables/intent-analyzer.runnable';
import { PromptSelectorRunnable } from '../_runnables/prompt-selector.runnable';
import { ResponseGeneratorRunnable } from '../_runnables/response-generator.runnable';
import { Logger } from '@nestjs/common';

/**
 * 기본 분석 체인
 * 의도 분석 → 프롬프트 선택 → 응답 생성의 순차적 흐름
 */
export class BasicAiChain {
  private readonly logger = new Logger(BasicAiChain.name);
  private readonly chain: RunnableSequence<ChainInput, ChainState>;
  private readonly llm: ChatGoogleGenerativeAI;

  constructor(llm: ChatGoogleGenerativeAI) {
    this.llm = llm;
    this.chain = this.buildChain(llm);
  }

  /**
   * 체인 구성
   */
  private buildChain(llm: ChatGoogleGenerativeAI): RunnableSequence<ChainInput, ChainState> {
    // 각 단계별 Runnable 생성
    const intentAnalyzer = new IntentAnalyzerRunnable(llm);
    const promptSelector = new PromptSelectorRunnable();
    const responseGenerator = new ResponseGeneratorRunnable(llm);

    // LCEL 체인 구성: 순차적 실행
    return RunnableSequence.from([
      intentAnalyzer,     // 1단계: 의도 분석
      promptSelector,     // 2단계: 프롬프트 선택  
      responseGenerator   // 3단계: 응답 생성
    ]);
  }

  /**
   * 체인 실행
   */
  async invoke(input: ChainInput): Promise<ChainResult> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Starting basic analysis chain for user: ${input.userId}, ` +
        `question: "${input.question.substring(0, 50)}..."`
      );

      // 체인 실행
      const result = await this.chain.invoke(input);

      // 실행 시간 업데이트
      const totalTime = Date.now() - startTime;

      this.logger.log(
        `Basic analysis chain completed successfully in ${totalTime}ms. ` +
        `Steps: ${result.metadata.processingSteps.join(' → ')}`
      );

      return {
        success: true,
        data: result
      };

    } catch (error) {
      const errorTime = Date.now() - startTime;
      this.logger.error(
        `Basic analysis chain failed after ${errorTime}ms: ${error.message}`,
        error.stack
      );

      return {
        success: false,
        data: this.createErrorState(input, error, errorTime),
        error: error.message
      };
    }
  }

  /**
   * 에러 상태 생성
   */
  private createErrorState(
    input: ChainInput, 
    error: Error, 
    responseTime: number
  ): ChainState {
    return {
      originalInput: input,
      analyzedIntent: {
        intent: 'general_help',
        confidence: 0,
        reasoning: 'Chain execution failed'
      },
      finalResponse: `죄송합니다. 요청을 처리하는 중 오류가 발생했습니다: ${error.message}`,
      metadata: {
        cached: false,
        processingSteps: ['chain_failed']
      }
    };
  }
  
  /**
   * 실시간 토큰 스트리밍 실행 - Gemini에서 받은 토큰을 즉시 전달
   */
  async streamWithCallback(
    input: ChainInput,
    onUpdate: (update: StreamUpdate) => void,
    onComplete?: (result: ChainState) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Starting token streaming analysis for user: ${input.userId}, ` +
        `question: "${input.question.substring(0, 50)}..."`
      );

      // 각 Runnable에 스트리밍 콜백 설정
      const intentAnalyzer = new IntentAnalyzerRunnable(this.llm);
      const promptSelector = new PromptSelectorRunnable();
      const responseGenerator = new ResponseGeneratorRunnable(this.llm);

      // 토큰 스트리밍은 responseGenerator에서만 발생
      intentAnalyzer.setStreamCallback(onUpdate);
      promptSelector.setStreamCallback(onUpdate);
      responseGenerator.setStreamCallback(onUpdate);

      // 1단계: 의도 분석 (빠른 처리, 스트리밍 없음)
      let currentState: ChainState = {
        originalInput: input,
        metadata: {
          cached: false,
          processingSteps: []
        }
      };

      currentState = await intentAnalyzer.invoke(input);

      // 2단계: 프롬프트 선택 (빠른 처리, 스트리밍 없음)
      currentState = await promptSelector.invoke(currentState);

      // 3단계: 응답 생성 (실제 토큰 스트리밍 발생)
      currentState = await responseGenerator.invoke(currentState);

      // 실행 시간 업데이트
      const totalTime = Date.now() - startTime;

      // 최종 결과 업데이트
      onUpdate({
        type: 'final_result',
        step: 'chain_execution',
        timestamp: Date.now(),
        data: currentState
      });

      this.logger.log(
        `Token streaming analysis completed successfully in ${totalTime}ms. ` +
        `Steps: ${currentState.metadata.processingSteps.join(' → ')}`
      );

      // 완료 콜백 호출
      onComplete?.(currentState);

    } catch (error) {
      const errorTime = Date.now() - startTime;
      this.logger.error(
        `Token streaming analysis failed after ${errorTime}ms: ${error.message}`,
        error.stack
      );

      // 에러 업데이트 전송
      onUpdate({
        type: 'error',
        step: 'chain_execution',
        timestamp: Date.now(),
        error: error.message
      });

      // 에러 상태로 최종 결과 생성
      const errorState = this.createErrorState(input, error, errorTime);
      onUpdate({
        type: 'final_result',
        step: 'chain_execution',
        timestamp: Date.now(),
        data: errorState,
        error: error.message
      });

      // 에러 콜백 호출
      onError?.(error.message);
    }
  }

  /**
   * 체인 상태 조회 (디버깅용)
   */
  getChainInfo(): {
    steps: string[];
    runnableCount: number;
  } {
    return {
      steps: ['intent_analysis', 'prompt_selection', 'response_generation'],
      runnableCount: 3
    };
  }

  /**
   * 체인 상태 검증 및 복구
   */
  private validateAndRecoverChainState(state: ChainState): ChainState {
    try {
      // 1. 기본 구조 검증
      if (!state.originalInput) {
        throw new Error('Missing original input in chain state');
      }

      // 2. 메타데이터 검증 및 복구
      if (!state.metadata) {
        this.logger.warn('Missing metadata in chain state, creating default');
        state.metadata = {
          cached: false,
          processingSteps: []
        };
      }

      // 3. 의도 분석 결과 검증
      if (state.analyzedIntent && !this.isValidIntent(state.analyzedIntent.intent)) {
        this.logger.warn(`Invalid intent detected: ${state.analyzedIntent.intent}, fallback to general_help`);
        state.analyzedIntent.intent = 'general_help';
      }

      // 4. 응답 길이 검증
      if (state.finalResponse) {
        if (typeof state.finalResponse === 'string' && state.finalResponse.length > 5000) {
          this.logger.warn('Response too long, truncating');
          state.finalResponse = state.finalResponse.substring(0, 4800) + '\n\n...(응답이 길어 일부 생략됨)';
        }
      }

      return state;

    } catch (error) {
      this.logger.error(`Chain state validation failed: ${error.message}`);
      // 최소한의 유효한 상태 반환
      return {
        originalInput: state.originalInput || {} as ChainInput,
        metadata: {
          cached: false,
          processingSteps: ['state_recovery']
        }
      };
    }
  }

  /**
   * 유효한 의도 타입 검증
   */
  private isValidIntent(intent: string): boolean {
    const validIntents = [
      'excel_formula',
      'data_analysis',
      'general_help',
    ];
    return validIntents.includes(intent);
  }

  /**
   * 체인 실행 재시도 메커니즘
   */
  async retryChainExecution(
    input: ChainInput,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<ChainResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`Chain execution attempt ${attempt}/${maxRetries}`);
        
        const result = await this.invoke(input);
        
        if (result.success) {
          this.logger.log(`Chain execution succeeded on attempt ${attempt}`);
          return result;
        }
        
        lastError = new Error(result.error || 'Unknown error');
        
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Chain execution attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          this.logger.log(`Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay *= 2; // Exponential backoff
        }
      }
    }

    // 모든 재시도 실패 시 에러 반환
    this.logger.error(`Chain execution failed after ${maxRetries} attempts`);
    return {
      success: false,
      data: this.createErrorState(input, lastError!, Date.now()),
      error: `Chain execution failed after ${maxRetries} attempts: ${lastError?.message}`
    };
  }
}
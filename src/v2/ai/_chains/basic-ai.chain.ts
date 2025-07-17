// src/v2/ai/chains/basic-analysis.chain.ts

import { RunnableSequence } from '@langchain/core/runnables';
import { ChatAnthropic } from '@langchain/anthropic';
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
  private readonly llm: ChatAnthropic;

  constructor(llm: ChatAnthropic) {
    this.llm = llm;
    this.chain = this.buildChain(llm);
  }

  /**
   * 체인 구성
   */
  private buildChain(llm: ChatAnthropic): RunnableSequence<ChainInput, ChainState> {
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
      result.metadata.responseTime = totalTime;

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
        keywords: [],
        reasoning: 'Chain execution failed'
      },
      finalResponse: `죄송합니다. 요청을 처리하는 중 오류가 발생했습니다: ${error.message}`,
      metadata: {
        tokensUsed: 0,
        responseTime,
        cached: false,
        processingSteps: ['chain_failed']
      }
    };
  }

  /**
   * 체인 스트리밍 실행 - 실시간 진행 상황 업데이트(매인 AI 서비스에서 사용예정 - 실제 서비스에서 사용될 예정)
   */
  async stream(input: ChainInput): Promise<StreamResult> {
    const startTime = Date.now();
    const updates: StreamUpdate[] = [];

    try {
      this.logger.log(
        `Starting streaming basic analysis chain for user: ${input.userId}, ` +
        `question: "${input.question.substring(0, 50)}..."`
      );

      // 스트리밍 업데이트를 수집하는 콜백 함수
      const streamCallback = (update: StreamUpdate) => {
        updates.push(update);
      };

      // 각 Runnable에 스트리밍 콜백 설정
      const intentAnalyzer = new IntentAnalyzerRunnable(this.llm);
      const promptSelector = new PromptSelectorRunnable();
      const responseGenerator = new ResponseGeneratorRunnable(this.llm);

      intentAnalyzer.setStreamCallback(streamCallback);
      promptSelector.setStreamCallback(streamCallback);
      responseGenerator.setStreamCallback(streamCallback);

      // 전체 체인 시작 알림
      const chainStartUpdate: StreamUpdate = {
        type: 'step_start',
        step: 'chain_execution',
        timestamp: Date.now(),
        progress: { current: 0, total: 3, message: '분석 체인을 시작합니다...' }
      };
      updates.push(chainStartUpdate);

      // 1단계: 의도 분석
      let currentState: ChainState = {
        originalInput: input,
        metadata: {
          tokensUsed: 0,
          responseTime: 0,
          cached: false,
          processingSteps: []
        }
      };

      currentState = await intentAnalyzer.invoke(input);

      // 2단계: 프롬프트 선택
      currentState = await promptSelector.invoke(currentState);

      // 3단계: 응답 생성
      currentState = await responseGenerator.invoke(currentState);

      // 실행 시간 업데이트
      const totalTime = Date.now() - startTime;
      currentState.metadata.responseTime = totalTime;

      // 최종 결과 업데이트
      const finalUpdate: StreamUpdate = {
        type: 'final_result',
        step: 'chain_execution',
        timestamp: Date.now(),
        data: currentState,
        progress: { current: 3, total: 3, message: '분석 체인이 완료되었습니다!' }
      };
      updates.push(finalUpdate);

      this.logger.log(
        `Streaming basic analysis chain completed successfully in ${totalTime}ms. ` +
        `Steps: ${currentState.metadata.processingSteps.join(' → ')}`
      );

      // 스트리밍 결과 반환
      return {
        success: true,
        updates: this.createStreamGenerator(updates)
      };

    } catch (error) {
      const errorTime = Date.now() - startTime;
      this.logger.error(
        `Streaming basic analysis chain failed after ${errorTime}ms: ${error.message}`,
        error.stack
      );

      // 에러 업데이트 추가
      const errorUpdate: StreamUpdate = {
        type: 'error',
        step: 'chain_execution',
        timestamp: Date.now(),
        error: error.message
      };
      updates.push(errorUpdate);

      // 에러 상태로 최종 결과 생성
      const errorState = this.createErrorState(input, error, errorTime);
      const finalErrorUpdate: StreamUpdate = {
        type: 'final_result',
        step: 'chain_execution',
        timestamp: Date.now(),
        data: errorState,
        error: error.message
      };
      updates.push(finalErrorUpdate);

      return {
        success: false,
        updates: this.createStreamGenerator(updates),
        error: error.message
      };
    }
  }

  /**
   * 스트리밍 업데이트 제너레이터 생성
   */
  private async* createStreamGenerator(updates: StreamUpdate[]): AsyncIterable<StreamUpdate> {
    for (const update of updates) {
      yield update;
      // 실제 스트리밍 효과를 위한 작은 지연 (선택사항)
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * 실시간 스트리밍 실행 - 콜백 함수로 즉시 업데이트 전송
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
        `Starting real-time streaming analysis for user: ${input.userId}, ` +
        `question: "${input.question.substring(0, 50)}..."`
      );

      // 실시간 스트리밍 콜백 함수
      const streamCallback = (update: StreamUpdate) => {
        onUpdate(update);
      };

      // 각 Runnable에 스트리밍 콜백 설정
      const intentAnalyzer = new IntentAnalyzerRunnable(this.llm);
      const promptSelector = new PromptSelectorRunnable();
      const responseGenerator = new ResponseGeneratorRunnable(this.llm);

      intentAnalyzer.setStreamCallback(streamCallback);
      promptSelector.setStreamCallback(streamCallback);
      responseGenerator.setStreamCallback(streamCallback);

      // 전체 체인 시작 알림
      onUpdate({
        type: 'step_start',
        step: 'chain_execution',
        timestamp: Date.now(),
        progress: { current: 0, total: 3, message: '분석 체인을 시작합니다...' }
      });

      // 1단계: 의도 분석
      let currentState: ChainState = {
        originalInput: input,
        metadata: {
          tokensUsed: 0,
          responseTime: 0,
          cached: false,
          processingSteps: []
        }
      };

      currentState = await intentAnalyzer.invoke(input);

      // 2단계: 프롬프트 선택
      currentState = await promptSelector.invoke(currentState);

      // 3단계: 응답 생성
      currentState = await responseGenerator.invoke(currentState);

      // 실행 시간 업데이트
      const totalTime = Date.now() - startTime;
      currentState.metadata.responseTime = totalTime;

      // 최종 결과 업데이트
      onUpdate({
        type: 'final_result',
        step: 'chain_execution',
        timestamp: Date.now(),
        data: currentState,
        progress: { current: 3, total: 3, message: '분석 체인이 완료되었습니다!' }
      });

      this.logger.log(
        `Real-time streaming analysis completed successfully in ${totalTime}ms. ` +
        `Steps: ${currentState.metadata.processingSteps.join(' → ')}`
      );

      // 완료 콜백 호출
      onComplete?.(currentState);

    } catch (error) {
      const errorTime = Date.now() - startTime;
      this.logger.error(
        `Real-time streaming analysis failed after ${errorTime}ms: ${error.message}`,
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
          tokensUsed: 0,
          responseTime: 0,
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
      if (state.finalResponse && state.finalResponse.length > 5000) {
        this.logger.warn('Response too long, truncating');
        state.finalResponse = state.finalResponse.substring(0, 4800) + '\n\n...(응답이 길어 일부 생략됨)';
      }

      return state;

    } catch (error) {
      this.logger.error(`Chain state validation failed: ${error.message}`);
      // 최소한의 유효한 상태 반환
      return {
        originalInput: state.originalInput || {} as ChainInput,
        metadata: {
          tokensUsed: 0,
          responseTime: 0,
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
      'chart_creation',
      'general_help',
      'calculation',
      'data_formatting'
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
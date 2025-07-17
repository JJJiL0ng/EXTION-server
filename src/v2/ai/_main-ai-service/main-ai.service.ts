// src/v2/ai/ai.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import { TableDataCacheService } from '../../cache/_table-data-cache/table-data-cache.service';
import {
  SpreadSheetStructure,
  AnalysisOptions,
  AIAnalysisResult,
  AIServiceError,
  createSafeError
} from '../../sheet/types/spreadsheet.types';
import { BasicAiChain } from '../_chains/basic-ai.chain';
import { ChainInput, StreamUpdate, StreamResult } from '../_types/chain.types';

@Injectable()
export class MainAiService {
  private readonly logger = new Logger(MainAiService.name);
  private readonly llm: ChatAnthropic;
  private readonly basicAiChain: BasicAiChain;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: TableDataCacheService,
  ) {
    // LLM 초기화
    this.llm = new ChatAnthropic({
      anthropicApiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
      modelName: 'claude-3-sonnet-20240229',
      temperature: 0.7,
      maxTokens: 4000,
    });

    // 기본 AI 체인 초기화
    this.basicAiChain = new BasicAiChain(this.llm);

    this.logger.log('AI Service initialized with LCEL chains');
  }

  /**
   * 스프레드시트 분석 - LCEL 체인 사용
   */
  async analyzeSpreadSheet(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    question: string,
    options: AnalysisOptions = {}
  ): Promise<AIAnalysisResult> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Starting spreadsheet analysis for user: ${userId}, ` +
        `question: "${question.substring(0, 100)}..."`
      );

      // 1. 캐시된 데이터 확인 (기존 로직 유지)
      const cacheResult = await this.getCachedData(userId, spreadSheetData, options);

      // 2. 체인 입력 준비
      const chainInput: ChainInput = {
        userId,
        spreadSheetData,
        question,
        options
      };

      // 3. 기본 AI 체인 실행
      const chainResult = await this.basicAiChain.invoke(chainInput);

      if (!chainResult.success) {
        throw new Error(chainResult.error || 'Chain execution failed');
      }

      const totalTime = Date.now() - startTime;

      this.logger.log(
        `Analysis completed successfully in ${totalTime}ms. ` +
        `Chain steps: ${chainResult.data.metadata.processingSteps.join(' → ')}`
      );

      // 4. 결과 변환
      return this.convertChainResultToAnalysisResult(
        chainResult.data,
        totalTime,
        options,
        cacheResult.cached
      );

    } catch (error) {
      const safeError = createSafeError(error);
      const errorTime = Date.now() - startTime;

      this.logger.error(
        `Spreadsheet analysis failed after ${errorTime}ms: ${safeError.message}`,
        safeError.details
      );

      throw new AIServiceError(
        'Failed to analyze spreadsheet with LCEL chain',
        'anthropic',
        options.model
      );
    }
  }

  /**
   * 스트리밍 스프레드시트 분석 - 실시간 진행 상황 업데이트
   */
  async analyzeSpreadSheetWithStreaming(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    question: string,
    options: AnalysisOptions = {}
  ): Promise<StreamResult> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Starting streaming spreadsheet analysis for user: ${userId}, ` +
        `question: "${question.substring(0, 100)}..."`
      );

      // 1. 캐시된 데이터 확인 (기존 로직 유지)
      const cacheResult = await this.getCachedData(userId, spreadSheetData, options);

      // 2. 체인 입력 준비
      const chainInput: ChainInput = {
        userId,
        spreadSheetData,
        question,
        options
      };

      // 3. 스트리밍 분석 체인 실행
      const streamResult = await this.basicAiChain.stream(chainInput);

      const totalTime = Date.now() - startTime;

      if (streamResult.success) {
        this.logger.log(
          `Streaming analysis setup completed successfully in ${totalTime}ms`
        );
        
        // 스트리밍 업데이트에 캐시 정보 추가
        return {
          ...streamResult,
          updates: this.enrichStreamUpdatesWithCacheInfo(streamResult.updates, cacheResult.cached)
        };
      } else {
        throw new Error(streamResult.error || 'Streaming analysis failed');
      }

    } catch (error) {
      const safeError = createSafeError(error);
      const errorTime = Date.now() - startTime;

      this.logger.error(
        `Streaming spreadsheet analysis failed after ${errorTime}ms: ${safeError.message}`,
        safeError.details
      );

      throw new AIServiceError(
        'Failed to start streaming analysis with LCEL chain',
        'anthropic',
        options.model
      );
    }
  }

  /**
   * 실시간 콜백 스트리밍 분석 - WebSocket, SSE 등에 적합
   */
  async analyzeSpreadSheetWithRealtimeCallback(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    question: string,
    onUpdate: (update: StreamUpdate) => void,
    onComplete?: (result: AIAnalysisResult) => void,
    onError?: (error: string) => void,
    options: AnalysisOptions = {}
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Starting real-time streaming analysis for user: ${userId}, ` +
        `question: "${question.substring(0, 100)}..."`
      );

      // 1. 캐시된 데이터 확인
      const cacheResult = await this.getCachedData(userId, spreadSheetData, options);

      // 2. 체인 입력 준비
      const chainInput: ChainInput = {
        userId,
        spreadSheetData,
        question,
        options
      };

      // 3. 실시간 스트리밍 콜백 실행
      await this.basicAiChain.streamWithCallback(
        chainInput,
        (update: StreamUpdate) => {
          // 업데이트에 캐시 정보 추가
          const enrichedUpdate = this.enrichStreamUpdateWithCacheInfo(update, cacheResult.cached);
          onUpdate(enrichedUpdate);
        },
        (finalChainState) => {
          // 최종 결과를 AIAnalysisResult로 변환
          const totalTime = Date.now() - startTime;
          const analysisResult = this.convertChainResultToAnalysisResult(
            finalChainState,
            totalTime,
            options,
            cacheResult.cached
          );
          
          this.logger.log(
            `Real-time streaming analysis completed successfully in ${totalTime}ms. ` +
            `Chain steps: ${finalChainState.metadata.processingSteps.join(' → ')}`
          );
          
          onComplete?.(analysisResult);
        },
        (error: string) => {
          const errorTime = Date.now() - startTime;
          this.logger.error(
            `Real-time streaming analysis failed after ${errorTime}ms: ${error}`
          );
          onError?.(error);
        }
      );

    } catch (error) {
      const safeError = createSafeError(error);
      const errorTime = Date.now() - startTime;

      this.logger.error(
        `Real-time streaming analysis setup failed after ${errorTime}ms: ${safeError.message}`,
        safeError.details
      );

      onError?.(safeError.message);
    }
  }

  /**
   * 간단한 질의 처리 - 경량화된 체인 사용
   */
  async simpleQuery(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    question: string,
    options: AnalysisOptions = {}
  ): Promise<string> {
    try {
      this.logger.debug(`Processing simple query: "${question.substring(0, 50)}..."`);

      // 간단한 질의는 경량화된 LLM 설정 사용
      const simpleLLM = new ChatAnthropic({
        anthropicApiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
        modelName: 'claude-3-haiku-20240307', // 더 빠른 모델
        temperature: 0.3,
        maxTokens: 1000,
      });

      // 경량 체인 생성 (캐시 가능)
      const simpleChain = new BasicAiChain(simpleLLM);

      const chainInput: ChainInput = {
        userId,
        spreadSheetData,
        question,
        options: {
          ...options,
          maxSheets: 1, // 첫 번째 시트만 사용
          includeFormulas: false,
          includeStyles: false
        }
      };

      const result = await simpleChain.invoke(chainInput);

      if (result.success && result.data.finalResponse) {
        this.logger.debug(
          `Simple query completed in ${result.data.metadata.responseTime}ms`
        );
        return result.data.finalResponse;
      } else {
        throw new Error(result.error || 'Simple query failed');
      }

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Simple query failed: ${safeError.message}`, safeError.details);
      throw new AIServiceError('Failed to process simple query', 'anthropic');
    }
  }

  /**
   * 간단한 질의 스트리밍 처리 - 경량화된 체인 사용
   */
  async simpleQueryWithStreaming(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    question: string,
    onUpdate: (update: StreamUpdate) => void,
    onComplete?: (result: string) => void,
    onError?: (error: string) => void,
    options: AnalysisOptions = {}
  ): Promise<void> {
    try {
      this.logger.debug(`Processing simple streaming query: "${question.substring(0, 50)}..."`);

      // 간단한 질의는 경량화된 LLM 설정 사용
      const simpleLLM = new ChatAnthropic({
        anthropicApiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
        modelName: 'claude-3-haiku-20240307', // 더 빠른 모델
        temperature: 0.3,
        maxTokens: 1000,
      });

      // 경량 체인 생성
      const simpleChain = new BasicAiChain(simpleLLM);

      const chainInput: ChainInput = {
        userId,
        spreadSheetData,
        question,
        options: {
          ...options,
          maxSheets: 1, // 첫 번째 시트만 사용
          includeFormulas: false,
          includeStyles: false
        }
      };

      // 스트리밍 콜백 실행
      await simpleChain.streamWithCallback(
        chainInput,
        (update: StreamUpdate) => {
          onUpdate(update);
        },
        (finalChainState) => {
          if (finalChainState.finalResponse) {
            this.logger.debug(
              `Simple streaming query completed in ${finalChainState.metadata.responseTime}ms`
            );
            onComplete?.(finalChainState.finalResponse);
          } else {
            onError?.('No response generated');
          }
        },
        (error: string) => {
          this.logger.error(`Simple streaming query failed: ${error}`);
          onError?.(error);
        }
      );

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Simple streaming query setup failed: ${safeError.message}`, safeError.details);
      onError?.(safeError.message);
    }
  }

  /**
   * 체인 상태 조회 (개발/디버깅용)
   */
  getChainInfo() {
    return {
      basicAiChain: this.basicAiChain.getChainInfo(),
      llmConfig: {
        model: this.llm.modelName,
        temperature: this.llm.temperature,
        maxTokens: this.llm.maxTokens
      }
    };
  }

  // ==============================================================
  // Private Helper Methods
  // ==============================================================

  /**
   * 캐시된 데이터 조회 (기존 로직 유지)
   */
  private async getCachedData(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    options: AnalysisOptions
  ) {
    const cacheOptions = {
      includeFormulas: options.includeFormulas || false,
      includeStyles: options.includeStyles || false,
      maxSheets: options.maxSheets || 5,
      sheetNames: options.sheetNames
    };

    return await this.cacheService.getGPTReadyData(
      userId,
      spreadSheetData,
      cacheOptions
    );
  }

  /**
   * 체인 결과를 AI 분석 결과로 변환
   */
  private convertChainResultToAnalysisResult(
    chainState: any,
    totalTime: number,
    options: AnalysisOptions,
    cached: boolean
  ): AIAnalysisResult {
    return {
      analysis: chainState.finalResponse || 'No response generated',
      tokensUsed: chainState.metadata.tokensUsed || 0,
      responseTime: totalTime,
      model: options.model || 'claude-3-sonnet-20240229',
      cached,
      // 추가 체인 정보
      chainMetadata: {
        intent: chainState.analyzedIntent?.intent,
        confidence: chainState.analyzedIntent?.confidence,
        processingSteps: chainState.metadata.processingSteps,
        promptId: chainState.selectedPrompt?.id
      }
    };
  }

  /**
   * 스트리밍 업데이트에 캐시 정보 추가
   */
  private enrichStreamUpdateWithCacheInfo(update: StreamUpdate, cached: boolean): StreamUpdate {
    return {
      ...update,
      data: update.data ? {
        ...update.data,
        metadata: {
          ...update.data.metadata,
          cached,
          tokensUsed: update.data.metadata?.tokensUsed || 0,
          responseTime: update.data.metadata?.responseTime || 0,
          processingSteps: update.data.metadata?.processingSteps || []
        }
      } : undefined
    };
  }

  /**
   * 스트리밍 업데이트 AsyncIterable에 캐시 정보 추가
   */
  private async* enrichStreamUpdatesWithCacheInfo(
    updates: AsyncIterable<StreamUpdate>,
    cached: boolean
  ): AsyncIterable<StreamUpdate> {
    for await (const update of updates) {
      yield this.enrichStreamUpdateWithCacheInfo(update, cached);
    }
  }
}
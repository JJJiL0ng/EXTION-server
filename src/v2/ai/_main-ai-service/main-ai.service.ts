// src/v2/ai/ai.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
// import { TableDataCacheService } from '../../cache/_table-data-cache/table-data-cache.service';
import {
  SpreadSheetStructure,
  AnalysisOptions,
  AIServiceError,
  createSafeError
} from '../../sheet/types/spreadsheet.types';
import {
  BaseAiRequestResult,
  ExcelFormulaResult,
  PythonCodeGeneratorResult,
  WholeDataResult,
  GeneralHelpResult
} from '../_types/ai-request-result.types';
import { BasicAiChain } from '../_chains/basic-ai.chain';
import { ChainInput, StreamUpdate, StreamResult } from '../_types/chain.types';

@Injectable()
export class MainAiService {
  private readonly logger = new Logger(MainAiService.name);
  private readonly llm: ChatGoogleGenerativeAI;
  private readonly sllm: ChatGoogleGenerativeAI;
  private readonly basicAiChain: BasicAiChain;

  constructor(
    private readonly configService: ConfigService,
    // private readonly cacheService: TableDataCacheService,
  ) {
    // LLM 초기화 - Gemini 2.5 Flash-lite 스트리밍 설정
    this.llm = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GEMINI_API_KEY'),
      model: 'gemini-2.5-flash',
      temperature: 0.3,
      maxOutputTokens: 8000,
      streaming: true,  // 스트리밍 활성화
    });

    this.sllm = new ChatGoogleGenerativeAI({
      apiKey: this.configService.get<string>('GEMINI_API_KEY'),
      model: 'gemini-2.0-flash',
      temperature: 0.0,
      maxOutputTokens: 2000,
      streaming: true,  // 스트리밍 활성화
    });

    // Claude 설정 (주석 처리)
    // this.llm = new ChatAnthropic({
    //   anthropicApiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    //   modelName: 'claude-3-5-haiku-20241022',
    //   temperature: 0.7,
    //   maxTokens: 4000,
    // });

    // 기본 AI 체인 초기화
    this.basicAiChain = new BasicAiChain(this.llm, this.sllm);

    this.logger.log('AI Service initialized with LCEL chains using Gemini 2.5 Flash');
  }

  /**
   * 스프레드시트 분석 - LCEL 체인 사용 - 기본(레거시)
   */
  // async basicSpreadSheetAiAgent(
  //   userId: string,
  //   spreadSheetData: SpreadSheetStructure,
  //   question: string,
  //   options: AnalysisOptions = {}
  // ): Promise<BaseAiRequestResult> {
  //   const startTime = Date.now();

  //   try {
  //     this.logger.log(
  //       `Starting spreadsheet analysis for user: ${userId}, ` +
  //       `question: "${question.substring(0, 100)}..."`
  //     );

  //     // 1. 캐시된 데이터 확인 (기존 로직 유지)
  //     const cacheResult = await this.getCachedData(userId, spreadSheetData, options);

  //     // 2. 체인 입력 준비
  //     const chainInput: ChainInput = {
  //       userId,
  //       spreadSheetData,
  //       question,
  //       options
  //     };

  //     // 3. 기본 AI 체인 실행
  //     const chainResult = await this.basicAiChain.invoke(chainInput);

  //     if (!chainResult.success) {
  //       throw new Error(chainResult.error || 'Chain execution failed');
  //     }

  //     const totalTime = Date.now() - startTime;

  //     this.logger.log(
  //       `Analysis completed successfully in ${totalTime}ms. ` +
  //       `Chain steps: ${chainResult.data.metadata.processingSteps.join(' → ')}`
  //     );

  //     // 4. 결과 변환
  //     return this.convertChainResultToAiRequestResult(
  //       chainResult.data,
  //       totalTime,
  //       options,
  //       cacheResult.cached
  //     );

  //   } catch (error) {
  //     const safeError = createSafeError(error);
  //     const errorTime = Date.now() - startTime;

  //     this.logger.error(
  //       `Spreadsheet analysis failed after ${errorTime}ms: ${safeError.message}`,
  //       safeError.details
  //     );

  //     throw new AIServiceError(
  //       'Failed to analyze spreadsheet with LCEL chain',
  //       'anthropic',
  //       options.model
  //     );
  //   }
  // }

  /**
   * 실시간 콜백 스트리밍 분석 - 메인 채팅 서비스에서 사용
   */
  async realtimeSpreadSheetAiAgent(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    question: string,
    onUpdate: (update: StreamUpdate) => void,
    onComplete?: (result: BaseAiRequestResult) => void,
    onError?: (error: string) => void,
    options: AnalysisOptions = {}
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Starting real-time streaming analysis for user: ${userId}, ` +
        `question: "${question.substring(0, 100)}..."`
      );

      //현재 캐싱 시트 로직은 비활성화
      // 1. 캐시된 데이터 확인
      // const cacheResult = await this.getCachedData(userId, spreadSheetData, options);

      // 2. 체인 입력 준비
      const chainInput: ChainInput = {
        userId,
        spreadSheetData,
        question,
        options,
      }

      // 3. 실시간 스트리밍 콜백 실행
      await this.basicAiChain.streamWithCallback(
        chainInput,
        (update: StreamUpdate) => {
          // 실시간 업데이트를 즉시 전달
          onUpdate(update);
        },
        (finalChainState) => {
          // 최종 결과를 AIRequestResult로 변환
          const totalTime = Date.now() - startTime;
          const aiRequestResult = this.convertChainResultToAiRequestResult(
            finalChainState,
            totalTime,
            options,
            // cacheResult.cached
            false
          );

          this.logger.log(
            `Real-time streaming analysis completed successfully in ${totalTime}ms. ` +
            `Chain steps: ${finalChainState.metadata.processingSteps.join(' → ')}`
          );

          onComplete?.(aiRequestResult);
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
      const simpleLLM = new ChatGoogleGenerativeAI({
        apiKey: this.configService.get<string>('GEMINI_API_KEY'),
        model: 'gemini-2.5-flash-lite',
        temperature: 0.3,
        maxOutputTokens: 1000,
      });

      // Claude 설정 (주석 처리)
      // const simpleLLM = new ChatAnthropic({
      //   anthropicApiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
      //   modelName: 'claude-3-5-haiku-20241022',
      //   temperature: 0.3,
      //   maxTokens: 1000,
      // });

      // 경량 체인 생성 (캐시 가능)
      const simpleChain = new BasicAiChain(simpleLLM, simpleLLM);

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

        return typeof result.data.finalResponse === 'string'
          ? result.data.finalResponse
          : JSON.stringify(result.data.finalResponse);
      } else {
        throw new Error(result.error || 'Simple query failed');
      }

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Simple query failed: ${safeError.message}`, safeError.details);
      throw new AIServiceError('Failed to process simple query', 'google');
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
      const simpleLLM = new ChatGoogleGenerativeAI({
        apiKey: this.configService.get<string>('GEMINI_API_KEY'),
        model: 'gemini-2.5-flash-lite',
        temperature: 0.3,
        maxOutputTokens: 1000,
      });

      // Claude 설정 (주석 처리)
      // const simpleLLM = new ChatAnthropic({
      //   anthropicApiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
      //   modelName: 'claude-3-5-haiku-20241022',
      //   temperature: 0.3,
      //   maxTokens: 1000,
      // });

      // 경량 체인 생성
      const simpleChain = new BasicAiChain(simpleLLM, simpleLLM);

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
            const response = typeof finalChainState.finalResponse === 'string'
              ? finalChainState.finalResponse
              : JSON.stringify(finalChainState.finalResponse);
            onComplete?.(response);
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
  //사용하지 않는 함수들
  // /**
  //  * Excel 공식 관련 응답 추출
  //  */
  // async getExcelFormulaResponse(
  //   userId: string,
  //   spreadSheetData: SpreadSheetStructure,
  //   question: string,
  //   options: AnalysisOptions = {}
  // ): Promise<ExcelFormulaResult> {
  //   const result = await this.realtimeSpreadSheetAiAgent(userId, spreadSheetData, question, options);

  //   if ('formulaDetails' in result) {
  //     return result as ExcelFormulaResult;
  //   }

  //   throw new AIServiceError('Response is not an Excel formula result', 'anthropic');
  // }

  // /**
  //  * Python 코드 생성 관련 응답 추출
  //  */
  // async getPythonCodeGeneratorResponse(
  //   userId: string,
  //   spreadSheetData: SpreadSheetStructure,
  //   question: string,
  //   options: AnalysisOptions = {}
  // ): Promise<PythonCodeGeneratorResult> {
  //   const result = await this.basicSpreadSheetAiAgent(userId, spreadSheetData, question, options);

  //   if ('codeGenerator' in result) {
  //     return result as PythonCodeGeneratorResult;
  //   }

  //   throw new AIServiceError('Response is not a Python code generator result', 'anthropic');
  // }

  /**
   * 전체 데이터 변환 관련 응답 추출
   */
  async getWholeDataResponse(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    question: string,
    onUpdate: (update: StreamUpdate) => void,
    onComplete?: (result: WholeDataResult) => void,
    onError?: (error: string) => void,
    options: AnalysisOptions = {}
  ): Promise<void> {
    await this.realtimeSpreadSheetAiAgent(
      userId,
      spreadSheetData,
      question,
      onUpdate,
      (result: BaseAiRequestResult) => {
        if ('answerAfterReadWholeData' in result) {
          onComplete?.(result as WholeDataResult);
        } else {
          onError?.('Response is not a whole data result');
        }
      },
      onError,
      options
    );
  }

  // /**
  //  * 일반 도움말 관련 응답 추출
  //  */
  // async getGeneralHelpResponse(
  //   userId: string,
  //   spreadSheetData: SpreadSheetStructure,
  //   question: string,
  //   options: AnalysisOptions = {}
  // ): Promise<GeneralHelpResult> {
  //   const result = await this.basicSpreadSheetAiAgent(userId, spreadSheetData, question, options);

  //   if ('generalHelp' in result) {
  //     return result as GeneralHelpResult;
  //   }

  //   throw new AIServiceError('Response is not a general help result', 'anthropic');
  // }

  /**
   * 체인 상태 조회 (개발/디버깅용)
   */
  getChainInfo() {
    return {
      basicAiChain: this.basicAiChain.getChainInfo(),
      llmConfig: {
        model: 'gemini-2.5-flash-lite',
        temperature: this.llm.temperature,
        maxOutputTokens: 4000
      }
    };
  }

  /**
   * SLLM 인스턴스 반환 - 다른 서비스에서 사용 가능
   */
  getSllm(): ChatGoogleGenerativeAI {
    return this.sllm;
  }  // ==============================================================
  // Private Helper Methods
  // ==============================================================

  /**
   * 캐시된 데이터 조회 (기존 로직 유지)
   */
  //   private async getCachedData(
  //   userId: string,
  //   spreadSheetData: SpreadSheetStructure,
  //   options: AnalysisOptions
  // ) {
  //   try {
  //     if (!userId) {
  //       throw new Error('userId is required for cache operations');
  //     }

  //     if (!spreadSheetData) {
  //       throw new Error('spreadSheetData is required for cache operations');
  //     }

  //     this.logger.debug(`Getting cached data for user: ${userId}, sheet: ${spreadSheetData.id || 'unknown'}`);

  //     const cacheOptions = {
  //       includeFormulas: options.includeFormulas || false,
  //       includeStyles: options.includeStyles || false,
  //       maxSheets: options.maxSheets || 5,
  //       sheetNames: options.sheetNames
  //     };

  //     return await this.cacheService.getGPTReadyData(
  //       userId,
  //       spreadSheetData,
  //       cacheOptions
  //     );
  //   } catch (error) {
  //     const safeError = createSafeError(error);
  //     this.logger.error(`Failed to get cached data: ${safeError.message}`, {
  //       userId,
  //       spreadSheetId: spreadSheetData?.id,
  //       error: safeError.details
  //     });
  //     throw error;
  //   }
  // }

  /**
   * 체인 결과를 AI 요청 결과로 변환
   */
  private convertChainResultToAiRequestResult(
    chainState: any,
    totalTime: number,
    options: AnalysisOptions,
    cached: boolean
  ): BaseAiRequestResult {
    // 파싱된 응답이 있다면 그것을 사용하고, 실제 값으로 메타데이터 업데이트
    if (chainState.parsedResponse) {
      return {
        ...chainState.parsedResponse,
        model: options.model || chainState.parsedResponse.model || 'gemini-2.5-flash-lite',
        cached,
        success: !!chainState.finalResponse
      };
    }

    // 파싱된 응답이 없다면 기본 응답 반환
    return {
      success: !!chainState.finalResponse,
      model: options.model || 'gemini-2.5-flash-lite',
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
          processingSteps: update.data.metadata?.processingSteps || []
        }
      } : undefined
    };
  }

  /**
   * 스트리밍 업데이트 AsyncIterable에 캐시 정보 추가
   */
  private async * enrichStreamUpdatesWithCacheInfo(
    updates: AsyncIterable<StreamUpdate>,
    cached: boolean
  ): AsyncIterable<StreamUpdate> {
    for await (const update of updates) {
      yield this.enrichStreamUpdateWithCacheInfo(update, cached);
    }
  }
}
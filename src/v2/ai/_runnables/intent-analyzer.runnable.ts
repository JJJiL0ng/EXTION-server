// src/v2/ai/runnables/intent-analyzer.runnable.ts

import { Runnable } from '@langchain/core/runnables';
// import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { ChainInput, ChainState, IntentAnalysisResult, StreamUpdate } from '../_types/chain.types';
import { INTENT_ANALYSIS_PROMPT } from '../_prompts/prompt.templates';
import { Logger } from '@nestjs/common';

/**
 * 사용자 의도 분석을 담당하는 Runnable
 * 사용자 질문을 분석하여 적절한 카테고리로 분류
 */
export class IntentAnalyzerRunnable extends Runnable<ChainInput, ChainState> {
lc_namespace: string[] = ['extion', 'intent', 'analyzer'];
  private readonly logger = new Logger(IntentAnalyzerRunnable.name);
  private readonly llm: ChatGoogleGenerativeAI;
  private readonly promptTemplate: ChatPromptTemplate;
  private readonly outputParser: JsonOutputParser;
  private streamCallback?: (update: StreamUpdate) => void;

  constructor(llm: ChatGoogleGenerativeAI) {
    super();
    this.llm = llm;
    this.promptTemplate = ChatPromptTemplate.fromTemplate(INTENT_ANALYSIS_PROMPT);
    this.outputParser = new JsonOutputParser();
  }

  /**
   * 스트리밍 콜백 설정
   */
  setStreamCallback(callback: (update: StreamUpdate) => void): void {
    this.streamCallback = callback;
  }

  /**
   * 의도 분석 실행
   */
  async invoke(input: ChainInput): Promise<ChainState> {
    const startTime = Date.now();
    
    try {
      this.logger.debug(`Analyzing intent for question: ${input.question.substring(0, 100)}...`);

      
      const dataContext = this.buildDataContext(input.spreadSheetData);

      const promptVariables = {
        question: input.question,
        sheetCount: input.spreadSheetData.sheets ? Object.keys(input.spreadSheetData.sheets).length : 0,
        totalCells: this.calculateTotalCells(input.spreadSheetData),
        dataPreview: dataContext.preview
      };

      // 스트리밍 업데이트: 의도 분석 시작
      this.streamCallback?.({
        type: 'step_start',
        step: 'intent_analysis',
        timestamp: Date.now()
      });

      const intentChain = this.promptTemplate
        .pipe(this.llm)
        .pipe(this.outputParser);

      // Debug: 프롬프트 확인
      const debugPrompt = await this.promptTemplate.format(promptVariables);
      this.logger.debug(`Final prompt preview: ${debugPrompt.substring(0, 500)}...`);
      
      // 스트리밍 모드로 의도 분석 실행
      let accumulatedText = '';
      let finalReasoningText = '';
      
      const stream = await this.llm.stream(await this.promptTemplate.format(promptVariables));
      
      for await (const chunk of stream) {
        const content = chunk.content;
        if (typeof content === 'string') {
          accumulatedText += content;
        }
      }
      
      // 최종 JSON 파싱
      const result = await this.outputParser.parse(accumulatedText);
      
      // 완성된 reasoning 텍스트 추출
      if (result && result.reasoning) {
        finalReasoningText = result.reasoning;
        
        // 완성된 reasoning 텍스트를 한번에 SSE로 전송
        this.streamCallback?.({
          type: 'reasoning_preview',
          step: 'intent_analysis',
          timestamp: Date.now(),
          reasoning: finalReasoningText
        });
        
        this.logger.debug(`Complete reasoning text extracted: ${finalReasoningText}`);
      }
      
      // Debug: LLM 결과 확인
      this.logger.debug(`LLM raw result: ${JSON.stringify(result)}`);

      const analyzedIntent = this.validateAndParseResult(result);

      const processingTime = Date.now() - startTime;
      
      // 스트리밍 업데이트: 의도 분석 완료
      this.streamCallback?.({
        type: 'step_complete',
        step: 'intent_analysis',
        timestamp: Date.now(),
        data: { analyzedIntent }
      });

      // ChainState 생성
      const chainState = {
        originalInput: input,
        analyzedIntent,
        metadata: {
          tokensUsed: 0,
          processingSteps: ['intent_analysis']
        }
      };

      return chainState;

    } catch (error) {
      this.logger.error(`Intent analysis failed: ${error.message}`, error.stack);
      
      // 스트리밍 업데이트: 에러 발생
      this.streamCallback?.({
        type: 'error',
        step: 'intent_analysis',
        timestamp: Date.now(),
        error: error.message
      });
      
      // 에러 발생 시 기본값으로 폴백
      const fallbackState = {
        originalInput: input,
        analyzedIntent: {
          intent: 'general_help' as const,
          reasoning: 'Failed to analyze intent, using fallback'
        },
        metadata: {
          tokensUsed: 0,
          processingSteps: ['intent_analysis_failed']
        }
      };

      return fallbackState;
    }
  }

  /**
   * 스프레드시트 데이터를 분석용 컨텍스트로 변환
   */
  private buildDataContext(spreadSheetData: any) {
    try {
      const sheets = spreadSheetData.sheets || {};
      const sheetNames = Object.keys(sheets);
      
      let preview = '';
      if (sheetNames.length > 0) {
        const firstSheet = sheets[sheetNames[0]];
        if (firstSheet?.data?.dataTable) {
          // 첫 번째 시트의 처음 몇 행만 미리보기로 생성
          const dataTable = firstSheet.data.dataTable;
          const cells = Object.entries(dataTable).slice(0, 10);
          
          preview = cells.map(([address, cell]: [string, any]) => 
            `${address}: ${cell.value || ''}`
          ).join(', ');
        }
      }

      return {
        sheetCount: sheetNames.length,
        sheetNames,
        preview: preview || 'No data available'
      };
    } catch (error) {
      this.logger.warn(`Failed to build data context: ${error.message}`);
      return {
        sheetCount: 0,
        sheetNames: [],
        preview: 'Data context unavailable'
      };
    }
  }

  /**
   * 총 셀 수 계산
   */
  private calculateTotalCells(spreadSheetData: any): number {
    try {
      const sheets = spreadSheetData.sheets || {};
      let totalCells = 0;

      for (const sheet of Object.values(sheets)) {
        if ((sheet as any)?.data?.dataTable) {
          totalCells += Object.keys((sheet as any).data.dataTable).length;
        }
      }

      return totalCells;
    } catch (error) {
      this.logger.warn(`Failed to calculate total cells: ${error.message}`);
      return 0;
    }
  }

  /**
   * LLM 결과 검증 및 파싱
   */
  private validateAndParseResult(result: any): IntentAnalysisResult {
    try {
      // 기본값 설정
      const defaultResult: IntentAnalysisResult = {
        intent: 'general_help',
        reasoning: 'Default fallback'
      };

      if (!result || typeof result !== 'object') {
        this.logger.warn('Invalid LLM response format, using default');
        return defaultResult;
      }

      // 유효한 의도 타입 목록 - IntentType과 일치해야 함
      const validIntents = [
        'excel_formula',
        'python_code_generator',
        'whole_data',
        'general_help'
      ];

      return {
        intent: validIntents.includes(result.intent) ? result.intent : defaultResult.intent,
        reasoning: typeof result.reasoning === 'string' ? result.reasoning : defaultResult.reasoning
      };

    } catch (error) {
      this.logger.error(`Failed to parse intent analysis result: ${error.message}`);
      return {
        intent: 'general_help',
        reasoning: 'Parsing failed'
      };
    }
  }

}
// src/v2/ai/runnables/prompt-selector.runnable.ts

import { Runnable } from '@langchain/core/runnables';
import { ChainState, SelectedPrompt, StreamUpdate } from '../_types/chain.types';
import { PromptSelector, PromptTemplate } from '../_prompts/prompt.templates';
import { Logger } from '@nestjs/common';

/**
 * 분석된 의도에 따라 적절한 프롬프트를 선택하는 Runnable
 */
export class PromptSelectorRunnable extends Runnable<ChainState, ChainState> {
lc_namespace: string[] = ['extion', 'prompt_selector'];
  private readonly logger = new Logger(PromptSelectorRunnable.name);
  private streamCallback?: (update: StreamUpdate) => void;

  constructor() {
    super();
  }

  /**
   * 스트리밍 콜백 설정
   */
  setStreamCallback(callback: (update: StreamUpdate) => void): void {
    this.streamCallback = callback;
  }

  /**
   * 프롬프트 선택 실행
   */
  async invoke(input: ChainState): Promise<ChainState> {
    const startTime = Date.now();

    try {
      if (!input.analyzedIntent) {
        throw new Error('No analyzed intent found in chain state');
      }

      this.logger.debug(
        `Selecting prompt for intent: ${input.analyzedIntent.intent} ` +
        `(confidence: ${input.analyzedIntent.confidence})`
      );

      const template = PromptSelector.selectByIntent(input.analyzedIntent.intent);

      const variables = this.preparePromptVariables(input, template);

      const selectedPrompt: SelectedPrompt = {
        id: template.id,
        category: template.category,
        template: template.template,
        variables
      };

      const processingTime = Date.now() - startTime;
      this.logger.debug(
        `Prompt selected: ${template.id} in ${processingTime}ms`
      );

      // 4. ChainState 업데이트
      const updatedState = {
        ...input,
        selectedPrompt,
        metadata: {
          ...input.metadata,
          responseTime: input.metadata.responseTime + processingTime,
          processingSteps: [...input.metadata.processingSteps, 'prompt_selection']
        }
      };

      return updatedState;

    } catch (error) {
      this.logger.error(`Prompt selection failed: ${error.message}`, error.stack);

      // 스트리밍 업데이트: 에러 발생
      this.streamCallback?.({
        type: 'error',
        step: 'prompt_selection',
        timestamp: Date.now(),
        error: error.message
      });

      // 에러 발생 시 기본 프롬프트로 폴백
      const fallbackTemplate = PromptSelector.selectByIntent('general_help');
      const fallbackVariables = this.preparePromptVariables(input, fallbackTemplate);

      const fallbackState = {
        ...input,
        selectedPrompt: {
          id: fallbackTemplate.id,
          category: fallbackTemplate.category,
          template: fallbackTemplate.template,
          variables: fallbackVariables
        },
        metadata: {
          ...input.metadata,
          responseTime: input.metadata.responseTime + (Date.now() - startTime),
          processingSteps: [...input.metadata.processingSteps, 'prompt_selection_failed']
        }
      };

      return fallbackState;
    }
  }

  /**
   * 프롬프트 템플릿에 필요한 변수들을 준비
   */
  private preparePromptVariables(chainState: ChainState, template: PromptTemplate): Record<string, any> {
    try {
      const variables: Record<string, any> = {};
      const intent = chainState.analyzedIntent?.intent;

      // 기본 변수들
      variables.question = chainState.originalInput.question;
      
      // Intent에 따라 전체 데이터 또는 요약 데이터 사용
      if (intent === 'excel_formula' || intent === 'python_code_generator' || intent === 'whole_data') {
        this.logger.debug(`Using full data context for intent: ${intent}`);
        variables.dataContext = this.buildFullDataContext(chainState.originalInput.spreadSheetData);
      } else {
        this.logger.debug(`Using summary data context for intent: ${intent}`);
        variables.dataContext = this.buildSummaryDataContext(chainState.originalInput.spreadSheetData);
      }

      // 템플릿별 특수 변수 처리
      for (const varName of template.variables) {
        if (!variables[varName]) {
          variables[varName] = this.getVariableValue(varName, chainState);
        }
      }

      this.logger.debug(`Prepared ${Object.keys(variables).length} prompt variables`);
      return variables;

    } catch (error) {
      this.logger.error(`Failed to prepare prompt variables: ${error.message}`);
      
      // 최소한의 기본 변수라도 제공
      return {
        question: chainState.originalInput.question || 'No question provided',
        dataContext: 'Data context unavailable'
      };
    }
  }

  /**
   * 특정 변수의 값을 가져오기
   */
  private getVariableValue(varName: string, chainState: ChainState): any {
    switch (varName) {
      case 'question':
        return chainState.originalInput.question;

      case 'dataContext':
        const intent = chainState.analyzedIntent?.intent;
        if (intent === 'excel_formula' || intent === 'python_code_generator' || intent === 'whole_data') {
          return this.buildFullDataContext(chainState.originalInput.spreadSheetData);
        } else {
          return this.buildSummaryDataContext(chainState.originalInput.spreadSheetData);
        }

      case 'intent':
        return chainState.analyzedIntent?.intent || 'unknown';

      case 'confidence':
        return chainState.analyzedIntent?.confidence || 0;

      case 'userId':
        return chainState.originalInput.userId;

      default:
        this.logger.warn(`Unknown variable requested: ${varName}`);
        return `[${varName}]`;
    }
  }

  /**
   * 전체 스프레드시트 데이터를 프롬프트용 컨텍스트로 변환 (실제 수정 작업용)
   */
  private buildFullDataContext(spreadSheetData: any): string {
    try {
      if (!spreadSheetData || !spreadSheetData.sheets) {
        return 'No spreadsheet data available';
      }

      this.logger.debug('Building full data context for modification operations');
      
      // 전체 데이터를 JSON 형태로 직렬화하여 반환
      return JSON.stringify(spreadSheetData, null, 2);

    } catch (error) {
      this.logger.error(`Failed to build full data context: ${error.message}`);
      return 'Error building full data context';
    }
  }

  /**
   * 요약된 스프레드시트 데이터를 프롬프트용 컨텍스트로 변환 (일반 도움말용)
   */
  private buildSummaryDataContext(spreadSheetData: any): string {
    try {
      if (!spreadSheetData || !spreadSheetData.sheets) {
        return 'No spreadsheet data available';
      }

      const sheets = spreadSheetData.sheets;
      const sheetNames = Object.keys(sheets);
      
      let context = `스프레드시트 정보:\n`;
      context += `- 시트 수: ${sheetNames.length}개\n`;

      // 각 시트별 기본 정보
      for (const sheetName of sheetNames.slice(0, 3)) { // 최대 3개 시트만
        const sheet = sheets[sheetName];
        if (sheet?.data?.dataTable) {
          const cellCount = Object.keys(sheet.data.dataTable).length;
          context += `- ${sheetName}: ${cellCount}개 셀\n`;

          // 샘플 데이터 (처음 5개 셀만)
          const sampleCells = Object.entries(sheet.data.dataTable)
            .slice(0, 5)
            .map(([address, cell]: [string, any]) => `${address}: ${cell.value || ''}`)
            .join(', ');

          if (sampleCells) {
            context += `  샘플: ${sampleCells}\n`;
          }
        }
      }

      return context;

    } catch (error) {
      this.logger.error(`Failed to build summary data context: ${error.message}`);
      return 'Error building summary data context';
    }
  }
}
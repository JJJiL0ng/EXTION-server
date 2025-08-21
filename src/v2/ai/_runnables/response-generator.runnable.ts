// src/v2/ai/runnables/response-generator.runnable.ts

import { Runnable } from '@langchain/core/runnables';
// import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
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
  private readonly llm: ChatGoogleGenerativeAI;
  private readonly outputParser: StringOutputParser;
  private streamCallback?: (update: StreamUpdate) => void;

  constructor(llm: ChatGoogleGenerativeAI) {
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
   * 최종 응답 생성 실행 - 실시간 토큰 스트리밍
   */
  async invoke(input: ChainState): Promise<ChainState> {
    const startTime = Date.now();

    try {
      if (!input.selectedPrompt) {
        throw new Error('No selected prompt found in chain state');
      }

      this.logger.debug(
        `Starting real-time token streaming for prompt: ${input.selectedPrompt.id}`
      );

      // 스트리밍 업데이트: 응답 생성 시작
      this.streamCallback?.({
        type: 'step_start',
        step: 'response_generation',
        timestamp: Date.now()
      });

      const promptTemplate = ChatPromptTemplate.fromTemplate(input.selectedPrompt.template);
      
      // 실시간 스트리밍 변수들
      let accumulatedResponse = '';
      let tokenCount = 0;
      
      // 프롬프트 준비
      const formattedPrompt = await promptTemplate.format(input.selectedPrompt.variables);
      
      this.logger.debug('Starting Gemini streaming with prompt:', formattedPrompt.substring(0, 100) + '...');
      
      // Gemini 스트리밍 직접 호출
      const stream = await this.llm.stream(formattedPrompt);
      
      let llmResponse = '';
      
      // 스트림에서 각 chunk 처리
      for await (const chunk of stream) {
        const content = chunk.content;
        if (typeof content === 'string' && content.length > 0) {
          tokenCount++;
          accumulatedResponse += content;
          llmResponse += content;
          
          this.logger.debug(`Token ${tokenCount}: "${content}" (Accumulated: ${accumulatedResponse.length} chars)`);
          
          // 각 토큰/chunk를 즉시 전송
          this.streamCallback?.({
            type: 'token_stream',
            step: 'response_generation',
            timestamp: Date.now(),
            token: content,
            partialResponse: accumulatedResponse,
            tokenCount,
            isFinal: false
          });
          
          // 지연 시간 추가 (시각적 효과를 위해)
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      // 최종 토큰 전송
      this.streamCallback?.({
        type: 'token_stream',
        step: 'response_generation',
        timestamp: Date.now(),
        partialResponse: accumulatedResponse,
        tokenCount,
        isFinal: true
      });
      
      this.logger.debug(`Streaming completed: ${tokenCount} tokens, ${llmResponse.length} characters`);

      // JSON 파싱 및 후처리
      const parsedResponse = this.parseJsonResponse(llmResponse, input);
      const finalResponse = this.postProcessResponse(llmResponse, input);

      const processingTime = Date.now() - startTime;
      this.logger.debug(
        `Response generation completed in ${processingTime}ms ` +
        `(${tokenCount} tokens, ${llmResponse.length} characters)`
      );

      // ChainState 업데이트
      const updatedState = {
        ...input,
        llmResponse,
        finalResponse: parsedResponse || finalResponse,
        parsedResponse,
        metadata: {
          ...input.metadata,
          processingSteps: [...input.metadata.processingSteps, 'response_generation']
        }
      };

      // 스트리밍 업데이트: 단계 완료
      this.streamCallback?.({
        type: 'step_complete',
        step: 'response_generation',
        timestamp: Date.now(),
        data: updatedState
      });

      return updatedState;

    } catch (error) {
      this.logger.error(`Token streaming failed: ${error.message}`, error.stack);

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
          processingSteps: [...input.metadata.processingSteps, 'response_generation_failed']
        }
      };

      // 스트리밍 업데이트: 폴백 결과
      this.streamCallback?.({
        type: 'step_complete',
        step: 'response_generation',
        timestamp: Date.now(),
        data: fallbackState
      });

      return fallbackState;
    }
  }

  /**
   * JSON 응답 파싱 및 타입별 처리 - 개선된 버전
   */
  private parseJsonResponse(response: string, chainState: ChainState): BaseAiRequestResult | undefined {
    try {
      // 다양한 JSON 블록 형태를 순차적으로 시도
      let jsonString = this.extractJsonFromResponse(response);
      
      if (!jsonString) {
        this.logger.warn('No JSON found in response, trying alternative parsing');
        return this.tryAlternativeJsonParsing(response, chainState);
      }

      const parsedJson = JSON.parse(jsonString);
      this.logger.debug('Successfully parsed JSON response');

      // 의도에 따른 타입 검증 및 변환 (완화된 검증)
      const intent = chainState.analyzedIntent?.intent;
      return this.validateAndTransformResponse(parsedJson, intent);

    } catch (error) {
      this.logger.error(`Failed to parse JSON response: ${error.message}`);
      return this.tryAlternativeJsonParsing(response, chainState);
    }
  }

  /**
   * 다양한 방법으로 JSON 추출 시도
   */
  private extractJsonFromResponse(response: string): string | null {
    // 방법 1: 표준 ```json...``` 블록
    let match = response.match(/```json\s*\n([\s\S]*?)\n\s*```/);
    if (match && match[1]) {
      return match[1].trim();
    }

    // 방법 2: ```json...``` (개행 없이)
    match = response.match(/```json([\s\S]*?)```/);
    if (match && match[1]) {
      return match[1].trim();
    }

    // 방법 3: 단순 ``` 블록 (JSON으로 시작하는)
    match = response.match(/```\s*\n?\s*\{[\s\S]*?\}\s*\n?```/);
    if (match) {
      return match[0].replace(/```/g, '').trim();
    }

    // 방법 4: 중괄호로 시작하는 JSON 객체 직접 추출
    match = response.match(/\{[\s\S]*\}/);
    if (match) {
      return match[0].trim();
    }

    return null;
  }

  /**
   * 대안 JSON 파싱 방법
   */
  private tryAlternativeJsonParsing(response: string, chainState: ChainState): BaseAiRequestResult | undefined {
    try {
      // 응답에서 주요 정보 추출하여 수동으로 JSON 구조 생성
      const intent = chainState.analyzedIntent?.intent;
      
      if (intent === 'excel_formula') {
        return this.constructExcelFormulaResponse(response);
      } else if (intent === 'python_code_generator') {
        return this.constructPythonCodeResponse(response);
      } else if (intent === 'whole_data') {
        return this.constructWholeDataResponse(response);
      } else {
        return this.constructGeneralHelpResponse(response);
      }
    } catch (error) {
      this.logger.error(`Alternative JSON parsing failed: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Excel Formula 응답 구조 생성
   */
  private constructExcelFormulaResponse(response: string): ExcelFormulaResult {
    return {
      success: true,
      model: 'claude',
      confidence: 0.95,
      analysis: {
        detectedOperation: this.extractValue(response, /작업 유형[:\s]*([^\n]+)/) || '데이터 처리',
        dataRange: this.extractValue(response, /범위[:\s]*([A-Z]+\d+:[A-Z]+\d+)/) || 'A1:D6',
        targetCells: this.extractValue(response, /대상[:\s]*([A-Z]+\d+(?::[A-Z]+\d+)?)/) || 'A1:D6',
        operationType: 'range_operation' as const
      },
      formulaDetails: {
        name: this.extractValue(response, /함수명?[:\s]*([A-Z_]+)/) || 'CustomFunction',
        description: this.extractValue(response, /설명[:\s]*([^\n]+)/) || '사용자 요청에 따른 처리',
        syntax: this.extractValue(response, /문법[:\s]*([^\n]+)/) || '=CustomFunction()',
        parameters: [],
        spreadjsCommand: this.extractCodeBlock(response) || 'worksheet.setValue(0, 0, "처리 완료");'
      },
      implementation: {
        steps: this.extractSteps(response),
        cellLocations: {
          source: 'A1:D6',
          target: 'A1:D6',
          description: '데이터 처리 완료'
        }
      }
    };
  }

  /**
   * 텍스트에서 값 추출
   */
  private extractValue(text: string, regex: RegExp): string | null {
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * 코드 블록 추출
   */
  private extractCodeBlock(text: string): string | null {
    const match = text.match(/```(?:javascript|js)?([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  }

  /**
   * 단계 추출
   */
  private extractSteps(text: string): string[] {
    const steps = text.match(/\d+[.)]\s*([^\n]+)/g);
    return steps ? steps.map(step => step.trim()) : ['데이터 처리', '결과 확인'];
  }

  /**
   * Python 코드 응답 구조 생성
   */
  private constructPythonCodeResponse(response: string): PythonCodeGeneratorResult {
    return {
      success: true,
      model: 'claude',
      confidence: 0.95,
      codeGenerator: {
        pythonCode: this.extractCodeBlock(response) || 'print("데이터 처리 완료")',
        explanation: '사용자 요청에 따른 Python 코드가 생성되었습니다.'
      }
    };
  }

  /**
   * Whole Data 응답 구조 생성
   */
  private constructWholeDataResponse(response: string): WholeDataResult {
    return {
      success: true,
      model: 'claude',
      confidence: 0.95,
      answerAfterReadWholeData: {
        response: '{}' // 실제 변환된 데이터
      }
    };
  }

  /**
   * General Help 응답 구조 생성
   */
  private constructGeneralHelpResponse(response: string): GeneralHelpResult {
    return {
      success: true,
      model: 'claude',
      confidence: 0.95,
      generalHelp: {
        directAnswer: response.split('\n')[0] || '답변을 생성했습니다.',
        additionalResources: []
      }
    };
  }

  /**
   * 의도별 응답 검증 및 변환 - 완화된 검증
   */
  private validateAndTransformResponse(parsedJson: any, intent?: string): BaseAiRequestResult | undefined {
    try {
      // 기본 필드 검증
      if (!parsedJson || typeof parsedJson !== 'object') {
        throw new Error('Invalid JSON structure');
      }

      const baseResult: BaseAiRequestResult = {
        success: parsedJson.success ?? true,
        model: parsedJson.model ?? 'claude',
        confidence: parsedJson.confidence ?? 0.95
      };

      // 의도별 타입 변환 (완화된 검증)
      switch (intent) {
        case 'excel_formula':
          return {
            ...baseResult,
            analysis: parsedJson.analysis || {
              detectedOperation: '데이터 처리',
              dataRange: 'A1:A1',
              targetCells: 'A1:A1',
              operationType: 'range_operation' as const
            },
            formulaDetails: parsedJson.formulaDetails || {
              name: 'CustomFunction',
              description: '사용자 요청 처리',
              syntax: '=CustomFunction()',
              parameters: [],
              spreadjsCommand: 'console.log("처리 완료");'
            },
            implementation: parsedJson.implementation || {
              steps: ['데이터 처리', '결과 확인'],
              cellLocations: {
                source: 'A1:A1',
                target: 'A1:A1',
                description: '처리 완료'
              }
            }
          } as ExcelFormulaResult;

        case 'python_code_generator':
          return {
            ...baseResult,
            codeGenerator: parsedJson.codeGenerator || {
              pythonCode: 'print("처리 완료")',
              explanation: 'Python 코드가 생성되었습니다.'
            }
          } as PythonCodeGeneratorResult;

        case 'whole_data':
          return {
            ...baseResult,
            answerAfterReadWholeData: parsedJson.answerAfterReadWholeData || {
              response: '{}'
            }
          } as WholeDataResult;

        case 'general_help':
          return {
            ...baseResult,
            generalHelp: parsedJson.generalHelp || {
              directAnswer: '답변을 생성했습니다.',
              additionalResources: []
            }
          } as GeneralHelpResult;

        default:
          this.logger.warn(`Unknown intent: ${intent}, returning excel_formula format`);
          // 기본적으로 excel_formula 형태로 반환
          return {
            ...baseResult,
            analysis: {
              detectedOperation: '데이터 처리',
              dataRange: 'A1:A1',
              targetCells: 'A1:A1',
              operationType: 'range_operation' as const
            },
            formulaDetails: {
              name: 'DefaultFunction',
              description: '기본 처리',
              syntax: '=DefaultFunction()',
              parameters: [],
              spreadjsCommand: 'console.log("기본 처리 완료");'
            },
            implementation: {
              steps: ['기본 처리', '완료'],
              cellLocations: {
                source: 'A1:A1',
                target: 'A1:A1',
                description: '기본 처리 완료'
              }
            }
          } as ExcelFormulaResult;
      }

    } catch (error) {
      this.logger.error(`Failed to validate response for intent ${intent}: ${error.message}`);
      // 에러 발생 시에도 기본 구조 반환
      return this.createFallbackExcelResponse(intent);
    }
  }

  /**
   * 폴백 Excel 응답 생성
   */
  private createFallbackExcelResponse(intent: string = 'excel_formula'): ExcelFormulaResult {
    return {
      success: true,
      model: 'claude',
      confidence: 0.95,
      analysis: {
        detectedOperation: '데이터 처리',
        dataRange: 'A1:A1',
        targetCells: 'A1:A1',
        operationType: 'range_operation' as const
      },
      formulaDetails: {
        name: 'FallbackFunction',
        description: '폴백 처리',
        syntax: '=FallbackFunction()',
        parameters: [],
        spreadjsCommand: 'console.log("폴백 처리 완료");'
      },
      implementation: {
        steps: ['폴백 처리', '완료'],
        cellLocations: {
          source: 'A1:A1',
          target: 'A1:A1',
          description: '폴백 처리 완료'
        }
      }
    };
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
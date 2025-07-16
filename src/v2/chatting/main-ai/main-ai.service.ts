// src/v2/ai/ai.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { TableDataCacheService } from '../../cache/table-data-cache/table-data-cache.service';
import {
  SpreadSheetStructure,
  GPTReadyData,
  CacheOptions,
  AnalysisOptions,
  AIAnalysisResult,
  AIServiceError,
  createSafeError
} from '../../sheet/types/spreadsheet.types';

// 함수 정의 타입
interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

// 함수 호출 결과 타입
interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
}

// AI 응답 타입
interface AIResponse {
  content: string;
  functionCalls?: FunctionCall[];
  tokensUsed: number;
  responseTime: number;
  cached: boolean;
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly anthropic: Anthropic;

  // 사용 가능한 함수 정의
  private readonly availableFunctions: FunctionDefinition[] = [
    {
      name: 'calculate_sum',
      description: '지정된 셀 범위의 합계를 계산합니다',
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description: '계산할 셀 범위 (예: A1:B5)'
          },
          sheet: {
            type: 'string',
            description: '시트 이름 (선택사항)'
          }
        },
        required: ['range']
      }
    },
    {
      name: 'calculate_average',
      description: '지정된 셀 범위의 평균을 계산합니다',
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description: '계산할 셀 범위 (예: A1:B5)'
          },
          sheet: {
            type: 'string',
            description: '시트 이름 (선택사항)'
          }
        },
        required: ['range']
      }
    },
    {
      name: 'find_max_value',
      description: '지정된 셀 범위에서 최댓값을 찾습니다',
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description: '검색할 셀 범위 (예: A1:B5)'
          },
          sheet: {
            type: 'string',
            description: '시트 이름 (선택사항)'
          }
        },
        required: ['range']
      }
    },
    {
      name: 'find_min_value',
      description: '지정된 셀 범위에서 최솟값을 찾습니다',
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description: '검색할 셀 범위 (예: A1:B5)'
          },
          sheet: {
            type: 'string',
            description: '시트 이름 (선택사항)'
          }
        },
        required: ['range']
      }
    },
    {
      name: 'count_cells',
      description: '지정된 셀 범위에서 조건에 맞는 셀의 개수를 세습니다',
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description: '검색할 셀 범위 (예: A1:B5)'
          },
          condition: {
            type: 'string',
            description: '조건 (예: >10, =완료, 빈값이아님)'
          },
          sheet: {
            type: 'string',
            description: '시트 이름 (선택사항)'
          }
        },
        required: ['range', 'condition']
      }
    },
    {
      name: 'create_chart',
      description: '데이터를 기반으로 차트를 생성합니다',
      parameters: {
        type: 'object',
        properties: {
          dataRange: {
            type: 'string',
            description: '차트에 사용할 데이터 범위 (예: A1:B10)'
          },
          chartType: {
            type: 'string',
            enum: ['bar', 'line', 'pie', 'scatter'],
            description: '차트 유형'
          },
          title: {
            type: 'string',
            description: '차트 제목'
          },
          sheet: {
            type: 'string',
            description: '시트 이름 (선택사항)'
          }
        },
        required: ['dataRange', 'chartType', 'title']
      }
    },
    {
      name: 'sort_data',
      description: '지정된 범위의 데이터를 정렬합니다',
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description: '정렬할 데이터 범위 (예: A1:C10)'
          },
          column: {
            type: 'string',
            description: '정렬 기준 열 (예: A, B, C)'
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: '정렬 순서 (오름차순/내림차순)'
          },
          sheet: {
            type: 'string',
            description: '시트 이름 (선택사항)'
          }
        },
        required: ['range', 'column', 'order']
      }
    },
    {
      name: 'filter_data',
      description: '조건에 맞는 데이터만 필터링합니다',
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description: '필터링할 데이터 범위 (예: A1:C10)'
          },
          column: {
            type: 'string',
            description: '필터링 기준 열 (예: A, B, C)'
          },
          condition: {
            type: 'string',
            description: '필터링 조건 (예: >100, =완료, 포함:키워드)'
          },
          sheet: {
            type: 'string',
            description: '시트 이름 (선택사항)'
          }
        },
        required: ['range', 'column', 'condition']
      }
    }
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: TableDataCacheService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  /**
   * 스프레드시트 데이터 분석 및 함수 추천
   */
  async analyzeSpreadSheet(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    question: string,
    options: AnalysisOptions = {}
  ): Promise<AIAnalysisResult> {
    const startTime = Date.now();

    try {
      // 1. 캐시된 GPT 데이터 조회
      const cacheOptions: CacheOptions = {
        includeFormulas: options.includeFormulas,
        includeStyles: options.includeStyles,
        maxSheets: options.maxSheets,
        sheetNames: options.sheetNames
      };

      const cacheResult = await this.cacheService.getGPTReadyData(
        userId,
        spreadSheetData,
        cacheOptions
      );

      this.logger.debug(
        `Cache ${cacheResult.cached ? 'hit' : 'miss'} from ${cacheResult.source} ` +
        `in ${cacheResult.timing}ms`
      );

      // 2. 프롬프트 생성
      const prompt = this.buildAnalysisPrompt(cacheResult.data, question, options);

      // 3. Anthropic API 호출
      const response = await this.anthropic.messages.create({
        model: options.model || 'claude-3-sonnet-20240229',
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        tools: this.availableFunctions.map(func => ({
          name: func.name,
          description: func.description,
          input_schema: func.parameters
        }))
      });

      const responseTime = Date.now() - startTime;

      // 4. 응답 처리
      const aiResponse = this.processAnthropicResponse(response);

      return {
        analysis: aiResponse.content,
        // functionCalls: aiResponse.functionCalls,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        responseTime,
        model: options.model || 'claude-3-sonnet-20240229',
        cached: cacheResult.cached
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`AI analysis failed: ${safeError.message}`, safeError.details);
      throw new AIServiceError('Failed to analyze spreadsheet', 'anthropic', options.model);
    }
  }

  /**
   * 간단한 질문 응답 (함수 호출 없이)
   */
  async simpleQuery(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    question: string,
    options: AnalysisOptions = {}
  ): Promise<string> {
    const startTime = Date.now();

    try {
      // 캐시된 데이터 조회
      const cacheResult = await this.cacheService.getGPTReadyData(
        userId,
        spreadSheetData,
        {
          includeFormulas: false,
          includeStyles: false,
          maxSheets: options.maxSheets || 3
        }
      );

      // 간단한 프롬프트 생성
      const prompt = this.buildSimplePrompt(cacheResult.data, question);

      // Anthropic API 호출 (도구 없이)
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307', // 빠른 응답용 모델
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const responseTime = Date.now() - startTime;
      this.logger.debug(`Simple query completed in ${responseTime}ms`);

      // 텍스트 콘텐츠 추출
      const textContent = response.content.find(content => content.type === 'text');
      return textContent?.text || '응답을 생성할 수 없습니다.';

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Simple query failed: ${safeError.message}`, safeError.details);
      throw new AIServiceError('Failed to process simple query', 'anthropic');
    }
  }

  /**
   * 함수 실행 (실제 스프레드시트 조작)
   */
  async executeFunction(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    functionCall: FunctionCall
  ): Promise<any> {
    try {
      this.logger.log(`Executing function: ${functionCall.name} with args:`, functionCall.arguments);

      switch (functionCall.name) {
        case 'calculate_sum':
          return this.calculateSum(spreadSheetData, functionCall.arguments);
        
        case 'calculate_average':
          return this.calculateAverage(spreadSheetData, functionCall.arguments);
        
        case 'find_max_value':
          return this.findMaxValue(spreadSheetData, functionCall.arguments);
        
        case 'find_min_value':
          return this.findMinValue(spreadSheetData, functionCall.arguments);
        
        case 'count_cells':
          return this.countCells(spreadSheetData, functionCall.arguments);
        
        case 'create_chart':
          return this.createChart(spreadSheetData, functionCall.arguments);
        
        case 'sort_data':
          return this.sortData(spreadSheetData, functionCall.arguments);
        
        case 'filter_data':
          return this.filterData(spreadSheetData, functionCall.arguments);
        
        default:
          throw new Error(`Unknown function: ${functionCall.name}`);
      }
    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Function execution failed: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

  // ==============================================================
  // Private Methods
  // ==============================================================

  /**
   * 분석용 프롬프트 생성
   */
  private buildAnalysisPrompt(
    gptData: GPTReadyData,
    question: string,
    options: AnalysisOptions
  ): string {
    let prompt = `다음은 스프레드시트 데이터입니다.\n\n`;

    // 데이터 요약
    prompt += `데이터 요약:\n`;
    prompt += `- 시트 수: ${gptData.sheets.size}개\n`;
    prompt += `- 총 셀 수: ${gptData.totalCells}개\n\n`;

    // 시트별 데이터 (CSV 형태)
    for (const [sheetName, sheetData] of gptData.sheets.entries()) {
      prompt += `=== ${sheetName} 시트 ===\n`;
      prompt += `${sheetData.csvData}\n\n`;
    }

    // 컨텍스트 추가
    if (options.analysisContext) {
      prompt += `추가 컨텍스트: ${options.analysisContext}\n\n`;
    }

    // 함수 사용 안내
    prompt += `사용 가능한 함수들:\n`;
    for (const func of this.availableFunctions) {
      prompt += `- ${func.name}: ${func.description}\n`;
    }
    prompt += `\n`;

    // 질문 및 지시사항
    prompt += `질문: ${question}\n\n`;
    prompt += `위 데이터를 분석하여 질문에 답하고, 필요한 경우 적절한 함수를 호출하세요. `;
    prompt += `분석 결과를 명확하고 간결하게 설명해주세요.`;

    return prompt;
  }

  /**
   * 간단한 프롬프트 생성
   */
  private buildSimplePrompt(gptData: GPTReadyData, question: string): string {
    let prompt = `스프레드시트 데이터:\n\n`;

    // 간단한 데이터 요약만 포함
    prompt += `시트 수: ${gptData.sheets.size}개, 총 셀 수: ${gptData.totalCells}개\n\n`;

    // 첫 번째 시트만 포함 (성능 최적화)
    const firstSheet = gptData.sheets.values().next().value;
    if (firstSheet) {
      prompt += `데이터 미리보기:\n${firstSheet.csvData.split('\n').slice(0, 5).join('\n')}\n\n`;
    }

    prompt += `질문: ${question}\n\n`;
    prompt += `위 데이터를 기반으로 간단히 답변해주세요. (200자 이내)`;

    return prompt;
  }

  /**
   * Anthropic 응답 처리
   */
  private processAnthropicResponse(response: any): AIResponse {
    let content = '';
    const functionCalls: FunctionCall[] = [];

    // 응답 콘텐츠 처리
    for (const contentBlock of response.content) {
      if (contentBlock.type === 'text') {
        content += contentBlock.text;
      } else if (contentBlock.type === 'tool_use') {
        functionCalls.push({
          name: contentBlock.name,
          arguments: contentBlock.input
        });
      }
    }

    return {
      content: content.trim(),
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      responseTime: 0, // 호출자에서 설정
      cached: false // 호출자에서 설정
    };
  }

  // ==============================================================
  // Function Implementations
  // ==============================================================

  private calculateSum(data: SpreadSheetStructure, args: any): any {
    const { range, sheet = 'Sheet1' } = args;
    
    // 범위 파싱 및 셀 값 추출
    const values = this.extractValuesFromRange(data, sheet, range);
    const numericValues = values.filter(v => typeof v === 'number');
    const sum = numericValues.reduce((acc, val) => acc + val, 0);
    
    return {
      function: 'calculate_sum',
      range,
      sheet,
      result: sum,
      cellCount: values.length,
      numericCount: numericValues.length
    };
  }

  private calculateAverage(data: SpreadSheetStructure, args: any): any {
    const { range, sheet = 'Sheet1' } = args;
    
    const values = this.extractValuesFromRange(data, sheet, range);
    const numericValues = values.filter(v => typeof v === 'number');
    const average = numericValues.length > 0 ? 
      numericValues.reduce((acc, val) => acc + val, 0) / numericValues.length : 0;
    
    return {
      function: 'calculate_average',
      range,
      sheet,
      result: average,
      cellCount: values.length,
      numericCount: numericValues.length
    };
  }

  private findMaxValue(data: SpreadSheetStructure, args: any): any {
    const { range, sheet = 'Sheet1' } = args;
    
    const values = this.extractValuesFromRange(data, sheet, range);
    const numericValues = values.filter(v => typeof v === 'number');
    const max = numericValues.length > 0 ? Math.max(...numericValues) : null;
    
    return {
      function: 'find_max_value',
      range,
      sheet,
      result: max,
      cellCount: values.length,
      numericCount: numericValues.length
    };
  }

  private findMinValue(data: SpreadSheetStructure, args: any): any {
    const { range, sheet = 'Sheet1' } = args;
    
    const values = this.extractValuesFromRange(data, sheet, range);
    const numericValues = values.filter(v => typeof v === 'number');
    const min = numericValues.length > 0 ? Math.min(...numericValues) : null;
    
    return {
      function: 'find_min_value',
      range,
      sheet,
      result: min,
      cellCount: values.length,
      numericCount: numericValues.length
    };
  }

  private countCells(data: SpreadSheetStructure, args: any): any {
    const { range, condition, sheet = 'Sheet1' } = args;
    
    const values = this.extractValuesFromRange(data, sheet, range);
    let count = 0;
    
    // 간단한 조건 처리
    for (const value of values) {
      if (this.evaluateCondition(value, condition)) {
        count++;
      }
    }
    
    return {
      function: 'count_cells',
      range,
      sheet,
      condition,
      result: count,
      totalCells: values.length
    };
  }

  private createChart(data: SpreadSheetStructure, args: any): any {
    const { dataRange, chartType, title, sheet = 'Sheet1' } = args;
    
    const values = this.extractValuesFromRange(data, sheet, dataRange);
    
    return {
      function: 'create_chart',
      chartType,
      title,
      dataRange,
      sheet,
      result: {
        message: `${chartType} 차트 '${title}'가 생성되었습니다.`,
        dataPoints: values.length,
        chartConfig: {
          type: chartType,
          title,
          data: values.slice(0, 10) // 미리보기용으로 첫 10개만
        }
      }
    };
  }

  private sortData(data: SpreadSheetStructure, args: any): any {
    const { range, column, order, sheet = 'Sheet1' } = args;
    
    return {
      function: 'sort_data',
      range,
      column,
      order,
      sheet,
      result: {
        message: `${range} 범위의 데이터가 ${column}열 기준으로 ${order === 'asc' ? '오름차순' : '내림차순'} 정렬되었습니다.`,
        sortedBy: column,
        order: order
      }
    };
  }

  private filterData(data: SpreadSheetStructure, args: any): any {
    const { range, column, condition, sheet = 'Sheet1' } = args;
    
    return {
      function: 'filter_data',
      range,
      column,
      condition,
      sheet,
      result: {
        message: `${range} 범위에서 ${column}열의 '${condition}' 조건으로 필터링되었습니다.`,
        filteredBy: column,
        condition: condition
      }
    };
  }

  // ==============================================================
  // Utility Methods
  // ==============================================================

  private extractValuesFromRange(data: SpreadSheetStructure, sheetName: string, range: string): any[] {
    const sheet = data.sheets[sheetName];
    if (!sheet?.data?.dataTable) return [];
    
    const values: any[] = [];
    const dataTable = sheet.data.dataTable;
    
    // 간단한 범위 파싱 (A1:B5 형태)
    const rangeParts = range.split(':');
    if (rangeParts.length === 2) {
      const startCell = rangeParts[0];
      const endCell = rangeParts[1];
      
      // 실제 구현에서는 더 정교한 범위 파싱이 필요
      // 여기서는 간단히 dataTable의 모든 값을 반환
      for (const [cellAddress, cellData] of Object.entries(dataTable)) {
        const value = cellData.value;
        if (value !== undefined && value !== null) {
          values.push(typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : value);
        }
      }
    }
    
    return values;
  }

  private evaluateCondition(value: any, condition: string): boolean {
    // 간단한 조건 평가 (실제로는 더 복잡한 로직 필요)
    if (condition === '빈값이아님') {
      return value !== null && value !== undefined && value !== '';
    }
    
    if (condition.startsWith('>')) {
      const threshold = Number(condition.substring(1));
      return typeof value === 'number' && value > threshold;
    }
    
    if (condition.startsWith('=')) {
      const target = condition.substring(1);
      return value === target;
    }
    
    if (condition.startsWith('포함:')) {
      const keyword = condition.substring(3);
      return typeof value === 'string' && value.includes(keyword);
    }
    
    return false;
  }
}
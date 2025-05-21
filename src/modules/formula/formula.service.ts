import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ProcessFormulaDto } from './dto/process-formula.dto';
import { FormulaResponseDto } from './dto/formula-response.dto';

@Injectable()
export class FormulaService {
  private readonly logger = new Logger(FormulaService.name);
  private readonly openai: OpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not set in environment variables');
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  async generateFormula(processFormulaDto: ProcessFormulaDto): Promise<FormulaResponseDto> {
    try {
      this.logger.log(`함수 생성 요청: ${processFormulaDto.userInput}`);

      // 시트 컨텍스트를 문자열로 변환
      const contextString = this.buildContextString(processFormulaDto);
      
      // GPT에게 보낼 프롬프트 구성
      const systemMessage = this.buildSystemMessage();
      const userMessage = this.buildUserMessage(processFormulaDto.userInput, contextString);

      // OpenAI API 호출
      const gptResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 500,
        temperature: 0.1,
      });

      const gptAnswer = gptResponse.choices[0]?.message?.content;
      
      if (!gptAnswer) {
        throw new Error('GPT에서 응답을 받지 못했습니다.');
      }

      // GPT 응답 파싱
      const parsedResponse = this.parseGptResponse(gptAnswer);
      
      this.logger.log(`함수 생성 완료: ${parsedResponse.formula}`);
      
      return parsedResponse;

    } catch (error) {
      this.logger.error('함수 생성 중 오류 발생:', error);
      
      return {
        success: false,
        error: '함수 생성 중 오류가 발생했습니다. 다시 시도해주세요.',
      };
    }
  }

  private buildContextString(dto: ProcessFormulaDto): string {
    const { sheetContext } = dto;
    
    let context = `시트 이름: ${sheetContext.sheetName}\n\n`;
    context += `헤더 정보:\n`;
    
    sheetContext.headers.forEach(header => {
      context += `- ${header.column}열: ${header.name}`;
      context += `\n`;
    });
    
    context += `\n데이터 범위: ${sheetContext.dataRange.startRow}행부터 ${sheetContext.dataRange.endRow}행까지\n`;
    
    if (sheetContext.sampleData && sheetContext.sampleData.length > 0) {
      context += `\n샘플 데이터:\n`;
      sheetContext.sampleData.slice(0, 3).forEach((row, index) => {
        context += `${index + 1}. ${JSON.stringify(row)}\n`;
      });
    }
    
    return context;
  }

  private buildSystemMessage(): string {
    return `
당신은 hyperformula 함수 전문가입니다. 사용자의 자연어 요청을 분석하여 적절한 hyperformula 함수를 생성해주세요.

규칙:
1. 오직 hyperformula에서 지원하는 함수만 사용하세요.
2. 함수는 반드시 =로 시작해야 합니다.
3. 셀 범위는 제공된 데이터 범위 내에서만 사용하세요.
4. 함수 외에 설명도 함께 제공해주세요.
5. 함수를 넣을 셀 주소는 기존의 셀 밖에 가장 적합할 셀에 넣어주세요.(ex:평균이나 합산의 결과면 해당 열의 마지막 셀에 넣어주세요.)
7. 함수를 넣을 셀 주소는 영어로 작성해주세요.(ex:k1)

응답 형식:
{
  "formula": "생성된 함수 (예: =AVERAGE(B2:B50))",
  "explanation": "함수 설명 (한국어)",
  "cellAddress": "함수를 넣을 셀 주소"
}

지원되는 함수 예시:
- AVERAGE, SUM, COUNT, MAX, MIN
- COUNTIF, SUMIF, AVERAGEIF
- SORT, FILTER (단순한 경우만)
- VLOOKUP, INDEX, MATCH
`;
  }

  private buildUserMessage(userInput: string, context: string): string {
    return `
현재 스프레드시트 정보:
${context}

사용자 요청: "${userInput}"

위 정보를 바탕으로 적절한 스프레드시트 함수를 생성해주세요.
`;
  }

  private parseGptResponse(gptAnswer: string): FormulaResponseDto {
    try {
      // GPT 응답에서 JSON 부분만 추출
      const jsonMatch = gptAnswer.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        // JSON 형식이 아닌 경우, 텍스트에서 함수 추출 시도
        const formulaMatch = gptAnswer.match(/=[\w(),:]+/);
        if (formulaMatch) {
          return {
            success: true,
            formula: formulaMatch[0],
            explanation: {
              korean: '적절한 함수를 생성했습니다.',
            },
            cellAddress: this.suggestCellAddress(),
          };
        }
        
        throw new Error('함수를 찾을 수 없습니다.');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        success: true,
        formula: parsed.formula,
        explanation: {
          korean: parsed.explanation,
        },
        cellAddress: parsed.cellAddress || this.suggestCellAddress(),
        functionType: this.extractFunctionType(parsed.formula),
      };
      
    } catch (error) {
      this.logger.error('GPT 응답 파싱 오류:', error);
      
      // 파싱 실패 시 간단한 함수 추출 시도
      const formulaMatch = gptAnswer.match(/=[\w(),:]+/);
      if (formulaMatch) {
        return {
          success: true,
          formula: formulaMatch[0],
          explanation: {
            korean: '함수를 생성했습니다. 정확성을 확인해주세요.',
          },
          cellAddress: this.suggestCellAddress(),
        };
      }
      
      return {
        success: false,
        error: '응답을 해석할 수 없습니다. 다시 시도해주세요.',
      };
    }
  }

  private extractFunctionType(formula: string): string {
    const matches = formula.match(/=([A-Z]+)/);
    return matches ? matches[1] : 'UNKNOWN';
  }

  private suggestCellAddress(): string {
    // 기본적으로 E1을 제안 (결과 표시용)
    return 'E1';
  }

  // 향후 확장을 위한 메서드들
  async validateFormula(formula: string): Promise<boolean> {
    // TODO: 함수 유효성 검증 로직
    const validPattern = /^=[\w(),:]+$/;
    return validPattern.test(formula);
  }

  private getSupportedFunctions(): string[] {
    return [
      // 기본 수학 함수
      'SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'MEDIAN',
      // 조건부 집계 함수
      'COUNTIF', 'SUMIF', 'AVERAGEIF', 'COUNTIFS', 'SUMIFS', 'AVERAGEIFS',
      // 검색 및 참조 함수
      'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'INDIRECT', 'ADDRESS',
      // 날짜 및 시간 함수
      'TODAY', 'NOW', 'DATE', 'YEAR', 'MONTH', 'DAY', 'EOMONTH',
      // 논리 함수
      'IF', 'AND', 'OR', 'NOT', 'IFERROR', 'IFS',
      // 텍스트 함수
      'CONCATENATE', 'LEFT', 'RIGHT', 'MID', 'FIND', 'SEARCH', 'SUBSTITUTE'
      // HyperFormula에서 지원하지 않는 함수는 제외
      // 'SORT', 'FILTER', 'UNIQUE' 등
    ];
  }
}
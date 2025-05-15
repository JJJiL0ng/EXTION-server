//src/modules/artifact/artifact.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GenerateArtifactDto, ArtifactResponseDto, ArtifactType } from './dto/generate-artifact.dto';

@Injectable()
export class ArtifactService {
  private readonly logger = new Logger(ArtifactService.name);
  private readonly openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async generateArtifact(dto: GenerateArtifactDto): Promise<ArtifactResponseDto> {
    try {
      this.logger.log(`Generating artifact for: ${dto.userInput}`);

      // 입력 검증
      if (!dto.sheetContext || !dto.sheetContext.headers.length) {
        throw new BadRequestException('시트 컨텍스트 정보가 필요합니다.');
      }

      // 아티팩트 타입 결정
      const artifactType = this.determineArtifactType(dto.userInput);

      // 시스템 프롬프트 생성
      const systemPrompt = this.createSystemPrompt(dto.sheetContext, artifactType);

      // 사용자 프롬프트 생성
      const userPrompt = this.createUserPrompt(dto.userInput, dto.sheetContext);

      // OpenAI API 호출
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (!aiResponse) {
        throw new InternalServerErrorException('AI 응답을 받을 수 없습니다.');
      }

      // 응답에서 코드 추출
      const extractedCode = this.extractCodeFromResponse(aiResponse);
      
      if (!extractedCode) {
        throw new InternalServerErrorException('유효한 코드를 생성할 수 없습니다.');
      }

      // 코드 검증
      this.validateGeneratedCode(extractedCode);

      // 설명 추출
      const explanation = this.extractExplanationFromResponse(aiResponse);

      return {
        success: true,
        code: extractedCode,
        type: artifactType,
        explanation: {
          korean: explanation || `${artifactType} 분석이 생성되었습니다.`
        },
        title: this.generateTitle(dto.userInput, artifactType),
        timestamp: new Date()
      };

    } catch (error) {
      this.logger.error('Error generating artifact:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message || '아티팩트 생성 중 오류가 발생했습니다.',
        timestamp: new Date()
      };
    }
  }

  private determineArtifactType(userInput: string): ArtifactType {
    const input = userInput.toLowerCase();
    
    // 차트 관련 키워드
    if (input.includes('차트') || input.includes('그래프') || 
        input.includes('시각화') || input.includes('막대') || 
        input.includes('선') || input.includes('파이') || 
        input.includes('산점도')) {
      return ArtifactType.CHART;
    }
    
    // 테이블 관련 키워드
    if (input.includes('테이블') || input.includes('표') || 
        input.includes('목록') || input.includes('정렬')) {
      return ArtifactType.TABLE;
    }
    
    // 기본값은 분석
    return ArtifactType.ANALYSIS;
  }

  private createSystemPrompt(sheetContext: any, artifactType: ArtifactType): string {
    const headers = sheetContext.headers.map(h => `${h.column}(${h.name})`).join(', ');
    
    return `
당신은 React와 Recharts를 사용하여 데이터 분석 컴포넌트를 생성하는 전문가입니다.

## 중요한 규칙:
1. 반드시 ComponentToRender 함수 컴포넌트를 정의해야 합니다.
2. csvData는 자동으로 주입되므로 import하지 마세요.
3. React hooks (useState, useEffect, useMemo)는 직접 사용 가능합니다.
4. Recharts 컴포넌트들은 직접 사용 가능합니다.
5. Tailwind CSS만 사용하세요.
6. 모든 텍스트는 한국어로 작성하세요.

## 사용 가능한 라이브러리:
- React (모든 hooks 포함)
- Recharts (모든 차트 컴포넌트 포함)
- Tailwind CSS

## CSV 데이터 구조:
- headers: ${headers}
- data: 2차원 배열 (string[][])
- 첫 번째 행은 헤더가 아닌 실제 데이터입니다.

## 예시 코드 구조:
\`\`\`javascript
const ComponentToRender = () => {
  // csvData는 자동으로 사용 가능
  const processedData = csvData.data.map((row, index) => ({
    // 필요한 데이터 변환
  }));
  
  return (
    <div className="w-full">
      {/* 컴포넌트 내용 */}
    </div>
  );
};
\`\`\`

## 요청 타입: ${artifactType}
${artifactType === ArtifactType.CHART ? '- 차트 시각화에 집중하세요.' : ''}
${artifactType === ArtifactType.TABLE ? '- 테이블 형태의 데이터 표시에 집중하세요.' : ''}
${artifactType === ArtifactType.ANALYSIS ? '- 데이터 통계 분석에 집중하세요.' : ''}
`;
  }

  private createUserPrompt(userInput: string, sheetContext: any): string {
    const sampleData = sheetContext.sampleData?.slice(0, 2) || [];
    
    return `
사용자 요청: "${userInput}"

데이터 정보:
- 파일명: ${sheetContext.sheetName}
- 컬럼: ${sheetContext.headers.map(h => h.name).join(', ')}
- 데이터 범위: ${sheetContext.dataRange.startRow}행 ~ ${sheetContext.dataRange.endRow}행
- 샘플 데이터:
${sampleData.map((row, i) => `  행 ${i + 1}: ${JSON.stringify(row)}`).join('\n')}

위 요청을 바탕으로 ComponentToRender 함수를 생성해주세요.
코드만 반환하고, 설명은 마지막에 별도로 추가해주세요.
`;
  }

  private extractCodeFromResponse(response: string): string {
    // 코드 블록에서 코드 추출
    const codeBlockRegex = /```(?:javascript|jsx|js)?\n?([\s\S]*?)\n?```/;
    const match = response.match(codeBlockRegex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // ComponentToRender를 포함한 부분 찾기
    const componentRegex = /const ComponentToRender[\s\S]*?};/;
    const componentMatch = response.match(componentRegex);
    
    if (componentMatch) {
      return componentMatch[0];
    }
    
    return '';
  }

  private extractExplanationFromResponse(response: string): string {
    // 코드 블록 이후의 설명 추출
    const parts = response.split('```');
    if (parts.length > 2) {
      return parts[2].trim();
    }
    
    // 설명: 또는 ## 설명 같은 패턴 찾기
    const explanationRegex = /(?:설명[:：]|## 설명)([\s\S]*?)$/;
    const match = response.match(explanationRegex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    return '';
  }

  private validateGeneratedCode(code: string): void {
    // ComponentToRender가 정의되어 있는지 확인
    if (!code.includes('ComponentToRender')) {
      throw new InternalServerErrorException('ComponentToRender 함수가 정의되지 않았습니다.');
    }
    
    // 기본적인 구문 검사
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    
    if (openBraces !== closeBraces) {
      throw new InternalServerErrorException('코드의 중괄호가 올바르게 닫히지 않았습니다.');
    }
  }

  private generateTitle(userInput: string, artifactType: ArtifactType): string {
    const typeMap = {
      [ArtifactType.CHART]: '차트 분석',
      [ArtifactType.TABLE]: '테이블 분석',
      [ArtifactType.ANALYSIS]: '데이터 분석'
    };
    
    return `${typeMap[artifactType]} - ${userInput.substring(0, 20)}${userInput.length > 20 ? '...' : ''}`;
  }
}
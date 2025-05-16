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

      // 디버깅을 위한 sheetContext 로깅
      this.logger.debug('=== SheetContext Debug Info ===');
      this.logger.debug(`SheetName: ${dto.sheetContext?.sheetName}`);
      this.logger.debug(`Headers: ${JSON.stringify(dto.sheetContext?.headers)}`);
      this.logger.debug(`DataRange: ${JSON.stringify(dto.sheetContext?.dataRange)}`);
      this.logger.debug(`SampleData type: ${typeof dto.sheetContext?.sampleData}`);
      this.logger.debug(`SampleData length: ${dto.sheetContext?.sampleData?.length}`);
      if (dto.sheetContext?.sampleData?.[0]) {
        this.logger.debug(`First sample row type: ${typeof dto.sheetContext.sampleData[0]}`);
        this.logger.debug(`First sample row: ${JSON.stringify(dto.sheetContext.sampleData[0])}`);
      }
      this.logger.debug('=== End SheetContext Debug ===');

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
        model: 'gpt-4o-mini',
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

      const result = {
        success: true,
        code: extractedCode,
        type: artifactType,
        explanation: {
          korean: explanation || `${artifactType} 분석이 생성되었습니다.`
        },
        title: this.generateTitle(dto.userInput, artifactType),
        timestamp: new Date()
      };
      
      // 전체 응답 데이터 로깅 (code 포함)
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 시작 ====================');
      this.logger.log(`성공 여부: ${result.success}`);
      this.logger.log(`타입: ${result.type}`);
      this.logger.log(`제목: ${result.title}`);
      this.logger.log(`설명: ${result.explanation.korean}`);
      this.logger.log(`코드:\n${result.code}`);
      this.logger.log(`타임스탬프: ${result.timestamp}`);
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 끝 ====================');
      
      return result;

    } catch (error) {
      this.logger.error('Error generating artifact:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      const errorResult = {
        success: false,
        error: error.message || '아티팩트 생성 중 오류가 발생했습니다.',
        timestamp: new Date()
      };
      
      this.logger.log('==================== 프론트엔드 전송 오류 응답 시작 ====================');
      this.logger.log(JSON.stringify(errorResult, null, 2));
      this.logger.log('==================== 프론트엔드 전송 오류 응답 끝 ====================');
      
      return errorResult;
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
    const headers = sheetContext.headers.map(h => h.name || h.column);
    
    return `당신은 React와 Recharts를 사용하여 데이터 분석 컴포넌트를 생성하는 전문가입니다.

## 🚨 중요한 규칙 (반드시 준수):
1. **반드시 ComponentToRender 함수 컴포넌트를 정의**해야 합니다.
2. **import 문을 절대 사용하지 마세요** - React, Recharts는 이미 전역으로 주입됩니다.
3. **csvData는 자동으로 사용 가능**하므로 별도 import 불필요합니다.
4. React hooks (useState, useEffect, useMemo)는 직접 사용 가능합니다.
5. Recharts 컴포넌트들은 직접 사용 가능합니다.
6. **Tailwind CSS만 사용**하세요.
7. **모든 텍스트는 한국어**로 작성하세요.
8. **반드시 데이터 검증 로직을 포함**하세요.

## 사용 가능한 라이브러리:
- React (모든 hooks 포함)
- Recharts (BarChart, LineChart, PieChart, XAxis, YAxis, Tooltip, Legend 등)
- Tailwind CSS

## CSV 데이터 구조:
- headers: [${headers.map(h => `"${h}"`).join(', ')}]
- data: string[][] (2차원 배열)
- 각 행은 헤더 순서대로 데이터가 배열되어 있습니다.

## 필수 코드 구조:
\`\`\`javascript
const ComponentToRender = () => {
  // 1. 데이터 검증 (필수)
  if (!csvData || !csvData.data) {
    return <div className="text-center p-4 text-red-500">데이터가 없습니다.</div>;
  }
  
  // 2. 데이터 처리
  const processedData = csvData.data.map((row, index) => ({
    // 필요한 데이터 변환
  }));
  
  // 3. 렌더링
  return (
    <div className="w-full p-4">
      {/* 컴포넌트 내용 */}
    </div>
  );
};
\`\`\`

## 요청 타입: ${artifactType}
${artifactType === ArtifactType.CHART ? '- 차트 시각화에 집중하세요. 적절한 차트 타입(Bar, Line, Pie 등)을 선택하세요.' : ''}
${artifactType === ArtifactType.TABLE ? '- 테이블 형태의 데이터 표시에 집중하세요. 정렬, 검색 기능을 포함하세요.' : ''}
${artifactType === ArtifactType.ANALYSIS ? '- 데이터 통계 분석에 집중하세요. 평균, 합계, 최댓값 등을 계산하세요.' : ''}

## 데이터 접근 예시:
\`\`\`javascript
// 특정 컬럼의 값들
const values = csvData.data.map(row => row[0]); // 첫 번째 컬럼

// 숫자 변환
const numericValue = parseFloat(row[1]) || 0;
const integerValue = parseInt(row[2]) || 0;
\`\`\`

위 규칙을 준수하여 ComponentToRender 함수를 생성해주세요.`;
  }

  private createUserPrompt(userInput: string, sheetContext: any): string {
    // sampleData 안전하게 처리
    const sampleData = sheetContext.sampleData?.slice(0, 3) || [];
    
    // 샘플 데이터를 안전하게 포맷팅
    const formatSampleData = (data: any[]): string => {
      if (!data || data.length === 0) {
        return '**샘플 데이터 없음**';
      }
      
      return data.map((row, i) => {
        // row가 배열인지 확인
        if (Array.isArray(row)) {
          return `**${i + 1}행**: [${row.map(cell => `"${cell}"`).join(', ')}]`;
        } else if (typeof row === 'object' && row !== null) {
          // 객체인 경우 값들을 추출
          const values = Object.values(row);
          return `**${i + 1}행**: [${values.map(cell => `"${cell}"`).join(', ')}]`;
        } else {
          // 다른 타입인 경우 문자열로 변환
          return `**${i + 1}행**: "${row}"`;
        }
      }).join('\n');
    };
    
    // 헤더 정보 안전하게 추출
    const getHeaderNames = (headers: any[]): string => {
      if (!headers || headers.length === 0) {
        return '헤더 정보 없음';
      }
      
      return headers.map(h => {
        if (typeof h === 'string') return h;
        if (h && h.name) return h.name;
        if (h && h.column) return h.column;
        return 'Unknown';
      }).join(', ');
    };
    
    // 데이터 범위 정보 안전하게 추출
    const getDataRange = (dataRange: any): string => {
      if (!dataRange) return '범위 정보 없음';
      
      const startRow = dataRange.startRow || 0;
      const endRow = dataRange.endRow || 0;
      const totalRows = endRow - startRow + 1;
      
      return `${startRow}행 ~ ${endRow}행 (총 ${totalRows}행)`;
    };
    
    return `사용자 요청: "${userInput}"

## 데이터 정보:
- **파일명**: ${sheetContext.sheetName || '파일명 없음'}
- **컬럼**: ${getHeaderNames(sheetContext.headers)}
- **데이터 범위**: ${getDataRange(sheetContext.dataRange)}

## 샘플 데이터:
${formatSampleData(sampleData)}

## 요구사항:
1. 위 데이터를 활용하여 사용자 요청에 맞는 컴포넌트를 생성해주세요.
2. 데이터 타입을 적절히 변환하세요 (문자열 → 숫자 변환 등).
3. 사용자에게 의미 있는 시각화나 분석을 제공해주세요.
4. 에러 처리와 빈 데이터 처리를 포함해주세요.

**ComponentToRender 함수만 반환하고, 별도의 설명은 주석으로 포함해주세요.**`;
  }

  private extractCodeFromResponse(response: string): string {
    // 코드 블록에서 코드 추출
    const codeBlockRegex = /```(?:javascript|jsx|js)?\n?([\s\S]*?)\n?```/;
    const match = response.match(codeBlockRegex);
    
    this.logger.debug(`AI 응답: ${response.substring(0, 100)}...`);
    
    if (match && match[1]) {
      this.logger.debug('코드 블록에서 코드 추출 성공');
      return match[1].trim();
    }
    
    // ComponentToRender를 포함한 부분 찾기
    const componentRegex = /const ComponentToRender[\s\S]*?};/;
    const componentMatch = response.match(componentRegex);
    
    if (componentMatch) {
      this.logger.debug('ComponentToRender 정규식으로 코드 추출 성공');
      return componentMatch[0];
    }
    
    this.logger.warn('응답에서 코드를 추출할 수 없습니다');
    return '';
  }

  private extractExplanationFromResponse(response: string): string {
    // 코드 블록 이후의 설명 추출
    const parts = response.split('```');
    
    this.logger.debug(`설명 추출 시작: parts 길이 ${parts.length}`);
    
    if (parts.length > 2) {
      this.logger.debug('코드 블록 분리 후 설명 추출');
      return parts[2].trim();
    }
    
    // 설명: 또는 ## 설명 같은 패턴 찾기
    const explanationRegex = /(?:설명[:：]|## 설명)([\s\S]*?)$/;
    const match = response.match(explanationRegex);
    
    if (match && match[1]) {
      this.logger.debug('정규식으로 설명 추출 성공');
      return match[1].trim();
    }
    
    this.logger.warn('응답에서 설명을 추출할 수 없습니다');
    return '';
  }

  private validateGeneratedCode(code: string): void {
    this.logger.debug(`코드 검증 시작: 길이 ${code.length}자`);
    
    // ComponentToRender가 정의되어 있는지 확인
    if (!code.includes('ComponentToRender')) {
      this.logger.error('ComponentToRender 함수가 정의되지 않았습니다');
      throw new InternalServerErrorException('ComponentToRender 함수가 정의되지 않았습니다.');
    }
    
    // 기본적인 구문 검사
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    
    this.logger.debug(`중괄호 검증: 열기 ${openBraces}개, 닫기 ${closeBraces}개`);
    
    if (openBraces !== closeBraces) {
      this.logger.error(`중괄호 불일치: 열기 ${openBraces}개, 닫기 ${closeBraces}개`);
      throw new InternalServerErrorException('코드의 중괄호가 올바르게 닫히지 않았습니다.');
    }
    
    this.logger.debug('코드 검증 완료: 유효한 코드');
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
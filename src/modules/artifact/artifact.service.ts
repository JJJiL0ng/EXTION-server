// src/modules/artifact/artifact.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GenerateArtifactDto, ArtifactResponseDto, ArtifactType, ExtendedSheetContext, SheetsData, SheetContext } from './dto/generate-artifact.dto';

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

      // 다중 시트 지원을 위한 컨텍스트 선택
      const sheetContext = this.selectSheetContext(dto);
      
      // 디버깅을 위한 컨텍스트 로깅
      this.logger.debug('=== Sheet Context Debug Info ===');
      this.logger.debug(`Context Type: ${this.getContextType(dto)}`);
      
      if (dto.extendedSheetContext) {
        this.logger.debug(`Extended - SheetName: ${dto.extendedSheetContext.sheetName}`);
        this.logger.debug(`Extended - SheetIndex: ${dto.extendedSheetContext.sheetIndex}`);
        this.logger.debug(`Extended - TotalSheets: ${dto.extendedSheetContext.totalSheets}`);
        this.logger.debug(`Extended - Headers: ${JSON.stringify(dto.extendedSheetContext.headers)}`);
      }
      
      if (dto.sheetsData) {
        this.logger.debug(`SheetsData - TotalSheets: ${dto.sheetsData.sheets.length}`);
        this.logger.debug(`SheetsData - ActiveSheet: ${dto.sheetsData.activeSheet}`);
        dto.sheetsData.sheets.forEach((sheet, index) => {
          this.logger.debug(`Sheet ${index}: ${sheet.name} (${sheet.metadata?.rowCount || 0} rows)`);
        });
      }
      
      this.logger.debug(`Legacy SheetContext: ${JSON.stringify(dto.sheetContext?.sheetName)}`);
      this.logger.debug('=== End Context Debug ===');

      // 입력 검증
      if (!sheetContext) {
        throw new BadRequestException('시트 컨텍스트 정보가 필요합니다.');
      }

      // 아티팩트 타입 결정
      const artifactType = this.determineArtifactType(dto.userInput);

      // 시스템 프롬프트 생성
      const systemPrompt = this.createSystemPrompt(dto, artifactType);

      // 사용자 프롬프트 생성
      const userPrompt = this.createUserPrompt(dto.userInput, dto);

      // OpenAI API 호출
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 4000,
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

  private selectSheetContext(dto: GenerateArtifactDto): ExtendedSheetContext | SheetContext | null {
    // 우선순위: extendedSheetContext > sheetContext > sheetsData의 활성 시트
    if (dto.extendedSheetContext) {
      return dto.extendedSheetContext;
    }
    
    if (dto.sheetContext) {
      return dto.sheetContext;
    }
    
    if (dto.sheetsData && dto.sheetsData.sheets && dto.sheetsData.sheets.length > 0) {
      // 활성 시트 찾기
      const activeSheet = dto.sheetsData.sheets.find(sheet => sheet.name === dto.sheetsData?.activeSheet);
      if (activeSheet) {
        return {
          sheetName: activeSheet.name,
          headers: activeSheet.metadata?.headers?.map((name, index) => ({
            column: String.fromCharCode(65 + index),
            name
          })) || [],
          dataRange: {
            startRow: '2',
            endRow: ((activeSheet.metadata?.rowCount || 0) + 1).toString(),
            startColumn: 'A',
            endColumn: activeSheet.metadata?.headers ? String.fromCharCode(64 + (activeSheet.metadata.headers.length || 0)) : 'A'
          }
        };
      }
    }
    
    return null;
  }

  private getContextType(dto: GenerateArtifactDto): string {
    if (dto.extendedSheetContext) return 'ExtendedSheetContext';
    if (dto.sheetsData) return 'SheetsData';
    if (dto.sheetContext) return 'SheetContext';
    return 'None';
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

  private createSystemPrompt(dto: GenerateArtifactDto, artifactType: ArtifactType): string {
    const isMultiSheet = (dto.extendedSheetContext?.totalSheets || 0) > 1 || (dto.sheetsData?.sheets?.length || 0) > 1;
    const context = this.selectSheetContext(dto);
    const headers = this.extractHeaders(dto);
    
    return `당신은 React와 Recharts를 사용하여 데이터 분석 컴포넌트를 생성하는 전문가입니다.

## 🚨 중요한 규칙 (반드시 준수):
1. **반드시 ComponentToRender 함수 컴포넌트를 정의**해야 합니다.
2. **import 문을 절대 사용하지 마세요** - React, Recharts는 이미 전역으로 주입됩니다.
3. **데이터는 자동으로 사용 가능**하므로 별도 import 불필요합니다.
4. React hooks (useState, useEffect, useMemo)는 직접 사용 가능합니다.
5. Recharts 컴포넌트들은 직접 사용 가능합니다.
6. **JSX 대신 React.createElement를 반드시 사용**하세요.
7. **Tailwind CSS 클래스는 className 속성으로 전달**하세요.
8. **모든 텍스트는 한국어**로 작성하세요.
9. **반드시 데이터 검증 로직을 포함**하세요.

## 사용 가능한 라이브러리:
- React (모든 hooks 포함) - React.createElement 사용
- Recharts (BarChart, LineChart, PieChart, XAxis, YAxis, Tooltip, Legend 등)
- Tailwind CSS (className 속성으로 적용)

## 데이터 접근 방법:
${isMultiSheet ? `
### 다중 시트 환경:
- **xlsxData**: 전체 XLSX 파일 정보 (fileName, sheets, activeSheetIndex)
- **activeSheetData**: 현재 활성 시트 데이터 (headers, data, sheetName)
- **allSheetsData**: 모든 시트 데이터 배열
- **getSheetByName(name)**: 이름으로 시트 찾기
- **getSheetByIndex(index)**: 인덱스로 시트 찾기
- **csvData**: 하위 호환성을 위한 활성 시트 데이터 (headers, data, fileName, sheetName)

### 활성 시트 정보:
- 시트명: ${context?.sheetName || '알 수 없음'}
- 총 시트 수: ${dto.extendedSheetContext?.totalSheets || dto.sheetsData?.sheets.length || 1}
` : `
### 단일 시트 환경:
- **csvData**: 메인 데이터 객체 (headers, data, fileName)
`}

## 현재 시트 구조:
- headers: [${headers.map(h => `"${h}"`).join(', ')}]
- data: string[][] (2차원 배열)
- 각 행은 헤더 순서대로 데이터가 배열되어 있습니다.

## 필수 코드 구조 (React.createElement 사용):
\`\`\`javascript
const ComponentToRender = () => {
  // 1. 데이터 검증 (필수)
  ${isMultiSheet ? `
  if (!xlsxData || !activeSheetData || !activeSheetData.data) {
    return React.createElement('div', 
      { className: 'text-center p-4 text-red-500' }, 
      '데이터가 없습니다.'
    );
  }
  
  // 활성 시트의 데이터 사용
  const currentData = activeSheetData.data;
  const headers = activeSheetData.headers;
  ` : `
  if (!csvData || !csvData.data) {
    return React.createElement('div', 
      { className: 'text-center p-4 text-red-500' }, 
      '데이터가 없습니다.'
    );
  }
  
  const currentData = csvData.data;
  const headers = csvData.headers;
  `}
  
  // 2. 데이터 처리
  const processedData = currentData.map((row, index) => ({
    name: row[0],
    value: parseFloat(row[1]) || 0
  }));
  
  // 3. 렌더링 (React.createElement만 사용)
  return React.createElement('div', 
    { className: 'w-full p-4' },
    React.createElement('h2', 
      { className: 'text-center text-xl font-bold mb-4' }, 
      '${artifactType === ArtifactType.CHART ? '차트 분석' : '데이터 분석'}'
    ),
    React.createElement(BarChart, 
      { width: 600, height: 300, data: processedData },
      React.createElement(XAxis, { dataKey: 'name' }),
      React.createElement(YAxis, {}),
      React.createElement(Tooltip, {}),
      React.createElement(Legend, {}),
      React.createElement(Bar, { dataKey: 'value', fill: '#8884d8' })
    )
  );
};
\`\`\`

## 다중 시트 데이터 접근 예시:
${isMultiSheet ? `
\`\`\`javascript
// 다른 시트 데이터 접근
const salesSheet = getSheetByName('Sales');
const expenseSheet = getSheetByName('Expenses');

// 여러 시트 데이터 합치기
const combinedData = allSheetsData.flatMap(sheet => 
  sheet.data.map(row => ({
    sheet: sheet.sheetName,
    value: parseFloat(row[1]) || 0
  }))
);

// 시트별 요약 데이터
const sheetSummary = allSheetsData.map(sheet => ({
  name: sheet.sheetName,
  total: sheet.data.reduce((sum, row) => sum + (parseFloat(row[1]) || 0), 0)
}));
\`\`\`
` : ''}

## React.createElement 사용법:
1. **기본 HTML 태그**: React.createElement('div', {속성들}, ...자식요소들)
2. **React 컴포넌트**: React.createElement(BarChart, {속성들}, ...자식요소들)
3. **속성 예시**: { className: 'css-class', onClick: handler, dataKey: 'field' }
4. **자식 요소**: 문자열, 다른 React.createElement 호출, 배열 등

## 요청 타입: ${artifactType}
${artifactType === ArtifactType.CHART ? '- 차트 시각화에 집중하세요. 적절한 차트 타입(Bar, Line, Pie 등)을 선택하세요.' : ''}
${artifactType === ArtifactType.TABLE ? '- 테이블 형태의 데이터 표시에 집중하세요. 정렬, 검색 기능을 포함하세요.' : ''}
${artifactType === ArtifactType.ANALYSIS ? '- 데이터 통계 분석에 집중하세요. 평균, 합계, 최댓값 등을 계산하세요.' : ''}

**중요**: JSX를 절대 사용하지 말고, 모든 요소를 React.createElement로 생성해주세요. 이렇게 해야 프론트엔드에서 오류 없이 렌더링됩니다.`;
  }

  private extractHeaders(dto: GenerateArtifactDto): string[] {
    if (dto.extendedSheetContext) {
      return dto.extendedSheetContext.headers.map(h => h.name || h.column);
    }
    
    if (dto.sheetContext) {
      return dto.sheetContext.headers.map(h => h.name || h.column);
    }
    
    if (dto.sheetsData && dto.sheetsData.sheets && dto.sheetsData.sheets.length > 0) {
      const activeSheet = dto.sheetsData.sheets.find(sheet => sheet.name === dto.sheetsData?.activeSheet);
      return activeSheet?.metadata?.headers || [];
    }
    
    return [];
  }

  private createUserPrompt(userInput: string, dto: GenerateArtifactDto): string {
    const context = this.selectSheetContext(dto);
    const isMultiSheet = (dto.extendedSheetContext?.totalSheets || 0) > 1 || (dto.sheetsData?.sheets?.length || 0) > 1;
    
    // 샘플 데이터 추출
    const sampleData = this.extractSampleData(dto);
    
    // 헤더 정보 안전하게 추출
    const headers = this.extractHeaders(dto);
    
    // 데이터 범위 정보 추출
    const getDataRange = (): string => {
      if (dto.extendedSheetContext?.dataRange) {
        const dataRange = dto.extendedSheetContext.dataRange;
        return `${dataRange.startRow}행 ~ ${dataRange.endRow}행`;
      }
      
      if (dto.sheetContext?.dataRange) {
        const dataRange = dto.sheetContext.dataRange;
        return `${dataRange.startRow}행 ~ ${dataRange.endRow}행`;
      }
      
      if (dto.sheetsData && dto.sheetsData.sheets && dto.sheetsData.sheets.length > 0) {
        const activeSheet = dto.sheetsData.sheets.find(sheet => sheet.name === dto.sheetsData?.activeSheet);
        return activeSheet ? `총 ${activeSheet.metadata?.rowCount || 0}행` : '범위 정보 없음';
      }
      
      return '범위 정보 없음';
    };
    
    // 다중 시트 정보
    const getMultiSheetInfo = (): string => {
      if (!isMultiSheet) return '';
      
      let info = '\n## 다중 시트 정보:\n';
      
      if (dto.extendedSheetContext) {
        info += `- **총 시트 수**: ${dto.extendedSheetContext.totalSheets}\n`;
        info += `- **시트 목록**: ${dto.extendedSheetContext.sheetList.join(', ')}\n`;
        info += `- **활성 시트**: ${dto.extendedSheetContext.sheetName}\n`;
      } else if (dto.sheetsData && dto.sheetsData.sheets) {
        info += `- **총 시트 수**: ${dto.sheetsData.sheets.length}\n`;
        info += `- **시트 목록**: ${dto.sheetsData.sheets.map(s => s.name).join(', ')}\n`;
        info += `- **활성 시트**: ${dto.sheetsData.activeSheet}\n`;
      }
      
      return info;
    };
    
    return `사용자 요청: "${userInput}"

## 데이터 정보:
- **파일/시트명**: ${context?.sheetName || '파일명 없음'}
- **컬럼**: ${headers.join(', ')}
- **데이터 범위**: ${getDataRange()}
${getMultiSheetInfo()}

## 샘플 데이터:
${sampleData}

## 요구사항:
1. 위 데이터를 활용하여 사용자 요청에 맞는 컴포넌트를 생성해주세요.
2. 데이터 타입을 적절히 변환하세요 (문자열 → 숫자 변환 등).
3. 사용자에게 의미 있는 시각화나 분석을 제공해주세요.
4. 에러 처리와 빈 데이터 처리를 포함해주세요.
${isMultiSheet ? '5. 다중 시트 환경에서는 필요시 다른 시트의 데이터도 활용하세요.' : ''}

**ComponentToRender 함수만 반환하고, 별도의 설명은 주석으로 포함해주세요.**`;
  }

  private extractSampleData(dto: GenerateArtifactDto): string {
    // 샘플 데이터 추출
    let sampleData: any[] = [];
    
    if (dto.extendedSheetContext?.sampleData) {
      sampleData = dto.extendedSheetContext.sampleData.slice(0, 3);
    } else if (dto.sheetContext?.sampleData) {
      sampleData = dto.sheetContext.sampleData.slice(0, 3);
    } else if (dto.sheetsData && dto.sheetsData.sheets && dto.sheetsData.sheets.length > 0) {
      const activeSheet = dto.sheetsData.sheets.find(sheet => sheet.name === dto.sheetsData?.activeSheet);
      sampleData = activeSheet?.metadata?.sampleData?.slice(0, 3) || [];
    }
    
    // 샘플 데이터 포맷팅
    if (!sampleData || sampleData.length === 0) {
      return '**샘플 데이터 없음**';
    }
    
    return sampleData.map((row, i) => {
      if (Array.isArray(row)) {
        return `**${i + 1}행**: [${row.map(cell => `"${cell}"`).join(', ')}]`;
      } else if (typeof row === 'object' && row !== null) {
        const values = Object.values(row);
        return `**${i + 1}행**: [${values.map(cell => `"${cell}"`).join(', ')}]`;
      } else {
        return `**${i + 1}행**: "${row}"`;
      }
    }).join('\n');
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
// src/modules/datageneration/datageneration.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { 
  GenerateDataDto, 
  DataGenerationResponseDto, 
  EditedDataDto, 
  ChangeLogItem, 
  ExtendedSheetContext, 
  SheetContext, 
  SheetsData 
} from './dto/generate-data.dto';

@Injectable()
export class DataGenerationService {
  private readonly logger = new Logger(DataGenerationService.name);
  private readonly openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async generateData(dto: GenerateDataDto): Promise<DataGenerationResponseDto> {
    try {
      this.logger.log(`데이터 생성 요청: ${dto.userInput}`);

      // 프론트엔드에서 받은 데이터 로깅
      this.logger.log('==================== 프론트엔드에서 받은 데이터 시작 ====================');
      this.logger.log(`사용자 입력: ${dto.userInput}`);

      if (dto.extendedSheetContext) {
        this.logger.log('확장 시트 컨텍스트:');
        this.logger.log(`- 시트명: ${dto.extendedSheetContext.sheetName}`);
        this.logger.log(`- 시트 인덱스: ${dto.extendedSheetContext.sheetIndex}`);
        this.logger.log(`- 전체 시트 수: ${dto.extendedSheetContext.totalSheets}`);
        this.logger.log(`- 헤더 수: ${dto.extendedSheetContext.headers?.length || 0}`);
        if (dto.extendedSheetContext.sampleData) {
          this.logger.log(`- 샘플 데이터 행 수: ${dto.extendedSheetContext.sampleData.length}`);
        }
      }

      // ✅ sheetsData 우선 처리
      const sheetsData = dto.sheetsData || dto.currentData;
      if (sheetsData) {
        this.logger.log('시트 데이터:');
        this.logger.log(`- 전체 시트 수: ${sheetsData.sheets?.length || 0}`);
        this.logger.log(`- 활성 시트: ${sheetsData.activeSheet || '없음'}`);
        this.logger.log(`- 파일명: ${sheetsData.fileName || '없음'}`);
        
        if (sheetsData.sheets) {
          sheetsData.sheets.forEach((sheet, index) => {
            this.logger.log(`- 시트 ${index}: ${sheet.name}`);
            this.logger.log(`  * 행 수: ${sheet.metadata?.rowCount || 0}`);
            this.logger.log(`  * 열 수: ${sheet.metadata?.columnCount || 0}`);
            this.logger.log(`  * 전체 데이터 존재: ${!!sheet.metadata?.fullData}`);
            this.logger.log(`  * 샘플 데이터 행 수: ${sheet.metadata?.sampleData?.length || 0}`);
          });
        }
      }

      this.logger.log('==================== 프론트엔드에서 받은 데이터 끝 ====================');

      // 데이터 컨텍스트 조회
      const dataContext = this.getDataContext(dto);
      
      // 디버깅을 위한 컨텍스트 로깅
      this.logger.debug('=== 데이터 컨텍스트 디버그 정보 ===');
      this.logger.debug(`컨텍스트 유형: ${this.getContextType(dto)}`);
      
      if (dto.extendedSheetContext) {
        this.logger.debug(`확장 컨텍스트 - 시트명: ${dto.extendedSheetContext.sheetName}`);
        this.logger.debug(`확장 컨텍스트 - 시트 인덱스: ${dto.extendedSheetContext.sheetIndex}`);
        this.logger.debug(`확장 컨텍스트 - 전체 시트 수: ${dto.extendedSheetContext.totalSheets}`);
        this.logger.debug(`확장 컨텍스트 - 헤더: ${JSON.stringify(dto.extendedSheetContext.headers)}`);
      }
      
      if (sheetsData) {
        this.logger.debug(`시트 데이터 - 전체 시트 수: ${sheetsData.sheets?.length || 0}`);
        this.logger.debug(`시트 데이터 - 활성 시트: ${sheetsData.activeSheet}`);
        sheetsData.sheets?.forEach((sheet, index) => {
          this.logger.debug(`시트 ${index}: ${sheet.name} (${sheet.metadata?.rowCount || 0} 행)`);
          // ✅ 전체 데이터 존재 여부 확인
          if (sheet.metadata?.fullData) {
            this.logger.debug(`  * 전체 데이터 행 수: ${sheet.metadata.fullData.length}`);
          }
        });
      }
      
      this.logger.debug('=== 컨텍스트 디버그 끝 ===');

      // 시스템 프롬프트 생성
      const systemPrompt = this.createSystemPrompt(dto);

      // 사용자 프롬프트 생성
      const userPrompt = this.createUserPrompt(dto.userInput, dto);

      // OpenAI API 호출
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 10000,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (!aiResponse) {
        throw new InternalServerErrorException('AI 응답을 받을 수 없습니다.');
      }

      // 응답에서 데이터 추출
      const result = this.extractDataFromResponse(aiResponse, dto);
      
      // 전체 응답 데이터 로깅
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 시작 ====================');
      this.logger.log(`성공 여부: ${result.success}`);
      this.logger.log(`시트명: ${result.editedData?.sheetName}`);
      this.logger.log(`헤더 수: ${result.editedData?.headers?.length}`);
      this.logger.log(`데이터 행 수: ${result.editedData?.data?.length}`);
      this.logger.log(`시트 인덱스: ${result.sheetIndex}`);
      this.logger.log(`설명: ${result.explanation}`);
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 끝 ====================');
      
      return result;

    } catch (error) {
      this.logger.error('데이터 생성 오류:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      const errorResult: DataGenerationResponseDto = {
        success: false,
        error: error.message || '데이터 생성 중 오류가 발생했습니다.',
      };
      
      this.logger.log('==================== 프론트엔드 전송 오류 응답 시작 ====================');
      this.logger.log(JSON.stringify(errorResult, null, 2));
      this.logger.log('==================== 프론트엔드 전송 오류 응답 끝 ====================');
      
      return errorResult;
    }
  }

  // ✅ getDataContext 메서드 수정
  private getDataContext(dto: GenerateDataDto): any {
    // 우선순위: extendedSheetContext > sheetsData > currentData
    if (dto.extendedSheetContext) {
      return dto.extendedSheetContext;
    }
    
    const sheetsData = dto.sheetsData || dto.currentData;
    if (sheetsData && sheetsData.sheets && sheetsData.sheets.length > 0) {
      // 활성 시트 찾기
      const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet);
      
      if (activeSheet) {
        return {
          sheetName: activeSheet.name,
          headers: activeSheet.metadata?.headers?.map((name, index) => ({
            column: String.fromCharCode(65 + index),
            name
          })) || [],
          // ✅ 전체 데이터 우선 사용, 없으면 CSV 파싱
          data: activeSheet.metadata?.fullData || this.parseCsvToArray(activeSheet.csv),
          // ✅ 추가 메타데이터
          rowCount: activeSheet.metadata?.rowCount || 0,
          columnCount: activeSheet.metadata?.columnCount || 0,
          sheetIndex: activeSheet.metadata?.sheetIndex || 0
        };
      }
    }
    
    return null;
  }

  private parseCsvToArray(csv: string): string[][] {
    if (!csv) return [[]];
    
    // 간단한 CSV 파싱 로직
    return csv.split('\n').map(line => line.split(','));
  }

  // ✅ getContextType 메서드 수정
  private getContextType(dto: GenerateDataDto): string {
    if (dto.extendedSheetContext) return 'ExtendedSheetContext';
    if (dto.sheetsData) return 'SheetsData';
    if (dto.currentData) return 'CurrentData (Legacy)';
    return 'None';
  }

  private createSystemPrompt(dto: GenerateDataDto): string {
    const sheetsData = dto.sheetsData || dto.currentData;
    const hasExistingData = !!(dto.extendedSheetContext || (sheetsData && sheetsData.sheets.length > 0));
    const isMultiSheet = (dto.extendedSheetContext?.totalSheets || 0) > 1 || (sheetsData?.sheets?.length || 0) > 1;
    
    return `당신은 스프레드시트 데이터 생성 및 가공 전문가입니다.

## 임무
사용자의 요청에 따라 아래 두 가지 작업 중 하나를 수행해야 합니다:
1. 새 스프레드시트 데이터를 생성합니다.
2. 기존 스프레드시트 데이터를 수정/변환합니다.

## 응답 형식
JSON 형식으로 응답해야 합니다:

\`\`\`json
{
  "sheetName": "데이터가 저장될 시트명",
  "headers": ["열1", "열2", "열3", ...],
  "data": [
    ["행1-열1값", "행1-열2값", "행1-열3값", ...],
    ["행2-열1값", "행2-열2값", "행2-열3값", ...],
    ...
  ],
  "sheetIndex": 시트 인덱스 (기존 시트 수정 시 기존 인덱스, 아니면 null),
  "explanation": "생성된 데이터에 대한 설명",
  "changeLog": [
    {"type": "create", "description": "새 시트 생성"},
    {"type": "add", "row": 1, "column": 0, "after": "값", "description": "새 데이터 추가"},
    {"type": "update", "row": 2, "column": 1, "before": "이전값", "after": "새값", "description": "데이터 업데이트"}
  ]
}
\`\`\`

## 중요 규칙
1. 모든 텍스트는 한국어로 작성하세요.
2. 데이터 배열은 2차원 문자열 배열이어야 합니다.
3. 숫자도 문자열로 반환하세요 (예: 100 -> "100").
4. 빈 셀은 빈 문자열("")로 표시하세요.
5. NULL이나 undefined 값은 사용하지 마세요.
6. JSON 외에 다른 텍스트나 마크다운은 포함하지 마세요.
7. 데이터 생성 시 현실적이고 의미 있는 데이터를 만드세요.
8. 날짜 형식은 YYYY-MM-DD로 통일하세요.
9. 시트 이름은 의미 있고 간결하게 지정하세요.
10. 헤더 이름은 명확하고 식별 가능하게 작성하세요.
11. 변경 로그는 상세하게 기록하세요.
12. 기존 데이터가 있다면 전체 데이터를 기준으로 작업하세요 (샘플 데이터가 아닌)

## 기존 데이터 컨텍스트
${hasExistingData ? `
이미 존재하는 데이터가 있습니다:
${isMultiSheet ? `
- 다중 시트 환경
- 총 시트 수: ${dto.extendedSheetContext?.totalSheets || sheetsData?.sheets?.length || 0}
- 활성 시트: ${dto.extendedSheetContext?.sheetName || sheetsData?.activeSheet || '없음'}
` : `
- 단일 시트 환경
- 시트명: ${dto.extendedSheetContext?.sheetName || sheetsData?.sheets?.[0]?.name || '없음'}
`}
- 전체 데이터가 제공되어 있으므로 모든 행을 대상으로 작업하세요
` : `
기존 데이터가 없습니다. 사용자 요청에 따라 새 데이터를 생성해야 합니다.
`}
`;
  }

  // ✅ createUserPrompt 메서드 수정
  private createUserPrompt(userInput: string, dto: GenerateDataDto): string {
    const context = this.getDataContext(dto);
    
    // 샘플 데이터 추출 (표시용)
    const sampleData = this.extractSampleData(dto);
    
    // 전체 데이터 정보 추출
    const fullDataInfo = this.extractFullDataInfo(dto);
    
    // 헤더 정보 안전하게 추출
    const headers = this.extractHeaders(dto);
    
    // 데이터 존재 여부
    const sheetsData = dto.sheetsData || dto.currentData;
    const hasExistingData = !!(dto.extendedSheetContext || (sheetsData?.sheets && sheetsData.sheets.length > 0));
    
    return `사용자 요청: "${userInput}"

${hasExistingData ? `
## 현재 데이터 정보:
${context ? `
- **시트명**: ${context.sheetName || '알 수 없음'}
- **컬럼**: ${headers.length > 0 ? headers.join(', ') : '없음'}
- **전체 데이터 행 수**: ${context.rowCount || (context.data ? context.data.length - 1 : 0)}
- **전체 데이터 열 수**: ${context.columnCount || headers.length}

${fullDataInfo ? `
## 전체 데이터 정보:
${fullDataInfo}
` : ''}

## 샘플 데이터 (표시용):
${sampleData}
` : '현재 데이터 정보를 추출할 수 없습니다.'}
` : '## 현재 데이터가 없습니다. 새 데이터를 생성하세요.'}

## 요청 분석
사용자의 요청을 분석한 후, 다음 중 하나를 수행하세요:

1. **데이터 생성**: 새로운 스프레드시트 데이터 생성
2. **데이터 수정**: 기존 **전체 데이터**를 변환하거나 업데이트

**중요**: 기존 데이터가 있다면 샘플 데이터가 아닌 전체 데이터를 기준으로 작업하세요.

시트 이름, 헤더, 그리고 최소 5개 이상의 행을 포함한 데이터를 JSON 형식으로 반환하세요.
변경사항에 대한 설명도 포함해주세요.

반드시 표준 JSON 형식으로 응답하고, 추가 설명이나 마크다운은 포함하지 마세요.`;
  }

  // ✅ 전체 데이터 정보 추출 메서드 추가
  private extractFullDataInfo(dto: GenerateDataDto): string {
    const sheetsData = dto.sheetsData || dto.currentData;
    
    if (sheetsData && sheetsData.sheets && sheetsData.sheets.length > 0) {
      const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet);
      
      if (activeSheet && activeSheet.metadata?.fullData) {
        const fullData = activeSheet.metadata.fullData;
        return `- **전체 데이터 행 수**: ${fullData.length}
- **전체 데이터 사용 가능**: 예
- **데이터 처리 범위**: ${fullData.length > 1000 ? '대용량 데이터 (1000행 이상)' : '일반 데이터'}`;
      }
    }
    
    return '';
  }

  private extractSampleData(dto: GenerateDataDto): string {
    // 샘플 데이터 추출 로직
    let sampleData: any[] = [];
    
    if (dto.extendedSheetContext?.sampleData) {
      sampleData = dto.extendedSheetContext.sampleData.slice(0, 3);
    } else {
      const sheetsData = dto.sheetsData || dto.currentData;
      if (sheetsData && sheetsData.sheets && sheetsData.sheets.length > 0) {
        const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet);
        
        if (activeSheet) {
          // ✅ 전체 데이터가 있으면 전체 데이터에서 샘플 추출
          if (activeSheet.metadata?.fullData) {
            sampleData = activeSheet.metadata.fullData.slice(0, 3);
          } else if (activeSheet.csv) {
            const rows = activeSheet.csv.split('\n');
            if (rows.length > 1) {
              sampleData = rows.slice(1, 4).map(row => row.split(','));
            }
          }
        }
      }
    }
    
    if (!sampleData || sampleData.length === 0) {
      return "**샘플 데이터 없음**";
    }
    
    return sampleData.map((row, i) => {
      if (Array.isArray(row)) {
        return `**${i + 1}행**: ${row.map(cell => `"${cell}"`).join(', ')}`;
      } else if (typeof row === 'object' && row !== null) {
        const values = Object.values(row);
        return `**${i + 1}행**: ${values.map(cell => `"${cell}"`).join(', ')}`;
      } else {
        return `**${i + 1}행**: "${row}"`;
      }
    }).join('\n');
  }

  // ✅ extractHeaders 메서드 수정
  private extractHeaders(dto: GenerateDataDto): string[] {
    if (dto.extendedSheetContext) {
      return dto.extendedSheetContext.headers.map(h => h.name || h.column);
    }
    
    const sheetsData = dto.sheetsData || dto.currentData;
    if (sheetsData && sheetsData.sheets && sheetsData.sheets.length > 0) {
      const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet);
      
      if (activeSheet) {
        // 메타데이터의 헤더 우선 사용
        if (activeSheet.metadata?.headers) {
          return activeSheet.metadata.headers;
        }
        
        if (activeSheet.csv) {
          const firstLine = activeSheet.csv.split('\n')[0];
          if (firstLine) {
            return firstLine.split(',');
          }
        }
      }
    }
    
    return [];
  }

  private extractDataFromResponse(aiResponse: string, dto: GenerateDataDto): DataGenerationResponseDto {
    this.logger.debug(`AI 응답 분석 시작: ${aiResponse.substring(0, 100)}...`);
    
    try {
      // JSON 추출
      const jsonRegex = /```json([\s\S]*?)```|(\{[\s\S]*\})/;
      const match = aiResponse.match(jsonRegex);
      
      let jsonString = '';
      if (match && match[1]) {
        jsonString = match[1].trim();
      } else if (match && match[2]) {
        jsonString = match[2].trim();
      } else if (aiResponse.trimStart().startsWith('{') && aiResponse.trimEnd().endsWith('}')) {
        jsonString = aiResponse.trim();
      } else {
        throw new Error('응답에서 유효한 JSON 형식을 찾을 수 없습니다.');
      }
      
      // JSON 파싱
      const parsedData = JSON.parse(jsonString);
      
      // 기본 유효성 검사
      if (!parsedData.sheetName) {
        throw new Error('시트명이 누락되었습니다.');
      }
      if (!Array.isArray(parsedData.headers) || parsedData.headers.length === 0) {
        throw new Error('유효한 헤더가 없습니다.');
      }
      if (!Array.isArray(parsedData.data)) {
        throw new Error('데이터 배열이 누락되었습니다.');
      }
      
      // 데이터 배열 검증 및 정제
      const cleanedData = parsedData.data.map(row => {
        if (!Array.isArray(row)) {
          return parsedData.headers.map(() => '');
        }
        
        // 헤더 길이에 맞게 데이터 조정
        while (row.length < parsedData.headers.length) {
          row.push('');
        }
        
        // 모든 값이 문자열인지 확인
        return row.map(cell => cell === null || cell === undefined ? '' : String(cell));
      });
      
      // 변경 로그 확인
      const changeLog: ChangeLogItem[] = Array.isArray(parsedData.changeLog) 
        ? parsedData.changeLog
        : [];
      
      // 시트 인덱스 결정
      const sheetIndex = parsedData.sheetIndex !== undefined 
        ? parsedData.sheetIndex 
        : dto.extendedSheetContext?.sheetIndex;
      
      return {
        success: true,
        editedData: {
          sheetName: parsedData.sheetName,
          headers: parsedData.headers.map(header => String(header)),
          data: cleanedData
        },
        sheetIndex,
        explanation: parsedData.explanation || '데이터가 성공적으로 생성되었습니다.',
        changeLog
      };
      
    } catch (error) {
      this.logger.error('응답 데이터 추출 오류:', error);
      throw new InternalServerErrorException(`데이터 추출 실패: ${error.message}`);
    }
  }
}
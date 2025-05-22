import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { 
  ProcessDataDto, 
  DataFixResponseDto, 
  EditedDataDto, 
  ChangesDto,
  ExtendedSheetContext, 
  SheetsData 
} from './dto/process-data.dto';

@Injectable()
export class DataFixService {
  private readonly logger = new Logger(DataFixService.name);
  private readonly openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async processData(dto: ProcessDataDto): Promise<DataFixResponseDto> {
    try {
      this.logger.log(`데이터 수정 요청: ${dto.userInput}`);
      
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
        temperature: 0.2,
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
      
      if (result.changes) {
        this.logger.log(`변경 유형: ${result.changes.type}`);
        this.logger.log(`변경 세부 내용: ${result.changes.details}`);
      }
      
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 끝 ====================');
      
      return result;

    } catch (error) {
      this.logger.error('데이터 수정 오류:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      const errorResult: DataFixResponseDto = {
        success: false,
        error: error.message || '데이터 수정 중 오류가 발생했습니다.',
      };
      
      this.logger.log('==================== 프론트엔드 전송 오류 응답 시작 ====================');
      this.logger.log(JSON.stringify(errorResult, null, 2));
      this.logger.log('==================== 프론트엔드 전송 오류 응답 끝 ====================');
      
      return errorResult;
    }
  }

  // ✅ getDataContext 메서드 수정
  private getDataContext(dto: ProcessDataDto): any {
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
  private getContextType(dto: ProcessDataDto): string {
    if (dto.extendedSheetContext) return 'ExtendedSheetContext';
    if (dto.sheetsData) return 'SheetsData';
    if (dto.currentData) return 'CurrentData (Legacy)';
    return 'None';
  }

  private createSystemPrompt(dto: ProcessDataDto): string {
    const sheetsData = dto.sheetsData || dto.currentData;
    const hasExistingData = !!(dto.extendedSheetContext || (sheetsData && sheetsData.sheets.length > 0));
    const isMultiSheet = (dto.extendedSheetContext?.totalSheets || 0) > 1 || (sheetsData?.sheets?.length || 0) > 1;
    
    return `당신은 스프레드시트 데이터 수정, 정렬, 필터링, 변환 전문가입니다.

## 임무
사용자의 요청에 따라 기존 스프레드시트 데이터를 다음과 같이 처리해야 합니다:
1. 데이터 정렬 (오름차순, 내림차순 등)
2. 데이터 필터링 (조건에 맞는 행만 표시)
3. 데이터 수정 (특정 값 변경, 열 추가, 삭제 등)
4. 데이터 변환 (형식 변경, 계산 추가 등)

## 응답 형식
JSON 형식으로 응답해야 합니다:

\`\`\`json
{
  "sheetName": "처리된 데이터가 저장될 시트명",
  "headers": ["열1", "열2", "열3", ...],
  "data": [
    ["행1-열1값", "행1-열2값", "행1-열3값", ...],
    ["행2-열1값", "행2-열2값", "행2-열3값", ...],
    ...
  ],
  "sheetIndex": 시트 인덱스 (기존 시트 수정 시 기존 인덱스),
  "explanation": "수정된 데이터에 대한 설명",
  "changes": {
    "type": "sort" | "filter" | "modify" | "transform",
    "details": "변경 내용에 대한 자세한 설명"
  }
}
\`\`\`

## 중요 규칙
1. 들어온 언어에 맞게 수정해야합니다
2. 데이터 배열은 2차원 문자열 배열이어야 합니다.
3. 숫자도 문자열로 반환하세요 (예: 100 -> "100").
4. 빈 셀은 빈 문자열("")로 표시하세요.
5. NULL이나 undefined 값은 사용하지 마세요.
6. JSON 외에 다른 텍스트나 마크다운은 포함하지 마세요.
7. 변경 유형은 'sort', 'filter', 'modify', 'transform' 중 하나여야 합니다.
8. 날짜 형식은 YYYY-MM-DD로 통일하세요.
9. 정렬의 경우 입력받는 모든 값을 정렬해서 반환하세요
10. 전체 데이터를 기준으로 작업하세요 (샘플 데이터가 아닌)

## 변경 유형 설명
1. sort: 데이터 정렬 (특정 열 기준 오름차순/내림차순)
2. filter: 특정 조건에 맞는 행만 필터링
3. modify: 데이터 값 수정 (변경, 삭제, 추가)
4. transform: 데이터 구조 변경 (열 계산, 형식 변환 등)

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
- 전체 데이터가 제공되어 있으므라 모든 행을 대상으로 작업하세요
` : `
데이터가 없습니다. 사용자에게 먼저 데이터를 업로드하도록 안내해야 합니다.
`}
`;
  }

  // ✅ createUserPrompt 메서드 수정
  private createUserPrompt(userInput: string, dto: ProcessDataDto): string {
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
` : '## 현재 데이터가 없습니다. 데이터를 먼저 생성하도록 사용자에게 안내해주세요.'}

## 요청 분석
사용자의 요청에 따라 **전체 데이터**를 대상으로 수정, 정렬, 필터링 또는 변환하세요.
다음 네 가지 작업 중 하나를 수행해야 합니다:

1. 정렬(sort): 특정 열을 기준으로 데이터 정렬
2. 필터링(filter): 조건에 맞는 데이터만 선택
3. 수정(modify): 데이터 값을 변경하거나 열/행 추가/삭제
4. 변환(transform): 데이터 구조나 형식 변환

**중요**: 샘플 데이터가 아닌 전체 데이터를 기준으로 작업하세요.

수정된 시트 이름, 헤더, 데이터 배열, 변경 유형(type), 그리고 세부 내용(details)을 포함한 JSON을 반환하세요.

반드시 표준 JSON 형식으로 응답하고, 마크다운이나 추가 설명은 포함하지 마세요.`;
  }

  // ✅ 전체 데이터 정보 추출 메서드 추가
  private extractFullDataInfo(dto: ProcessDataDto): string {
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

  private extractSampleData(dto: ProcessDataDto): string {
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
  private extractHeaders(dto: ProcessDataDto): string[] {
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

  private extractDataFromResponse(aiResponse: string, dto: ProcessDataDto): DataFixResponseDto {
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
      
      // 변경 유형 및 세부 내용 확인
      const changesTypes = ['sort', 'filter', 'modify', 'transform'];
      const changes: ChangesDto = parsedData.changes && 
        changesTypes.includes(parsedData.changes.type) ? 
        {
          type: parsedData.changes.type as 'sort' | 'filter' | 'modify' | 'transform',
          details: parsedData.changes.details || '상세 설명 없음'
        } : 
        {
          type: 'modify',
          details: '데이터가 수정되었습니다.'
        };
      
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
        explanation: parsedData.explanation || '데이터가 성공적으로 수정되었습니다.',
        changes
      };
      
    } catch (error) {
      this.logger.error('응답 데이터 추출 오류:', error);
      throw new InternalServerErrorException(`데이터 추출 실패: ${error.message}`);
    }
  }
}
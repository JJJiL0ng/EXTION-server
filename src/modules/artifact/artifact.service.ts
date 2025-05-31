// src/modules/artifact/artifact.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GenerateArtifactDto, ArtifactResponseDto, ArtifactType } from './dto/generate-artifact.dto';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { CreateMessageDto, MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ArtifactService {
  private readonly logger = new Logger(ArtifactService.name);
  private readonly openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async generateArtifact(dto: GenerateArtifactDto): Promise<ArtifactResponseDto> {
    try {
      this.logger.log(`아티팩트 생성 요청: ${dto.userInput}`);
      this.logger.log(`사용자 ID: ${dto.userId}`);
      this.logger.log(`채팅 ID: ${dto.chatId || '새 채팅'}`);
      this.logger.log(`스프레드시트 ID: ${dto.spreadsheetId || '없음'}`);

      // === 1. 채팅 세션 처리 ===
      let chatId = dto.chatId;

      if (!chatId) {
        // chatId가 전혀 없는 경우 - 새 채팅 생성
        const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);
        chatId = await this.firebaseService.createChat(dto.userId, { 
          title: chatTitle,
          spreadsheetId: dto.spreadsheetId // 스프레드시트 ID 포함
        });
        this.logger.log(`새 채팅 생성: ${chatId}`);
      } else {
        // 프론트에서 chatId를 보낸 경우
        this.logger.log(`프론트에서 제공된 chatId: ${chatId}`);

        // 기존 채팅 존재 확인
        const existingChat = await this.firebaseService.getChat(chatId);

        if (!existingChat) {
          // Firebase에 해당 chatId로 채팅이 없으면 생성
          this.logger.log(`Firebase에 채팅이 없어서 새로 생성: ${chatId}`);
          const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);

          // 프론트엔드가 제공한 chatId를 사용하여 채팅 생성
          await this.firebaseService.createChatWithId(dto.userId, chatId, { 
            title: chatTitle,
            spreadsheetId: dto.spreadsheetId // 스프레드시트 ID 포함
          });
        } else {
          // 기존 채팅 소유권 확인
          if (existingChat.userId !== dto.userId) {
            throw new BadRequestException('채팅 접근 권한이 없습니다.');
          }
          this.logger.log(`기존 채팅 사용: ${chatId}`);
          
          // 기존 채팅에 스프레드시트 ID가 없고 새로 전달된 경우 업데이트
          if (!existingChat.spreadsheetId && dto.spreadsheetId) {
            await this.firebaseService.updateChatSpreadsheetId(chatId, dto.spreadsheetId);
            this.logger.log(`기존 채팅에 스프레드시트 ID 연결: ${dto.spreadsheetId}`);
          }
        }
      }

      // === 2. 스프레드시트 데이터 처리 ===
      let spreadsheetMetadata: any = null;
      let activeSheetData: any = null;

      if (dto.spreadsheetData && dto.spreadsheetData.sheets.length > 0) {
        this.logger.log('프론트엔드에서 전송된 스프레드시트 데이터 사용');
        this.logger.log(`활성 시트: ${dto.spreadsheetData.activeSheet}`);
        this.logger.log(`전체 시트 수: ${dto.spreadsheetData.sheets.length}`);

        // 현재 활성 시트의 데이터 가져오기
        const currentSheet = dto.spreadsheetData.sheets[0]; // 프론트엔드에서 현재 시트만 보내므로 첫 번째 시트

        if (currentSheet) {
          this.logger.log(`현재 시트명: ${currentSheet.name}`);
          this.logger.log(`데이터 행 수: ${currentSheet.data.length}`);
          this.logger.log(`데이터 열 수: ${currentSheet.headers.length}`);

          // spreadsheetMetadata 구성
          spreadsheetMetadata = {
            fileName: dto.spreadsheetData.fileName || currentSheet.name,
            spreadsheetId: dto.spreadsheetId, // 스프레드시트 ID 포함
            sheets: [{
              sheetName: currentSheet.name,
              sheetIndex: currentSheet.sheetIndex || 0,
              headers: currentSheet.headers
            }],
            activeSheetIndex: 0,
            totalSheets: dto.spreadsheetData.sheets.length
          };

          // activeSheetData 구성
          activeSheetData = {
            data: {
              rows: currentSheet.data
            },
            rowCount: currentSheet.data.length,
            columnCount: currentSheet.headers.length,
            headers: currentSheet.headers
          };

          this.logger.log(`변환 완료 - 시트명: ${spreadsheetMetadata.sheets[0].sheetName}`);
          this.logger.log(`변환 완료 - 데이터 행 수: ${activeSheetData.data.rows.length}`);

          // 채팅에 스프레드시트 ID가 연결되지 않은 경우 연결
          if (dto.spreadsheetId) {
            const existingChat = await this.firebaseService.getChat(chatId);
            if (existingChat && !existingChat.spreadsheetId) {
              await this.firebaseService.updateChatSpreadsheetId(chatId, dto.spreadsheetId);
              this.logger.log(`채팅에 스프레드시트 ID 연결: ${dto.spreadsheetId}`);
            }
          }
        }
      } else {
        this.logger.log('프론트엔드에서 스프레드시트 데이터를 보내지 않았습니다.');
      }

      // === 3. 사용자 메시지 저장 ===
      const sheetContext = this.createSheetContext(spreadsheetMetadata, activeSheetData);
      const userMessageDto: CreateMessageDto = {
        content: dto.userInput,
        role: MessageRole.USER,
        type: MessageType.ARTIFACT,
        mode: MessageMode.ARTIFACT,
        ...(sheetContext && { sheetContext }),
      };

      const userMessageId = await this.firebaseService.createMessage(chatId, userMessageDto);
      this.logger.log(`사용자 메시지 저장: ${userMessageId}`);

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

      // === 4. AI 응답 메시지 저장 (아티팩트 데이터 포함) ===
      const artifactId = uuidv4();
      const aiMessageDto: CreateMessageDto = {
        content: explanation || `${artifactType} 분석이 생성되었습니다.`,
        role: MessageRole.EXTION_AI,
        type: MessageType.ARTIFACT,
        mode: MessageMode.ARTIFACT,
        ...(sheetContext && { sheetContext }),
        artifactData: {
          type: artifactType,
          title: this.generateTitle(dto.userInput, artifactType),
          artifactId: artifactId,
          code: extractedCode,
          explanation: explanation,
        },
      };

      const aiMessageId = await this.firebaseService.createMessage(chatId, aiMessageDto);
      this.logger.log(`AI 응답 메시지 저장: ${aiMessageId}`);

      // === 5. 분석 카운터 증가 ===
      await this.firebaseService.incrementAnalyticsCounter(chatId, 'artifactCount');

      // === 스프레드시트 메타데이터 업데이트 (양방향 참조) ===
      if (dto.spreadsheetId && spreadsheetMetadata) {
        this.updateSpreadsheetMetadata(chatId, dto.spreadsheetId, spreadsheetMetadata).catch(error => {
          this.logger.error('스프레드시트 메타데이터 업데이트 중 오류 (비동기):', error);
        });
      }

      // === 6. 응답 반환 ===
      const result: ArtifactResponseDto = {
        success: true,
        code: extractedCode,
        type: artifactType,
        explanation: {
          korean: explanation || `${artifactType} 분석이 생성되었습니다.`
        },
        title: this.generateTitle(dto.userInput, artifactType),
        timestamp: new Date().toISOString(),
        chatId,
        userMessageId,
        aiMessageId,
        spreadsheetMetadata: this.buildSpreadsheetMetadataResponse(spreadsheetMetadata),
      };
      
      // 전체 응답 데이터 로깅 (code 포함)
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 시작 ====================');
      this.logger.log(`성공 여부: ${result.success}`);
      this.logger.log(`타입: ${result.type}`);
      this.logger.log(`제목: ${result.title}`);
      this.logger.log(`설명: ${result.explanation?.korean || '설명 없음'}`);
      this.logger.log(`채팅 ID: ${result.chatId}`);
      this.logger.log(`사용자 메시지 ID: ${result.userMessageId}`);
      this.logger.log(`AI 메시지 ID: ${result.aiMessageId}`);
      this.logger.log(`코드:\n${result.code}`);
      this.logger.log(`타임스탬프: ${result.timestamp}`);
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 끝 ====================');
      
      return result;

    } catch (error) {
      this.logger.error('아티팩트 생성 오류:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      const errorResult: ArtifactResponseDto = {
        success: false,
        error: error.message || '아티팩트 생성 중 오류가 발생했습니다.',
        timestamp: new Date().toISOString()
      };
      
      this.logger.log('==================== 프론트엔드 전송 오류 응답 시작 ====================');
      this.logger.log(JSON.stringify(errorResult, null, 2));
      this.logger.log('==================== 프론트엔드 전송 오류 응답 끝 ====================');
      
      return errorResult;
    }
  }

  // === 시트 컨텍스트 생성 ===
  private createSheetContext(spreadsheetMetadata: any, activeSheetData: any): any {
    if (!spreadsheetMetadata || !activeSheetData) {
      return null;
    }

    const activeSheet = spreadsheetMetadata.sheets?.[0];

    if (!activeSheet) {
      return null;
    }

    return {
      sheetIndex: activeSheet.sheetIndex || 0,
      sheetName: activeSheet.sheetName,
      affectedCells: [],
      totalRows: activeSheetData.rowCount || 0,
      totalColumns: activeSheetData.columnCount || 0,
      headers: activeSheetData.headers || []
    };
  }

  // === 스프레드시트 메타데이터 응답 생성 ===
  private buildSpreadsheetMetadataResponse(spreadsheetMetadata: any): any {
    if (!spreadsheetMetadata) {
      return {
        hasSpreadsheet: false,
        totalSheets: 0,
        activeSheetIndex: 0,
        sheetNames: [],
        lastModifiedAt: new Date(),
      };
    }

    return {
      hasSpreadsheet: true,
      fileName: spreadsheetMetadata.fileName,
      totalSheets: spreadsheetMetadata.totalSheets || spreadsheetMetadata.sheets?.length || 0,
      activeSheetIndex: spreadsheetMetadata.activeSheetIndex || 0,
      sheetNames: spreadsheetMetadata.sheets?.map(sheet => sheet.sheetName) || [],
      lastModifiedAt: new Date(),
    };
  }

  // === 채팅 제목 자동 생성 ===
  private generateChatTitle(userInput: string): string {
    const title = userInput.length > 30 ? userInput.substring(0, 30) + '...' : userInput;
    return title || '새로운 아티팩트 채팅';
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
    const hasSpreadsheetData = !!(dto.spreadsheetData?.sheets?.length);
    const isMultiSheet = hasSpreadsheetData && (dto.spreadsheetData?.sheets?.length || 0) > 1;
    
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
${hasSpreadsheetData ? `
### 다중 시트 환경:
- **xlsxData**: 전체 XLSX 파일 정보 (fileName, sheets, activeSheetIndex)
- **activeSheetData**: 현재 활성 시트 데이터 (headers, data, sheetName)
- **allSheetsData**: 모든 시트 데이터 배열
- **getSheetByName(name)**: 이름으로 시트 찾기
- **getSheetByIndex(index)**: 인덱스로 시트 찾기
- **csvData**: 하위 호환성을 위한 활성 시트 데이터 (headers, data, fileName, sheetName)

### 활성 시트 정보:
- 시트명: ${dto.spreadsheetData?.sheets?.[0]?.name || '알 수 없음'}
- 총 시트 수: ${dto.spreadsheetData?.sheets?.length || 0}
` : `
### 단일 시트 환경:
- **csvData**: 메인 데이터 객체 (headers, data, fileName)
`}

## 현재 시트 구조:
- headers: [${dto.spreadsheetData?.sheets[0]?.headers?.join(', ') || '없음'}]
- data: string[][] (2차원 배열)
- 각 행은 헤더 순서대로 데이터가 배열되어 있습니다.

## 필수 코드 구조 (React.createElement 사용):
\`\`\`javascript
const ComponentToRender = () => {
  // 1. 데이터 검증 (필수)
  ${hasSpreadsheetData ? `
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
      { width: 1000, height: 600, data: processedData },

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

**중요**: JSX를 절대 사용하지 말고, 모든 요소를 React.createElement로 생성해주세요. 코드 안에서 사용되는 표에 관한 단어들을 입력받는 데이터에 작성되어 있는대로 작성해주세요. 이렇게 해야 프론트엔드에서 오류 없이 렌더링됩니다.`;
  }

  private createUserPrompt(userInput: string, dto: GenerateArtifactDto): string {
    const hasData = !!(dto.spreadsheetData?.sheets?.length);
    const isMultiSheet = hasData && (dto.spreadsheetData?.sheets?.length || 0) > 1;
    
    let promptContent = `사용자 요청: "${userInput}"

`;

    if (hasData && dto.spreadsheetData?.sheets?.[0]) {
      const currentSheet = dto.spreadsheetData.sheets[0];

      promptContent += `## 현재 데이터 정보:
- **스프레드시트**: ${dto.spreadsheetData.fileName || '파일명 없음'}
- **시트명**: ${currentSheet.name}
- **컬럼**: ${currentSheet.headers?.join(', ') || '컬럼 없음'}
- **전체 데이터 행 수**: ${currentSheet.data?.length || 0}
- **전체 데이터 열 수**: ${currentSheet.headers?.length || 0}

`;

      // 실제 데이터가 있는 경우 포함
      if (currentSheet.data.length > 0) {
        const limitedRows = this.limitDataForPrompt(
          currentSheet.data,
          currentSheet.headers
        );

        promptContent += `## 실제 데이터:
\`\`\`
${limitedRows}
\`\`\`

**중요**: 위의 실제 데이터를 바탕으로 정확한 분석을 수행해주세요.
- 각 행과 열의 실제 값들을 참조하여 분석하세요
- 데이터의 패턴, 트렌드, 통계를 구체적으로 계산하세요
- 이상값이나 특이사항이 있다면 구체적으로 언급하세요

`;
      }
    } else {
      promptContent += `## 현재 데이터가 없습니다. 
사용자에게 데이터 업로드를 안내하거나 일반적인 스프레드시트 관련 질문에 답변해주세요.

`;
    }

    promptContent += `사용자의 요청에 대해 전문적이고 친근한 톤으로 응답해주세요.
데이터가 있는 경우 **실제 제공된 데이터**를 기준으로 구체적인 분석과 인사이트를 제공하고,
데이터가 없는 경우 적절한 안내를 제공해주세요.`;

    return promptContent;
  }

  private limitDataForPrompt(rows: string[][], headers: string[]): string {
    const maxRows = 100; // 최대 100행까지만 포함
    const maxLength = 50000; // 최대 50,000 문자

    let csvContent = '';

    // 헤더 추가
    if (headers && headers.length > 0) {
      csvContent = headers.join(',') + '\n';
    }

    // 데이터 행 추가 (제한적으로)
    const limitedRows = rows.slice(0, maxRows);
    for (const row of limitedRows) {
      const rowContent = row.join(',') + '\n';

      if (csvContent.length + rowContent.length > maxLength) {
        csvContent += '\n... (더 많은 데이터가 있습니다. 총 ' + rows.length + '행)';
        break;
      }

      csvContent += rowContent;
    }

    return csvContent;
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

  // 스프레드시트 메타데이터 업데이트 (양방향 참조)
  private async updateSpreadsheetMetadata(chatId: string, spreadsheetId: string, spreadsheetMetadata: any): Promise<void> {
    try {
      this.logger.log('==================== 스프레드시트 메타데이터 업데이트 시작 ====================');
      
      // Firebase 서비스를 통해 스프레드시트 메타데이터 업데이트
      await this.firebaseService.updateSpreadsheetMetadata(spreadsheetId, spreadsheetMetadata);

      this.logger.log('✅ 스프레드시트 메타데이터 업데이트 완료');
      this.logger.log('==================== 스프레드시트 메타데이터 업데이트 끝 ====================');

    } catch (error) {
      this.logger.error('스프레드시트 메타데이터 업데이트 중 오류:', error);
      // 메타데이터 업데이트 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
  }

  // 스프레드시트 ID로 연결된 채팅들 조회
  async getChatsBySpreadsheetId(spreadsheetId: string, userId: string): Promise<any[]> {
    try {
      this.logger.log(`스프레드시트 연결 채팅 조회: ${spreadsheetId}`);
      
      const chats = await this.firebaseService.getChatsBySpreadsheetId(spreadsheetId, userId);
      
      this.logger.log(`연결된 채팅 수: ${chats.length}`);
      return chats;
    } catch (error) {
      this.logger.error('스프레드시트 연결 채팅 조회 오류:', error);
      throw error;
    }
  }

  // 채팅 ID로 연결된 스프레드시트 ID 조회
  async getSpreadsheetIdByChat(chatId: string): Promise<string | null> {
    try {
      this.logger.log(`채팅 연결 스프레드시트 ID 조회: ${chatId}`);
      
      const spreadsheetId = await this.firebaseService.getSpreadsheetIdByChat(chatId);
      
      this.logger.log(`연결된 스프레드시트 ID: ${spreadsheetId || '없음'}`);
      return spreadsheetId;
    } catch (error) {
      this.logger.error('채팅 연결 스프레드시트 ID 조회 오류:', error);
      throw error;
    }
  }
}
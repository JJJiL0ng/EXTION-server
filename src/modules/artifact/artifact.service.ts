// src/modules/artifact/artifact.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GenerateArtifactDto, ArtifactResponseDto, ArtifactType } from './dto/generate-artifact.dto';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { CreateMessageDto, MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';
import { v4 as uuidv4 } from 'uuid';
import { ChatHistoryCacheService } from '../../common/cache/cache.service';

@Injectable()
export class ArtifactService {
  private readonly logger = new Logger(ArtifactService.name);
  private readonly openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
    private chatHistoryCacheService: ChatHistoryCacheService,
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
      this.logger.log(`스프레드시트 ID: ${dto.spreadsheetData?.spreadsheetId || '없음'}`);

      // === 1. 채팅 세션 처리 ===
      let chatId = dto.chatId;

      if (!chatId) {
        const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);
        chatId = await this.firebaseService.createChat(dto.userId, {
          title: chatTitle,
          spreadsheetId: dto.spreadsheetData?.spreadsheetId
        });
        this.logger.log(`새 채팅 생성: ${chatId}`);
      } else {
        const existingChat = await this.firebaseService.getChat(chatId);
        if (!existingChat) {
          const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);
          await this.firebaseService.createChatWithId(dto.userId, chatId, {
            title: chatTitle,
            spreadsheetId: dto.spreadsheetData?.spreadsheetId
          });
          this.logger.log(`Firebase에 채팅이 없어서 새로 생성: ${chatId}`);
        } else {
          if (existingChat.userId !== dto.userId) {
            throw new BadRequestException('채팅 접근 권한이 없습니다.');
          }
          this.logger.log(`기존 채팅 사용: ${chatId}`);
          if (!existingChat.spreadsheetId && dto.spreadsheetData?.spreadsheetId) {
            await this.firebaseService.updateChatSpreadsheetId(chatId, dto.spreadsheetData.spreadsheetId);
            this.logger.log(`기존 채팅에 스프레드시트 ID 연결: ${dto.spreadsheetData.spreadsheetId}`);
          }
        }

        const recentMessages = await this.firebaseService.getChatMessages(chatId, 5);
        const duplicateMessage = recentMessages.find(msg =>
          msg.content === dto.userInput &&
          msg.role === 'user' &&
          msg.type === 'artifact' &&
          (Date.now() - new Date(msg.timestamp).getTime()) < 30000 // 30초 이내
        );

        if (duplicateMessage) {
          this.logger.warn(`중복 요청 감지: ${dto.userInput} (최근 30초 이내)`);
          throw new BadRequestException('동일한 요청이 최근에 처리되었습니다. 잠시 후 다시 시도해주세요.');
        }
      }

      // === 2. 스프레드시트 데이터 처리 ===
      let spreadsheetMetadata: any = null;
      let activeSheetData: any = null;

      if (dto.spreadsheetData && dto.spreadsheetData.sheets.length > 0) {
        this.logger.log('프론트엔드에서 전송된 스프레드시트 데이터 사용');
        const currentSheet = dto.spreadsheetData.sheets[0];

        if (currentSheet) {
          spreadsheetMetadata = {
            fileName: dto.spreadsheetData.fileName,
            spreadsheetId: dto.spreadsheetData.spreadsheetId,
            sheets: [{
              sheetName: currentSheet.name,
              sheetIndex: currentSheet.sheetIndex || 0,
            }],
            activeSheetIndex: 0,
            totalSheets: dto.spreadsheetData.sheets.length
          };
          activeSheetData = {
            data: { rows: currentSheet.data },
            rowCount: currentSheet.data.length,
            columnCount: currentSheet.data[0].length
          };
          this.logger.log(`활성 시트 "${currentSheet.name}" 데이터 처리 완료`);
        }
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

      // 사용자 메시지를 캐시에 추가
      this.chatHistoryCacheService.addMessageToCache(chatId, {
        id: userMessageId,
        content: userMessageDto.content,
        role: userMessageDto.role,
        mode: userMessageDto.mode || MessageMode.ARTIFACT,
        timestamp: new Date(),
        sheetContext: userMessageDto.sheetContext,
      });

      const artifactType = this.determineArtifactType(dto.userInput);
      const systemPrompt = this.createSystemPrompt(dto, artifactType);
      const userPrompt = this.createUserPrompt(dto.userInput, dto);

      // 이전 대화 기록 가져오기
      const historyMessages = await this.chatHistoryCacheService.getMessagesForOpenAI(chatId);
      this.logger.log(`가져온 대화 기록: ${historyMessages.length}개`);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o', // 4o-mini 보다 4o가 더 안정적인 JSX 코드 생성
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new InternalServerErrorException('AI 응답을 받을 수 없습니다.');
      }

      const extractedCode = this.extractCodeFromResponse(aiResponse);
      if (!extractedCode) {
        throw new InternalServerErrorException('생성된 응답에서 유효한 코드를 찾을 수 없습니다.');
      }
      this.validateGeneratedCode(extractedCode);
      const dataAnalysis = this.extractExplanationFromResponse(aiResponse);

      // === 4. AI 응답 메시지 저장 ===
      const artifactId = uuidv4();
      const aiMessageDto: CreateMessageDto = {
        content: dataAnalysis || `${artifactType} 데이터 분석이 완료되었습니다.`,
        role: MessageRole.EXTION_AI,
        type: MessageType.ARTIFACT,
        mode: MessageMode.ARTIFACT,
        ...(sheetContext && { sheetContext }),
        artifactData: {
          type: artifactType,
          title: this.generateTitle(dto.userInput, artifactType),
          artifactId: artifactId,
          code: extractedCode,
          explanation: dataAnalysis || `${artifactType} 데이터 분석이 완료되었습니다.`,
        },
      };
      const aiMessageId = await this.firebaseService.createMessage(chatId, aiMessageDto);

      // AI 응답 메시지를 캐시에 추가
      this.chatHistoryCacheService.addMessageToCache(chatId, {
        id: aiMessageId,
        content: aiMessageDto.content,
        role: aiMessageDto.role,
        mode: aiMessageDto.mode || MessageMode.ARTIFACT,
        timestamp: new Date(),
        sheetContext: aiMessageDto.sheetContext,
        metadata: { artifactData: aiMessageDto.artifactData },
      });

      // === 5. 분석 카운터 증가 및 메타데이터 업데이트 ===
      await this.firebaseService.incrementAnalyticsCounter(chatId, 'artifactCount');
      if (dto.spreadsheetData?.spreadsheetId && spreadsheetMetadata) {
        this.updateSpreadsheetMetadata(chatId, dto.spreadsheetData.spreadsheetId, spreadsheetMetadata).catch(error => {
          this.logger.error('스프레드시트 메타데이터 업데이트 중 오류 (비동기):', error);
        });
      }

      // === 6. 응답 반환 ===
      const result: ArtifactResponseDto = {
        success: true,
        code: extractedCode,
        type: artifactType,
        explanation: {
          korean: dataAnalysis || `${artifactType} 데이터 분석이 완료되었습니다.`
        },
        title: this.generateTitle(dto.userInput, artifactType),
        timestamp: new Date().toISOString(),
        chatId,
        userMessageId,
        aiMessageId,
        spreadsheetMetadata: this.buildSpreadsheetMetadataResponse(spreadsheetMetadata),
      };

      this.logger.log('아티팩트 생성 성공, 프론트엔드로 응답 전송');
      return result;

    } catch (error) {
      this.logger.error('아티팩트 생성 오류:', error.stack);
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(error.message || '아티팩트 생성 중 알 수 없는 오류가 발생했습니다.');
    }
  }

  // === 시트 컨텍스트 생성 ===
  private createSheetContext(spreadsheetMetadata: any, activeSheetData: any): any {
    if (!spreadsheetMetadata || !activeSheetData) return null;
    const activeSheet = spreadsheetMetadata.sheets?.[0];
    if (!activeSheet) return null;

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
      return { hasSpreadsheet: false };
    }
    return {
      hasSpreadsheet: true,
      fileName: spreadsheetMetadata.fileName,
      totalSheets: spreadsheetMetadata.totalSheets || spreadsheetMetadata.sheets?.length || 0,
      activeSheetIndex: spreadsheetMetadata.activeSheetIndex || 0,
      sheetNames: spreadsheetMetadata.sheets?.map(sheet => sheet.sheetName) || [],
    };
  }

  // === 채팅 제목 자동 생성 ===
  private generateChatTitle(userInput: string): string {
    return userInput.substring(0, 30) + (userInput.length > 30 ? '...' : '');
  }

  // === 아티팩트 타입 결정 ===
  private determineArtifactType(userInput: string): ArtifactType {
    const input = userInput.toLowerCase();
    if (input.includes('차트') || input.includes('그래프') || input.includes('시각화')) return ArtifactType.CHART;
    if (input.includes('테이블') || input.includes('표') || input.includes('목록')) return ArtifactType.TABLE;
    return ArtifactType.ANALYSIS;
  }

  // === 시스템 프롬프트 생성 (JSX 기반) ===
  // === 시스템 프롬프트 업데이트 (GPT가 데이터를 직접 처리하도록) ===
  // === 시스템 프롬프트 업데이트 (GPT가 데이터를 직접 처리하도록) ===
private createSystemPrompt(dto: GenerateArtifactDto, artifactType: ArtifactType): string {
  return `당신은 React와 Recharts를 사용하여 모던하고 전문적인 데이터 대시보드를 생성하는 AI 전문가입니다. 사용자의 요청과 제공된 CSV 데이터를 기반으로, 하나의 독립적인 React 컴포넌트를 생성해야 합니다.

## 🚨 중요 규칙 (반드시 준수):
1. **하나의 완성된 React 함수 컴포넌트**를 생성하세요. 컴포넌트 이름은 "ComponentToRender"로 지정하세요.
2. **JSX를 직접 사용**하여 컴포넌트의 UI를 구성하세요. \`React.createElement\`는 사용하지 마세요.
3. **import 및 export 문을 절대 사용하지 마세요.** React와 Recharts 라이브러리는 이미 실행 환경에 포함되어 있습니다.
4. **제공된 CSV 데이터를 분석하여 적절한 JSON 형식으로 변환**하고, 컴포넌트 내부에 데이터를 직접 포함시키세요.
5. React Hooks(\`useState\`, \`useEffect\`, \`useMemo\`, \`useCallback\`)를 적극적으로 사용하여 인터랙티브한 기능을 구현하세요.
6. **Recharts 라이브러리**를 사용하여 데이터를 시각화하세요. \`<ResponsiveContainer>\`를 사용해서 차트를 반응형으로 만드세요.
7. **Tailwind CSS 클래스**를 \`className\` 속성에 사용하여 UI를 스타일링하세요.
8. 컴포넌트 내의 **모든 텍스트는 한국어**로 작성하세요.

## 📊 데이터 처리 가이드라인:
- **데이터 구조를 자동으로 분석**하여 헤더(컬럼명)를 식별하세요. 헤더가 없다면 적절한 컬럼명을 생성하세요.
- **첫 번째 행이 헤더인지 데이터인지 판단**하세요. 텍스트로만 구성되어 있고 나머지 행과 패턴이 다르다면 헤더일 가능성이 높습니다.
- **숫자로 보이는 데이터는 parseFloat()로 변환**하여 차트에서 올바르게 표시되도록 하세요.
- **날짜나 시간 데이터**가 있다면 적절한 형식으로 변환하세요.
- **빈 값이나 null 값은 적절히 처리**하고, 데이터 품질 문제가 있다면 정리하세요.
- **데이터 패턴을 분석**하여 가장 의미 있는 시각화 방법을 선택하세요.

## 🎨 디자인 가이드라인:
- **레이아웃**: 전체 대시보드는 \`div\`로 감싸고, 헤더, KPI 카드, 차트, 테이블 등을 배치하세요.
- **색상**: 비즈니스 환경에 적합한 색상 사용 (blue, gray, green 계열)
- **타이포그래피**: 적절한 글자 크기와 굵기로 위계 표현
- **차트 스타일**: 그리드, 툴팁, 범례 등을 활용하여 가독성 향상

## 📄 코드 구조 예시:
\`\`\`javascript
const ComponentToRender = () => {
  // 1. Raw 데이터 (실제 데이터를 여기에 복사)
  const rawData = [
    ["거래일자", "거래번호", "고객명", "제품명", "수량", "단가", "총액", "결제수단"],
    ["10-20", "TRX020", "김지원", "쿨러", "3", "30000", "90000", "현금"],
    ["10-19", "TRX019", "박신혜", "메인보드", "1", "250000", "250000", "신용카드"]
  ];
  
  // 2. 데이터 구조 분석 및 처리
  const processedData = React.useMemo(() => {
    if (rawData.length === 0) return [];
    
    // 첫 번째 행이 헤더인지 판단 (모든 값이 텍스트이고 숫자가 아닌 경우)
    const firstRow = rawData[0];
    const isFirstRowHeader = firstRow.every(cell => 
      cell && isNaN(parseFloat(cell)) && typeof cell === 'string'
    );
    
    let headers, dataRows;
    if (isFirstRowHeader) {
      headers = firstRow;
      dataRows = rawData.slice(1);
    } else {
      // 헤더가 없다면 자동 생성
      headers = firstRow.map((_, index) => \`컬럼\${index + 1}\`);
      dataRows = rawData;
    }
    
    // JSON 형식으로 변환
    return dataRows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        const value = row[index] || '';
        const numValue = parseFloat(value);
        obj[header] = !isNaN(numValue) && isFinite(numValue) && value.trim() !== '' ? numValue : value;
      });
      return obj;
    });
  }, [rawData]);

  // 3. 상태 관리
  const [activeChart, setActiveChart] = React.useState('default');

  // 4. 계산된 값들
  const totalQuantity = React.useMemo(() => {
    // 수량과 관련된 컬럼을 찾아서 합계 계산
    const quantityKeys = Object.keys(processedData[0] || {}).filter(key => 
      key.includes('수량') || key.includes('qty') || key.includes('quantity')
    );
    if (quantityKeys.length > 0) {
      return processedData.reduce((sum, item) => sum + (item[quantityKeys[0]] || 0), 0);
    }
    return 0;
  }, [processedData]);

  // 5. 렌더링
  return (
    <div className="bg-gray-50 p-6 rounded-lg font-sans">
      <h1 className="text-3xl font-bold mb-2 text-gray-800">데이터 분석 대시보드</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-lg font-semibold text-gray-500 mb-2">총 수량</h2>
          <p className="text-4xl font-bold text-blue-600">{totalQuantity.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={processedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={Object.keys(processedData[0] || {})[0]} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="수량" fill="#3B82F6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
\`\`\`

## 📝 요청사항:
- 사용자의 요청(\`${dto.userInput}\`)을 정확히 이해하고, 제공된 CSV 데이터를 분석하여 적절한 시각화를 생성하세요.
- ${artifactType === ArtifactType.CHART ? '차트 시각화에 집중하여 데이터의 특징을 가장 잘 나타내는 차트를 선택하세요.' : ''}
- ${artifactType === ArtifactType.TABLE ? '데이터를 깔끔한 테이블 형태로 보여주고 정렬, 필터링 기능을 추가하세요.' : ''}
- ${artifactType === ArtifactType.ANALYSIS ? '데이터에 대한 깊이 있는 분석과 인사이트를 제공하세요.' : ''}

## 📊 데이터 분석 결과 제공:
코드 블록 다음에, 반드시 다음 형식에 맞춰 **한국어**로 데이터 분석 결과를 상세히 제공하세요.
\`\`\`text
### 데이터 분석 결과

#### 1. 주요 지표
- **총 데이터 건수**: [숫자]
- **핵심 통계**: [평균, 총합, 최빈값 등]

#### 2. 핵심 인사이트
- [발견한 중요한 패턴이나 특징]
- [주목할만한 데이터 포인트]

#### 3. 제안
- [분석 결과 기반 추천사항]
\`\`\`
`;
}

  // === 사용자 프롬프트 생성 (Raw 데이터 포함) ===
  private createUserPrompt(userInput: string, dto: GenerateArtifactDto): string {
    let promptContent = `사용자 요청: "${userInput}"\n\n`;

    if (dto.spreadsheetData?.sheets?.[0]) {
      const currentSheet = dto.spreadsheetData.sheets[0];
      promptContent += `아래 제공된 데이터를 사용하여 요청을 처리해주세요.\n\n`;
      promptContent += `## 데이터 정보:\n`;
      promptContent += `- **시트명**: ${currentSheet.name}\n`;
      promptContent += `- **총 행 수**: ${currentSheet.data?.length || 0}개\n`;
      promptContent += `- **총 컬럼 수**: ${currentSheet.data?.[0]?.length || 0}개\n\n`;

      if (currentSheet.data?.length > 0) {
        const rawDataString = this.formatRawDataForGPT(currentSheet.data);
        promptContent += `## 실제 데이터 (Raw 형식):\n`;
        promptContent += `아래는 스프레드시트에서 추출한 원본 데이터입니다.\n`;
        promptContent += `데이터 구조를 분석하여 헤더(컬럼명)를 식별하고, 적절한 JSON 형식으로 변환해주세요.\n`;
        promptContent += `헤더가 첫 번째 행에 있을 수도 있고, 없을 수도 있으니 데이터 패턴을 보고 판단해주세요.\n\n`;
        promptContent += `\`\`\`\n${rawDataString}\n\`\`\`\n\n`;
        promptContent += `**분석 요청사항**:\n`;
        promptContent += `1. 데이터 구조를 분석하여 헤더(컬럼명) 식별\n`;
        promptContent += `2. 숫자 데이터는 적절히 number 타입으로 변환\n`;
        promptContent += `3. 날짜나 시간 데이터가 있다면 적절히 처리\n`;
        promptContent += `4. 사용자 요청에 가장 적합한 형태로 데이터 가공 및 시각화\n`;
      }
    } else {
      promptContent += `현재 제공된 데이터가 없습니다. 일반적인 답변을 생성해주세요.\n`;
    }

    return promptContent;
  }

  // === 데이터를 JSON 형식으로 변환하는 헬퍼 함수 ===
  private formatDataAsJson(rows: string[][], headers: string[]): string {
    const maxRows = 200;
    // 헤더 행(첫 번째 행) 제외하고 처리
    const dataRows = rows.slice(1); // ← 이 부분이 핵심!

    const dataObjects = dataRows.slice(0, maxRows).map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        const value = row[i];
        const numValue = parseFloat(value);
        obj[header] = !isNaN(numValue) && isFinite(numValue) && value?.trim() !== '' ? numValue : value;
      });
      return obj;
    });

    let jsonString = JSON.stringify(dataObjects, null, 2);
    if (dataRows.length > maxRows) {
      jsonString = jsonString.slice(0, -2);
      jsonString += `\n  // ... and ${dataRows.length - maxRows} more rows\n]`;
    }
    return jsonString;
  }

  // === AI 응답에서 코드 블록 추출 ===
  private extractCodeFromResponse(response: string): string | null {
    const codeBlockRegex = /```(?:javascript|jsx|js)?\n?([\s\S]*?)\n?```/;
    const match = response.match(codeBlockRegex);
    if (match && match[1]) {
      this.logger.debug('코드 블록에서 코드 추출 성공');
      return match[1].trim();
    }
    this.logger.warn('응답에서 코드 블록을 찾지 못했습니다.');
    return null;
  }
  // === Raw 데이터를 GPT가 이해하기 쉬운 형식으로 변환 ===
  // === Raw 데이터를 GPT가 분석할 수 있는 형식으로 변환 ===
  private formatRawDataForGPT(rows: string[][]): string {
    const maxRows = 100; // GPT 토큰 제한을 고려하여 조정
    const displayRows = rows.slice(0, maxRows);

    // 탭으로 구분된 형식으로 변환 (CSV보다 읽기 쉬움)
    const formattedString = displayRows.map((row, index) => {
        const rowData = row.map(cell => cell || '').join('\t');
        return `${index + 1}: ${ rowData }`;
    }).join('\n');
  
  // 데이터가 잘렸다면 알림 추가
  if (rows.length > maxRows) {
    return formattedString + `\n... (총 ${ rows.length }행 중 처음 ${ maxRows }행만 표시)`;
  }
  
  return formattedString;
}

  // === AI 응답에서 데이터 분석 설명 추출 ===
  private extractExplanationFromResponse(response: string): string {
    const parts = response.split(/```/);
    // 코드 블록 다음의 텍스트를 분석 결과로 간주
    const explanation = parts.length > 2 ? parts[2].trim() : (parts.length === 1 ? parts[0].trim() : '');

    if (explanation) {
      this.logger.debug(`데이터 분석 설명 추출 성공 (길이: ${explanation.length})`);
    } else {
      this.logger.warn('응답에서 데이터 분석 설명을 추출하지 못했습니다.');
    }
    return explanation;
  }

  // === 생성된 코드의 유효성 검증 ===
  private validateGeneratedCode(code: string): void {
    if (!code.includes('=>') || !code.includes('(') || !code.includes(')')) {
      this.logger.error('코드가 유효한 React 함수 컴포넌트 형식이 아닙니다.');
      throw new InternalServerErrorException('생성된 코드가 유효한 React 컴포넌트 형식이 아닙니다.');
    }
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      this.logger.error(`중괄호 불일치: 열기 ${openBraces}개, 닫기 ${closeBraces}개`);
      throw new InternalServerErrorException('코드의 중괄호가 올바르게 닫히지 않았습니다.');
    }
    this.logger.debug('코드 검증 완료');
  }

  // === 아티팩트 제목 생성 ===
  private generateTitle(userInput: string, artifactType: ArtifactType): string {
    const typeMap = {
      [ArtifactType.CHART]: '차트 분석',
      [ArtifactType.TABLE]: '테이블 분석',
      [ArtifactType.ANALYSIS]: '데이터 분석'
    };
    return `${typeMap[artifactType]} - ${userInput.substring(0, 20)}${userInput.length > 20 ? '...' : ''}`;
  }

  // === 스프레드시트 메타데이터 업데이트 ===
  private async updateSpreadsheetMetadata(chatId: string, spreadsheetId: string, spreadsheetMetadata: any): Promise<void> {
    try {
      await this.firebaseService.updateSpreadsheetMetadata(spreadsheetId, { ...spreadsheetMetadata, lastChatId: chatId });
      this.logger.log(`스프레드시트 메타데이터 업데이트 완료: ${spreadsheetId}`);
    } catch (error) {
      this.logger.error('스프레드시트 메타데이터 업데이트 중 오류:', error);
    }
  }
}

import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { SheetService } from '../../common/sheet/sheet.service';
import { UpdateSheetDataDto } from '../../common/sheet/dto/spreadsheet.dto';
import { CreateMessageDto, MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';
import { 
  ProcessDataDto, 
  DataFixResponseDto, 
  EditedDataDto, 
  ChangesDto,
  SpreadsheetData 
} from './dto/process-data.dto';

@Injectable()
export class DataFixService {
  private readonly logger = new Logger(DataFixService.name);
  private readonly openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
    private sheetService: SheetService
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async processData(dto: ProcessDataDto): Promise<DataFixResponseDto> {
    try {
      this.logger.log(`데이터 수정 요청: ${dto.userInput}`);
      this.logger.log(`사용자 ID: ${dto.userId}`);
      this.logger.log(`채팅 ID: ${dto.chatId || '새 채팅'}`);
      this.logger.log(`스프레드시트 ID: ${dto.spreadsheetId || '없음'}`);
      this.logger.log(`스프레드시트 데이터 내 ID: ${dto.spreadsheetData?.spreadsheetId || '없음'}`);
      
      // === 1. 채팅 세션 처리 ===
      let chatId = dto.chatId;

      if (!chatId) {
        // chatId가 전혀 없는 경우 - 새 채팅 생성
        const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);
        chatId = await this.firebaseService.createChat(dto.userId!, { 
          title: chatTitle,
          spreadsheetId: dto.spreadsheetId || dto.spreadsheetData?.spreadsheetId // 스프레드시트 ID 포함
        });
        this.logger.log(`새 채팅 생성: ${chatId}`);
        
        // 생성된 채팅에서 spreadsheetId 확인
        const createdChat = await this.firebaseService.getChat(chatId);
        this.logger.log(`✅ 새 채팅 spreadsheetId 저장 확인: ${createdChat?.spreadsheetId || '없음'}`);
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
          await this.firebaseService.createChatWithId(dto.userId!, chatId, { 
            title: chatTitle,
            spreadsheetId: dto.spreadsheetId || dto.spreadsheetData?.spreadsheetId // 스프레드시트 ID 포함
          });
          
          // 생성된 채팅에서 spreadsheetId 확인
          const createdChatWithId = await this.firebaseService.getChat(chatId);
          this.logger.log(`✅ 특정 ID 채팅 spreadsheetId 저장 확인: ${createdChatWithId?.spreadsheetId || '없음'}`);
        } else {
          // 기존 채팅 소유권 확인
          if (existingChat.userId !== dto.userId) {
            throw new BadRequestException('채팅 접근 권한이 없습니다.');
          }
          this.logger.log(`기존 채팅 사용: ${chatId}`);
          
          // 기존 채팅에 스프레드시트 ID가 없고 새로 전달된 경우 업데이트
          const newSpreadsheetId = dto.spreadsheetId || dto.spreadsheetData?.spreadsheetId;
          if (!existingChat.spreadsheetId && newSpreadsheetId) {
            await this.firebaseService.updateChatSpreadsheetId(chatId, newSpreadsheetId);
            this.logger.log(`기존 채팅에 스프레드시트 ID 연결: ${newSpreadsheetId}`);
            
            // 업데이트된 채팅에서 spreadsheetId 확인
            const updatedChat = await this.firebaseService.getChat(chatId);
            this.logger.log(`✅ 기존 채팅 spreadsheetId 업데이트 확인: ${updatedChat?.spreadsheetId || '없음'}`);
          }
        }
      }

      // 프론트엔드에서 받은 데이터 로깅
      this.logger.log('==================== 프론트엔드에서 받은 데이터 시작 ====================');
      this.logger.log(`사용자 입력: ${dto.userInput}`);
      this.logger.log(`사용자 ID: ${dto.userId}`);
      this.logger.log(`채팅 ID: ${dto.chatId}`);
      this.logger.log(`스프레드시트 ID: ${dto.spreadsheetId || '없음'}`);
      this.logger.log(`스프레드시트 데이터 내 ID: ${dto.spreadsheetData?.spreadsheetId || '없음'}`);
      this.logger.log(`타겟 시트 인덱스: ${dto.targetSheetIndex !== undefined ? dto.targetSheetIndex : '없음'}`);
      
      const spreadsheetData = dto.spreadsheetData;
      let spreadsheetMetadata: any = null;
      let activeSheetData: any = null;

      if (spreadsheetData) {
        this.logger.log('스프레드시트 데이터:');
        this.logger.log(`- 전체 시트 수: ${spreadsheetData.sheets?.length || 0}`);
        this.logger.log(`- 활성 시트: ${spreadsheetData.activeSheet || '없음'}`);
        this.logger.log(`- 파일명: ${spreadsheetData.fileName || '없음'}`);
        this.logger.log(`- 스프레드시트 ID: ${dto.spreadsheetData?.spreadsheetId || '없음'}`);
        
        if (spreadsheetData.sheets) {
          spreadsheetData.sheets.forEach((sheet, index) => {
            this.logger.log(`- 시트 ${index}: ${sheet.name}`);
            this.logger.log(`  * 행 수: ${sheet.data?.length || 0}`);
            this.logger.log(`  * 열 수: ${sheet.data[0]?.length || 0}`);
          });
        }

        // === 스프레드시트 메타데이터 구성 ===
        if (spreadsheetData.sheets && spreadsheetData.sheets.length > 0) {
          const currentSheet = spreadsheetData.sheets.find(sheet => sheet.name === spreadsheetData.activeSheet) || spreadsheetData.sheets[0];

          if (currentSheet) {
            const allData = currentSheet.data || [];
            const headers = allData.length > 0 ? allData[0] : [];
            const rows = allData.length > 1 ? allData.slice(1) : [];

            // spreadsheetMetadata 구성
            spreadsheetMetadata = {
              fileName: spreadsheetData.fileName || currentSheet.name,
              spreadsheetId: dto.spreadsheetData?.spreadsheetId, // 스프레드시트 데이터 내 ID 사용
              sheets: [{
                sheetName: currentSheet.name,
                sheetIndex: currentSheet.sheetIndex || 0,
                headers: headers
              }],
              activeSheetIndex: currentSheet.sheetIndex || 0,
              totalSheets: spreadsheetData.sheets.length
            };

            // activeSheetData 구성
            activeSheetData = {
              data: {
                rows: rows
              },
              rowCount: rows.length,
              columnCount: headers.length,
              headers: headers
            };

            // 채팅에 스프레드시트 ID가 연결되지 않은 경우 연결
            if (dto.spreadsheetData?.spreadsheetId) {
              const existingChat = await this.firebaseService.getChat(chatId);
              if (existingChat && !existingChat.spreadsheetId) {
                await this.firebaseService.updateChatSpreadsheetId(chatId, dto.spreadsheetData.spreadsheetId);
                this.logger.log(`채팅에 스프레드시트 ID 연결: ${dto.spreadsheetData.spreadsheetId}`);
                
                // 연결 후 실제 저장 확인
                const finalChat = await this.firebaseService.getChat(chatId);
                this.logger.log(`✅ 최종 채팅 spreadsheetId 연결 확인: ${finalChat?.spreadsheetId || '없음'}`);
              } else if (existingChat?.spreadsheetId) {
                this.logger.log(`✅ 채팅에 이미 spreadsheetId 존재: ${existingChat.spreadsheetId}`);
              }
            }
          }
        }
      }
      
      this.logger.log('==================== 프론트엔드에서 받은 데이터 끝 ====================');

      // === 3. 사용자 메시지 저장 ===
      const sheetContext = this.createSheetContext(spreadsheetMetadata, activeSheetData);
      const userMessageDto: CreateMessageDto = {
        content: dto.userInput,
        role: MessageRole.USER,
        type: MessageType.TEXT,
        mode: MessageMode.DATA_FIX,
        ...(sheetContext && { sheetContext }),
      };

      const userMessageId = await this.firebaseService.createMessage(chatId, userMessageDto);
      this.logger.log(`사용자 메시지 저장: ${userMessageId}`);

      // 데이터 컨텍스트 조회
      const dataContext = this.getDataContext(dto);
      
      // 디버깅을 위한 컨텍스트 로깅
      this.logger.debug('=== 데이터 컨텍스트 디버그 정보 ===');
      this.logger.debug(`컨텍스트 유형: ${this.getContextType(dto)}`);
      
      if (spreadsheetData) {
        this.logger.debug(`시트 데이터 - 전체 시트 수: ${spreadsheetData.sheets?.length || 0}`);
        this.logger.debug(`시트 데이터 - 활성 시트: ${spreadsheetData.activeSheet}`);
        spreadsheetData.sheets?.forEach((sheet, index) => {
          this.logger.debug(`시트 ${index}: ${sheet.name} (${sheet.data?.length || 0} 행)`);
          if (sheet.data) {
            this.logger.debug(`  * 전체 데이터 행 수: ${sheet.data.length}`);
          }
        });
      }
      
      this.logger.debug('=== 컨텍스트 디버그 끝 ===');

      // 시스템 프롬프트 생성
      const systemPrompt = this.createSystemPrompt(dto);

      // 사용자 프롬프트 생성 (CSV 데이터 포함)
      const userPrompt = this.createUserPrompt(dto.userInput, dto);

      // ✅ 프롬프트 크기 체크 및 로깅
      const totalPromptSize = systemPrompt.length + userPrompt.length;
      this.logger.log(`총 프롬프트 크기: ${totalPromptSize} 문자`);
      this.logger.log(`시스템 프롬프트 크기: ${systemPrompt.length} 문자`);
      this.logger.log(`사용자 프롬프트 크기: ${userPrompt.length} 문자`);

      // ✅ 프롬프트가 너무 큰 경우 경고
      if (totalPromptSize > 100000) {
        this.logger.warn(`프롬프트 크기가 큽니다: ${totalPromptSize} 문자. 응답이 제한될 수 있습니다.`);
      }

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
      this.logger.log(`헤더 수: ${(result.editedData as any)?.headers?.length}`);
      this.logger.log(`데이터 행 수: ${result.editedData?.data?.length}`);
      this.logger.log(`시트 인덱스: ${result.sheetIndex}`);
      this.logger.log(`설명: ${result.explanation}`);
      
      if (result.changes) {
        this.logger.log(`변경 유형: ${result.changes.type}`);
        this.logger.log(`변경 세부 내용: ${result.changes.details}`);
      }
      
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 끝 ====================');
      
      // === 4. AI 응답 메시지 저장 ===
      const aiResponseContent = this.formatAIResponseForMessage(result);
      const aiMessageDto: CreateMessageDto = {
        content: aiResponseContent,
        role: MessageRole.EXTION_AI,
        type: MessageType.DATA_FIX,
        mode: MessageMode.DATA_FIX,
        ...(sheetContext && { sheetContext }),
        // 데이터 수정 결과 메타데이터 추가
        metadata: {
          success: result.success,
          sheetIndex: result.sheetIndex,
          changes: result.changes,
          editedDataSummary: result.editedData ? {
            sheetName: result.editedData.sheetName,
            headerCount: (result.editedData as any).headers?.length || 0,
            dataRowCount: result.editedData.data?.length || 0
          } : null
        }
      };

      const aiMessageId = await this.firebaseService.createMessage(chatId, aiMessageDto);
      this.logger.log(`AI 응답 메시지 저장: ${aiMessageId}`);

      // === 5. 응답에 Firebase 정보 추가 ===
      const finalResult: DataFixResponseDto = {
        ...result,
        chatId,
        userMessageId,
        aiMessageId,
        spreadsheetMetadata: this.buildSpreadsheetMetadataResponse(spreadsheetMetadata)
      };
      
      // ✅ 프론트엔드 응답 후 백엔드에서 Firebase DB에 데이터 저장
      if (result.success && result.editedData && dto.userId) {
        this.saveEditedDataToFirebase(dto, result).catch(error => {
          this.logger.error('Firebase 저장 중 오류 (비동기):', error);
        });

        // 스프레드시트 메타데이터 업데이트 (양방향 참조)
        if (dto.spreadsheetData?.spreadsheetId && spreadsheetMetadata) {
          this.updateSpreadsheetMetadata(chatId, dto.spreadsheetData.spreadsheetId, spreadsheetMetadata).catch(error => {
            this.logger.error('스프레드시트 메타데이터 업데이트 중 오류 (비동기):', error);
          });
        }
      }
      
      this.logger.log('==================== Firebase 저장 완료 ====================');
      this.logger.log(`채팅 ID: ${chatId}`);
      this.logger.log(`사용자 메시지 ID: ${userMessageId}`);
      this.logger.log(`AI 메시지 ID: ${aiMessageId}`);
      this.logger.log('==================== 응답 전송 ====================');

      return finalResult;

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

  // === 채팅 제목 자동 생성 ===
  private generateChatTitle(userInput: string): string {
    const title = userInput.length > 30 ? userInput.substring(0, 30) + '...' : userInput;
    return title || '데이터 수정';
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
        fileName: undefined,
        totalSheets: undefined,
        activeSheetIndex: undefined,
        sheetNames: undefined
      };
    }

    return {
      fileName: spreadsheetMetadata.fileName,
      totalSheets: spreadsheetMetadata.totalSheets || spreadsheetMetadata.sheets?.length || 0,
      activeSheetIndex: spreadsheetMetadata.activeSheetIndex || 0,
      sheetNames: spreadsheetMetadata.sheets?.map(sheet => sheet.sheetName) || []
    };
  }

  // === AI 응답을 메시지 저장용으로 포맷팅 ===
  private formatAIResponseForMessage(result: DataFixResponseDto): string {
    let content = '';

    if (result.success && result.editedData) {
      content += `데이터 수정이 완료되었습니다.\n\n`;
      content += `시트명: ${result.editedData.sheetName}\n`;
      content += `수정된 데이터: ${result.editedData.data?.length || 0}행, ${result.editedData.data[0]?.length || 0}열\n`;
      
      if (result.changes) {
        content += `변경 유형: ${result.changes.type}\n`;
        content += `변경 내용: ${result.changes.details}\n`;
      }
      
      if (result.explanation) {
        content += `\n설명:\n${result.explanation}`;
      }
    } else {
      content = result.error || '데이터 수정 중 오류가 발생했습니다.';
    }

    return content;
  }

  // ✅ getDataContext 메서드 수정 - fullData 우선 사용
  private getDataContext(dto: ProcessDataDto): any {
    const spreadsheetData = dto.spreadsheetData;
    
    if (spreadsheetData && spreadsheetData.sheets && spreadsheetData.sheets.length > 0) {
      // 활성 시트 찾기
      const activeSheet = spreadsheetData.sheets.find(sheet => sheet.name === spreadsheetData.activeSheet) || spreadsheetData.sheets[0];
      
      if (activeSheet) {
        const data = activeSheet.data || [];
        const headers = data.length > 0 ? data[0] : [];
        const rows = data.length > 1 ? data.slice(1) : [];

        return {
          sheetName: activeSheet.name,
          headers: headers,
          data: rows,
          rowCount: rows.length,
          columnCount: headers.length,
          sheetIndex: activeSheet.sheetIndex || 0
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
    if (dto.spreadsheetData) return 'SpreadsheetData';
    return 'None';
  }

  private createSystemPrompt(dto: ProcessDataDto): string {
    const spreadsheetData = dto.spreadsheetData;
    const hasExistingData = !!(spreadsheetData && spreadsheetData.sheets.length > 0);
    const isMultiSheet = (spreadsheetData?.sheets?.length || 0) > 1;
    
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
10. 제공된 실제 데이터를 기준으로 작업하세요
11. 실제 데이터의 값들을 정확히 확인하고 처리하세요
12. 전체 데이터를 기준으로 작업하세요
13. 사용자에게 보여질 설명(explanation)과 변경 내용(details)은 마크다운 형식을 사용하지 말고 일반 텍스트로 작성하세요.

## 변경 유형 설명
1. sort: 데이터 정렬 (특정 열 기준 오름차순/내림차순)
2. filter: 특정 조건에 맞는 행만 필터링
3. modify: 데이터 값 수정 (변경, 삭제, 추가)
4. transform: 데이터 구조 변경 (열 계산, 형식 변환 등)

## 기존 데이터 컨텍스트
${hasExistingData ? `
이미 존재하는 실제 데이터가 있습니다:
${isMultiSheet ? `
- 다중 시트 환경
- 총 시트 수: ${spreadsheetData?.sheets?.length || 0}
- 활성 시트: ${spreadsheetData?.activeSheet || '없음'}
` : `
- 단일 시트 환경
- 시트명: ${spreadsheetData?.sheets?.[0]?.name || '없음'}
`}
- 실제 데이터가 제공되어 정밀한 처리가 가능합니다
- 모든 행을 대상으로 정확한 데이터 조작을 수행하세요
` : `
데이터가 없습니다. 사용자에게 먼저 데이터를 업로드하도록 안내해야 합니다.
`}
`;
  }

  // ✅ createUserPrompt 메서드 수정 - CSV 데이터 포함
  private createUserPrompt(userInput: string, dto: ProcessDataDto): string {
    const context = this.getDataContext(dto);
    const fullDataInfo = this.extractFullDataInfo(dto);
    const headers = this.extractHeaders(dto);
    
    // 데이터 존재 여부
    const spreadsheetData = dto.spreadsheetData;
    const hasExistingData = !!(spreadsheetData && spreadsheetData.sheets.length > 0);
    
    // ✅ CSV 데이터 추출 및 제한
    const csvData = this.extractCsvData(dto);
    
    let prompt = `사용자 요청: "${userInput}"\n\n`;
    
    if (hasExistingData) {
      prompt += `## 현재 데이터 정보:\n`;
      
      if (context) {
        prompt += `- **시트명**: ${context.sheetName || '알 수 없음'}\n`;
        prompt += `- **컬럼**: ${headers.length > 0 ? headers.join(', ') : '없음'}\n`;
        prompt += `- **전체 데이터 행 수**: ${context.rowCount || (context.data ? context.data.length - 1 : 0)}\n`;
        prompt += `- **전체 데이터 열 수**: ${context.columnCount || headers.length}\n\n`;
        
        if (fullDataInfo) {
          prompt += `## 전체 데이터 정보:\n${fullDataInfo}\n\n`;
        }
        
        if (csvData) {
          prompt += `## ✅ 실제 데이터 (CSV 형식):\n\`\`\`\n${csvData}\n\`\`\`\n\n`;
          prompt += `**중요**: 위의 실제 데이터를 바탕으로 정확한 데이터 처리를 수행해주세요.\n`;
          prompt += `- 각 행과 열의 실제 값들을 확인하여 작업하세요\n`;
          prompt += `- 정렬, 필터링, 수정 시 실제 데이터 값을 기준으로 하세요\n`;
          prompt += `- 중복 데이터나 특정 조건을 확인할 때 실제 값을 참조하세요\n\n`;
        } else {
          prompt += `현재 데이터 정보를 추출할 수 없습니다.\n\n`;
        }
      } else {
        prompt += `현재 데이터 정보를 추출할 수 없습니다.\n\n`;
      }
    } else {
      prompt += `## 현재 데이터가 없습니다. 데이터를 먼저 생성하도록 사용자에게 안내해주세요.\n\n`;
    }
    
    prompt += `## 요청 분석\n`;
    prompt += `사용자의 요청에 따라 **실제 제공된 전체 데이터**를 대상으로 수정, 정렬, 필터링 또는 변환하세요.\n`;
    prompt += `다음 네 가지 작업 중 하나를 수행해야 합니다:\n\n`;
    prompt += `1. 정렬(sort): 특정 열을 기준으로 데이터 정렬\n`;
    prompt += `2. 필터링(filter): 조건에 맞는 데이터만 선택\n`;
    prompt += `3. 수정(modify): 데이터 값을 변경하거나 열/행 추가/삭제\n`;
    prompt += `4. 변환(transform): 데이터 구조나 형식 변환\n\n`;
    prompt += `**중요**: 샘플 데이터가 아닌 실제 전체 데이터를 기준으로 작업하세요.\n\n`;
    prompt += `수정된 시트 이름, 헤더, 데이터 배열, 변경 유형(type), 그리고 세부 내용(details)을 포함한 JSON을 반환하세요.\n\n`;
    prompt += `반드시 표준 JSON 형식으로 응답하고, 마크다운이나 추가 설명은 포함하지 마세요.`;
    
    return prompt;
  }

  // ✅ CSV 데이터 추출 메서드 수정 - fullData 우선 처리
  private extractCsvData(dto: ProcessDataDto): string {
    const spreadsheetData = dto.spreadsheetData;
    
    if (spreadsheetData && spreadsheetData.sheets && spreadsheetData.sheets.length > 0) {
      const activeSheet = spreadsheetData.sheets.find(sheet => sheet.name === spreadsheetData.activeSheet) || spreadsheetData.sheets[0];
      
      if (activeSheet && activeSheet.data) {
        let csvData = activeSheet.data.map(row => row.join(',')).join('\n');
        
        // ✅ CSV 데이터 크기 제한 (너무 큰 경우 잘라내기)
        const maxCsvLength = 50000; // 최대 50,000 문자
        
        if (csvData.length > maxCsvLength) {
          // 헤더는 유지하고 데이터 행만 제한
          const lines = csvData.split('\n');
          const header = lines[0];
          const dataLines = lines.slice(1);
          
          // 헤더 + 제한된 데이터 행들
          let limitedCsv = header + '\n';
          let currentLength = limitedCsv.length;
          
          for (const line of dataLines) {
            if (currentLength + line.length + 1 > maxCsvLength) {
              limitedCsv += '\n... (데이터가 더 있습니다. 총 ' + lines.length + '행)';
              break;
            }
            limitedCsv += line + '\n';
            currentLength += line.length + 1;
          }
          
          this.logger.log(`CSV 데이터 크기 제한: ${csvData.length} → ${limitedCsv.length} 문자`);
          return limitedCsv;
        }
        
        return csvData;
      }
    }
    
    return '';
  }

  // ✅ 전체 데이터 정보 추출 메서드 수정
  private extractFullDataInfo(dto: ProcessDataDto): string {
    const spreadsheetData = dto.spreadsheetData;
    
    if (spreadsheetData && spreadsheetData.sheets && spreadsheetData.sheets.length > 0) {
      const activeSheet = spreadsheetData.sheets.find(sheet => sheet.name === spreadsheetData.activeSheet) || spreadsheetData.sheets[0];
      
      if (activeSheet) {
        const hasFullData = activeSheet.data && activeSheet.data.length > 0;
        const rowCount = activeSheet.data ? activeSheet.data.length : 0;
        
        return `- **전체 데이터 행 수**: ${rowCount}
- **전체 데이터 사용 가능**: ${hasFullData ? '예' : '아니오'}
- **CSV 데이터 제공**: ${hasFullData ? '예' : '아니오'}
- **데이터 처리 범위**: ${rowCount > 1000 ? '대용량 데이터 (1000행 이상)' : '일반 데이터'}`;
      }
    }
    
    return '';
  }

  // ✅ extractHeaders 메서드 수정
  private extractHeaders(dto: ProcessDataDto): string[] {
    const spreadsheetData = dto.spreadsheetData;
    
    if (spreadsheetData && spreadsheetData.sheets && spreadsheetData.sheets.length > 0) {
      const activeSheet = spreadsheetData.sheets.find(sheet => sheet.name === spreadsheetData.activeSheet) || spreadsheetData.sheets[0];
      
      if (activeSheet && activeSheet.data && activeSheet.data.length > 0) {
        return activeSheet.data[0];
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
      const sheetIndex = typeof parsedData.sheetIndex === 'number' 
        ? parsedData.sheetIndex 
        : null;
      
      return {
        success: true,
        editedData: {
          sheetName: parsedData.sheetName,
          headers: parsedData.headers.map(header => String(header)),
          data: cleanedData
        } as any,
        sheetIndex,
        explanation: parsedData.explanation || '데이터가 성공적으로 수정되었습니다.',
        changes
      };
      
    } catch (error) {
      this.logger.error('응답 데이터 추출 오류:', error);
      throw new InternalServerErrorException(`데이터 추출 실패: ${error.message}`);
    }
  }

  // ✅ Firebase DB에 변경된 시트 데이터 저장
  private async saveEditedDataToFirebase(dto: ProcessDataDto, result: DataFixResponseDto): Promise<void> {
    try {
      this.logger.log('==================== Firebase DB 저장 시작 ====================');
      
      // 필수 데이터 확인
      if (!dto.userId) {
        this.logger.warn('사용자 ID가 없어 Firebase 저장을 건너뜁니다.');
        return;
      }
      
      if (!result.editedData || !result.editedData.data) {
        this.logger.warn('변경된 데이터가 없어 Firebase 저장을 건너뜁니다.');
        return;
      }

      // 스프레드시트 ID 추출
      const spreadsheetId = this.extractSpreadsheetId(dto);
      if (!spreadsheetId) {
        this.logger.warn('스프레드시트 ID가 없어 Firebase 저장을 건너뜁니다.');
        return;
      }

      // 시트 인덱스 추출
      const sheetIndex = this.extractSheetIndex(dto, result);
      if (sheetIndex === null || sheetIndex === undefined) {
        this.logger.warn('시트 인덱스가 없어 Firebase 저장을 건너뜁니다.');
        return;
      }

      // ✅ 프론트에서 보낸 정보와 실제 사용 정보 비교 로그
      this.logger.log(`==================== Firebase 저장 정보 분석 ====================`);
      this.logger.log(`📤 프론트에서 전송한 정보:`);
      this.logger.log(`  - spreadsheetId: ${dto.spreadsheetData?.fileName || '없음'}`);
      
      this.logger.log(`📍 실제 사용될 정보:`);
      this.logger.log(`  - 사용자 ID: ${dto.userId}`);
      this.logger.log(`  - 스프레드시트 ID: ${spreadsheetId}`);
      this.logger.log(`  - 시트 인덱스: ${sheetIndex}`);
      this.logger.log(`  - 시트명: ${result.editedData.sheetName}`);
      this.logger.log(`  - 헤더 수: ${(result.editedData as any).headers.length}`);
      this.logger.log(`  - 데이터 행 수: ${result.editedData.data.length}`);
      
      // ✅ 일치성 검증
      if (dto.spreadsheetData?.fileName && dto.spreadsheetData.fileName !== spreadsheetId) {
        this.logger.warn(`⚠️ 스프레드시트 ID 불일치: 프론트(${dto.spreadsheetData.fileName}) ≠ 사용(${spreadsheetId})`);
      }

      // UpdateSheetDataDto 구성
      const updateDto: UpdateSheetDataDto = {
        spreadsheetId,
        sheetIndex,
        data: {
          headers: (result.editedData as any).headers,
          rows: result.editedData.data,
          rawData: result.editedData.data // rawData와 rows 동일하게 설정
        },
        // 기존 formulas와 computedData는 유지 (선택사항)
        formulas: undefined,
        computedData: undefined
      };

      // SheetService를 통해 시트 데이터 업데이트
      await this.sheetService.updateSheetData(dto.userId, updateDto);

      this.logger.log('✅ Firebase DB 저장 완료');
      this.logger.log('==================== Firebase DB 저장 끝 ====================');

    } catch (error) {
      this.logger.error('Firebase DB 저장 오류:', error);
      throw error;
    }
  }

  // 스프레드시트 ID 추출 헬퍼 메서드
  private extractSpreadsheetId(dto: ProcessDataDto): string | null {
    return dto.spreadsheetId || dto.spreadsheetData?.spreadsheetId || null;
  }

  // 시트 인덱스 추출 헬퍼 메서드
  private extractSheetIndex(dto: ProcessDataDto, result: DataFixResponseDto): number | null {
    if (result && typeof result.sheetIndex === 'number') {
      return result.sheetIndex;
    }
    
    // 스프레드시트 데이터에서 활성 시트의 인덱스 찾기
    if (dto.spreadsheetData?.sheets) {
      const activeSheetName = dto.spreadsheetData.activeSheet || result?.editedData?.sheetName;
      if (activeSheetName) {
        const sheetIndex = dto.spreadsheetData.sheets.findIndex(sheet => sheet.name === activeSheetName);
        return sheetIndex >= 0 ? sheetIndex : 0;
      }
    }
    
    return 0; // 기본값
  }

  // 스프레드시트 메타데이터 업데이트 (양방향 참조)
  private async updateSpreadsheetMetadata(chatId: string, spreadsheetId: string, spreadsheetMetadata: any): Promise<void> {
    try {
      this.logger.log('==================== 스프레드시트 메타데이터 업데이트 시작 ====================');
      
      // 스프레드시트 메타데이터 업데이트
      await this.firebaseService.updateSpreadsheetMetadata(spreadsheetId, spreadsheetMetadata);

      this.logger.log('✅ 스프레드시트 메타데이터 업데이트 완료');
      this.logger.log('==================== 스프레드시트 메타데이터 업데이트 끝 ====================');

    } catch (error) {
      this.logger.error('스프레드시트 메타데이터 업데이트 중 오류:', error);
      throw error;
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
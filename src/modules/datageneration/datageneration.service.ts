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
import { FirebaseService } from '../../common/firebase/firebase.service';
import { CreateMessageDto, MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DataGenerationService {
  private readonly logger = new Logger(DataGenerationService.name);
  private readonly openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async generateData(dto: GenerateDataDto): Promise<DataGenerationResponseDto> {
    try {
      this.logger.log(`데이터 생성 요청: ${dto.userInput}`);
      this.logger.log(`사용자 ID: ${dto.userId}`);
      this.logger.log(`채팅 ID: ${dto.chatId || '새 채팅'}`);

      // === 1. 채팅 세션 처리 ===
      let chatId = dto.chatId;

      if (!chatId) {
        // chatId가 전혀 없는 경우 - 새 채팅 생성
        const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);
        chatId = await this.firebaseService.createChat(dto.userId || `guest_${uuidv4()}`, { 
          title: chatTitle
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
          await this.firebaseService.createChatWithId(dto.userId || `guest_${uuidv4()}`, chatId, { 
            title: chatTitle
          });
        } else {
          // 기존 채팅 소유권 확인
          if (dto.userId) {
            // 로그인한 사용자는 자신의 채팅에만 접근할 수 있습니다.
            if (existingChat.userId !== dto.userId) {
              throw new BadRequestException('채팅 접근 권한이 없습니다.');
            }
          } else {
            // 비로그인 사용자는 게스트 채팅에만 접근할 수 있습니다.
            if (!existingChat.userId.startsWith('guest_')) {
              throw new BadRequestException('로그인이 필요한 채팅입니다.');
            }
          }
          this.logger.log(`기존 채팅 사용: ${chatId}`);
        }
      }

      // 프론트엔드에서 받은 데이터 로깅
      this.logger.log('==================== 프론트엔드에서 받은 데이터 시작 ====================');
      this.logger.log(`사용자 입력: ${dto.userInput}`);
      this.logger.log(`사용자 ID: ${dto.userId}`);
      this.logger.log(`채팅 ID: ${dto.chatId}`);

      // === 프론트엔드 호환성 체크 ===
      if (dto.spreadsheetData) {
        this.logger.log('🆕 프론트엔드 새 구조 (spreadsheetData) 감지');
        this.logger.log(`- 파일명: ${dto.spreadsheetData.fileName || '없음'}`);
        this.logger.log(`- 활성 시트: ${dto.spreadsheetData.activeSheet}`);
        this.logger.log(`- 전체 시트 수: ${dto.spreadsheetData.sheets?.length || 0}`);
        this.logger.log(`- SpreadsheetId: ${dto.spreadsheetData.spreadsheetId || '없음'}`);
        
        if (dto.spreadsheetData.sheets) {
          dto.spreadsheetData.sheets.forEach((sheet, index) => {
            this.logger.log(`- 시트 ${index}: ${sheet.name}`);
            this.logger.log(`  * 행 수: ${sheet.data?.length || 0}`);
            this.logger.log(`  * 열 수: ${sheet.headers?.length || 0}`);
          });
        }
      }

      if (dto.extendedSheetContext) {
        this.logger.log('📋 기존 구조 (extendedSheetContext) 감지');
        this.logger.log(`- 시트명: ${dto.extendedSheetContext.sheetName}`);
        this.logger.log(`- 시트 인덱스: ${dto.extendedSheetContext.sheetIndex}`);
        this.logger.log(`- 전체 시트 수: ${dto.extendedSheetContext.totalSheets}`);
        this.logger.log(`- 헤더 수: ${dto.extendedSheetContext.headers?.length || 0}`);
        if (dto.extendedSheetContext.sampleData) {
          this.logger.log(`- 샘플 데이터 행 수: ${dto.extendedSheetContext.sampleData.length}`);
        }
      }

      // ✅ 우선순위: spreadsheetData > extendedSheetContext > sheetsData > currentData
      const sheetsData = dto.sheetsData || dto.currentData;
      if (sheetsData) {
        this.logger.log('📊 기존 구조 (sheetsData/currentData) 감지');
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
            this.logger.log(`  * CSV 데이터 크기: ${sheet.csv?.length || 0} 문자`);
          });
        }
      }

      this.logger.log('==================== 프론트엔드에서 받은 데이터 끝 ====================');

      // === 2. 사용자 메시지 저장 ===
      const sheetContext = this.createSheetContext(dto);
      const userMessageDto: CreateMessageDto = {
        content: dto.userInput,
        role: MessageRole.USER,
        type: MessageType.DATA_GENERATION,
        mode: MessageMode.DATA_GENERATION,
        ...(sheetContext && { sheetContext }),
      };

      const userMessageId = await this.firebaseService.createMessage(chatId, userMessageDto);
      this.logger.log(`사용자 메시지 저장: ${userMessageId}`);

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
          if (sheet.csv) {
            this.logger.debug(`  * CSV 데이터 크기: ${sheet.csv.length} 문자`);
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
        temperature: 0.3,
        max_tokens: 10000,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (!aiResponse) {
        throw new InternalServerErrorException('AI 응답을 받을 수 없습니다.');
      }

      // 응답에서 데이터 추출
      const result = this.extractDataFromResponse(aiResponse, dto);
      
      // === 3. 새로운 시트 Firebase에 저장 (성공한 경우에만) ===
      let spreadsheetId: string | undefined;
      if (result.success && result.editedData && dto.userId) {
        try {
          spreadsheetId = await this.saveNewSheetToFirebase(dto.userId, result.editedData, result.sheetIndex);
          
          // 생성된 스프레드시트 ID를 채팅에 연결
          if (spreadsheetId) {
            const existingChat = await this.firebaseService.getChat(chatId);
            if (existingChat) {
              await this.firebaseService.updateChatSpreadsheetId(chatId, spreadsheetId);
              this.logger.log(`채팅에 생성된 스프레드시트 ID 연결: ${spreadsheetId}`);
              
              // 연결 후 실제 저장 확인
              const updatedChat = await this.firebaseService.getChat(chatId);
              this.logger.log(`✅ 새 스프레드시트 ID 연결 확인: ${updatedChat?.spreadsheetId || '없음'}`);
            }
            
            // 스프레드시트 메타데이터 업데이트 (양방향 참조)
            await this.updateSpreadsheetMetadata(chatId, spreadsheetId, result.editedData);
          }
        } catch (saveError) {
          this.logger.error('시트 저장 오류 (응답은 유지):', saveError);
          // 시트 저장 실패해도 응답은 반환
        }
      }

      // === 4. AI 응답 메시지 저장 ===
      const aiResponseMessage = result.success 
        ? `데이터 생성이 완료되었습니다.\n\n${result.explanation || ''}`
        : `데이터 생성 중 오류가 발생했습니다: ${result.error}`;

      const aiMessageDto: CreateMessageDto = {
        content: aiResponseMessage,
        role: MessageRole.EXTION_AI,
        type: MessageType.DATA_GENERATION,
        mode: MessageMode.DATA_GENERATION,
        ...(sheetContext && { sheetContext }),
        ...(result.success && result.editedData && {
          dataChangeInfo: {
            changeType: 'generation' as const,
            affectedSheets: [result.sheetIndex || 0],
            rowsChanged: result.editedData.data.length,
            columnsChanged: result.editedData.headers.length,
            summary: `새 시트 "${result.editedData.sheetName}" 생성 (${result.editedData.data.length}행 ${result.editedData.headers.length}열)`
          }
        })
      };

      const aiMessageId = await this.firebaseService.createMessage(chatId, aiMessageDto);
      this.logger.log(`AI 응답 메시지 저장: ${aiMessageId}`);

      // === 5. 응답에 채팅 정보 추가 ===
      const finalResult: DataGenerationResponseDto = {
        ...result,
        chatId,
        userMessageId,
        aiMessageId,
        timestamp: new Date().toISOString(),
        ...(spreadsheetId && { spreadsheetId }),
      };
      
      // 전체 응답 데이터 로깅
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 시작 ====================');
      this.logger.log(`성공 여부: ${finalResult.success}`);
      this.logger.log(`채팅 ID: ${finalResult.chatId}`);
      this.logger.log(`사용자 메시지 ID: ${finalResult.userMessageId}`);
      this.logger.log(`AI 메시지 ID: ${finalResult.aiMessageId}`);
      this.logger.log(`스프레드시트 ID: ${finalResult.spreadsheetId || '저장 안됨'}`);
      this.logger.log(`시트명: ${finalResult.editedData?.sheetName}`);
      this.logger.log(`헤더 수: ${finalResult.editedData?.headers?.length}`);
      this.logger.log(`데이터 행 수: ${finalResult.editedData?.data?.length}`);
      this.logger.log(`시트 인덱스: ${finalResult.sheetIndex}`);
      this.logger.log(`설명: ${finalResult.explanation}`);
      this.logger.log('==================== 프론트엔드 전송 응답 데이터 끝 ====================');
      
      return finalResult;

    } catch (error) {
      this.logger.error('데이터 생성 오류:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      const errorResult: DataGenerationResponseDto = {
        success: false,
        error: error.message || '데이터 생성 중 오류가 발생했습니다.',
        timestamp: new Date().toISOString(),
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
    return title || '새로운 데이터 생성';
  }

  // === 시트 컨텍스트 생성 ===
  private createSheetContext(dto: GenerateDataDto): any {
    // 우선순위: spreadsheetData > extendedSheetContext > sheetsData > currentData
    
    // 1. 프론트엔드 새 구조 (spreadsheetData) 우선 처리
    if (dto.spreadsheetData && dto.spreadsheetData.sheets && dto.spreadsheetData.sheets.length > 0) {
      const activeSheet = dto.spreadsheetData.sheets.find(sheet => sheet.name === dto.spreadsheetData!.activeSheet) || dto.spreadsheetData.sheets[0];
      
      if (activeSheet) {
        return {
          sheetIndex: activeSheet.sheetIndex || 0,
          sheetName: activeSheet.name,
          affectedCells: [],
          totalRows: activeSheet.data?.length || 0,
          totalColumns: activeSheet.headers?.length || 0,
          headers: activeSheet.headers || []
        };
      }
    }

    // 2. 기존 extendedSheetContext 처리
    if (dto.extendedSheetContext) {
      return {
        sheetIndex: dto.extendedSheetContext.sheetIndex,
        sheetName: dto.extendedSheetContext.sheetName,
        affectedCells: [],
        totalRows: 0,
        totalColumns: dto.extendedSheetContext.headers?.length || 0,
        headers: dto.extendedSheetContext.headers?.map(h => h.name) || []
      };
    }

    // 3. 기존 sheetsData/currentData 처리
    const sheetsData = dto.sheetsData || dto.currentData;
    if (sheetsData && sheetsData.sheets && sheetsData.sheets.length > 0) {
      const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet);
      
      if (activeSheet) {
        return {
          sheetIndex: activeSheet.metadata?.sheetIndex || 0,
          sheetName: activeSheet.name,
          affectedCells: [],
          totalRows: activeSheet.metadata?.rowCount || 0,
          totalColumns: activeSheet.metadata?.columnCount || 0,
          headers: activeSheet.metadata?.headers || []
        };
      }
    }

    return null;
  }

  // === 새로운 시트를 Firebase에 저장 ===
  private async saveNewSheetToFirebase(
    userId: string, 
    editedData: EditedDataDto, 
    sheetIndex?: number
  ): Promise<string | undefined> {
    try {
      this.logger.log(`Firebase에 새 시트 저장 시작: ${editedData.sheetName}`);

      // 시트 데이터 구성
      const sheetData = {
        name: editedData.sheetName,
        headers: editedData.headers,
        data: editedData.data,
        metadata: {
          rowCount: editedData.data.length,
          columnCount: editedData.headers.length,
          sheetIndex: sheetIndex || 0,
          createdAt: new Date().toISOString(),
          source: 'data_generation'
        }
      };

      // Firebase에 시트 저장
      const spreadsheetId = await this.firebaseService.saveSheet(userId, sheetData);
      
      this.logger.log(`Firebase 시트 저장 완료: ${editedData.sheetName}`);
      return spreadsheetId;
    } catch (error) {
      this.logger.error('Firebase 시트 저장 실패:', error);
      throw error;
    }
  }

  // ✅ getDataContext 메서드 수정 - 프론트엔드 호환성 추가
  private getDataContext(dto: GenerateDataDto): any {
    // 우선순위: spreadsheetData > extendedSheetContext > sheetsData > currentData
    
    // 1. 프론트엔드 새 구조 (spreadsheetData) 우선 처리
    if (dto.spreadsheetData && dto.spreadsheetData.sheets && dto.spreadsheetData.sheets.length > 0) {
      this.logger.debug('🆕 spreadsheetData 구조 사용');
      
      // 활성 시트 찾기
      const activeSheet = dto.spreadsheetData.sheets.find(sheet => sheet.name === dto.spreadsheetData!.activeSheet) || dto.spreadsheetData.sheets[0];
      
      if (activeSheet) {
        return {
          sheetName: activeSheet.name,
          headers: activeSheet.headers?.map((name, index) => ({
            column: String.fromCharCode(65 + index),
            name
          })) || [],
          data: activeSheet.data || [],
          rowCount: activeSheet.data?.length || 0,
          columnCount: activeSheet.headers?.length || 0,
          sheetIndex: activeSheet.sheetIndex || 0,
          // 프론트엔드 구조 표시
          sourceType: 'spreadsheetData'
        };
      }
    }
    
    // 2. 기존 extendedSheetContext 처리
    if (dto.extendedSheetContext) {
      this.logger.debug('📋 extendedSheetContext 구조 사용');
      return {
        ...dto.extendedSheetContext,
        sourceType: 'extendedSheetContext'
      };
    }
    
    // 3. 기존 sheetsData/currentData 처리
    const sheetsData = dto.sheetsData || dto.currentData;
    if (sheetsData && sheetsData.sheets && sheetsData.sheets.length > 0) {
      this.logger.debug('📊 sheetsData/currentData 구조 사용');
      
      // 활성 시트 찾기
      const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet);
      
      if (activeSheet) {
        return {
          sheetName: activeSheet.name,
          headers: activeSheet.metadata?.headers?.map((name, index) => ({
            column: String.fromCharCode(65 + index),
            name
          })) || [],
          // ✅ fullData 우선 사용, 없으면 CSV 파싱, 둘 다 없으면 빈 배열
          data: activeSheet.metadata?.fullData || 
                (activeSheet.csv ? this.parseCsvToArray(activeSheet.csv) : []),
          // ✅ 원본 CSV 데이터 (있는 경우에만)
          csvData: activeSheet.csv || '',
          // ✅ 추가 메타데이터
          rowCount: activeSheet.metadata?.rowCount || 0,
          columnCount: activeSheet.metadata?.columnCount || 0,
          sheetIndex: activeSheet.metadata?.sheetIndex || 0,
          sourceType: 'sheetsData'
        };
      }
    }
    
    this.logger.debug('❌ 사용 가능한 데이터 구조 없음');
    return null;
  }

  private parseCsvToArray(csv: string): string[][] {
    if (!csv) return [[]];
    
    // 간단한 CSV 파싱 로직
    return csv.split('\n').map(line => line.split(','));
  }

  // ✅ getContextType 메서드 수정 - 프론트엔드 호환성 추가
  private getContextType(dto: GenerateDataDto): string {
    if (dto.spreadsheetData) return 'SpreadsheetData (프론트엔드 새 구조)';
    if (dto.extendedSheetContext) return 'ExtendedSheetContext';
    if (dto.sheetsData) return 'SheetsData';
    if (dto.currentData) return 'CurrentData (Legacy)';
    return 'None';
  }

  private createSystemPrompt(dto: GenerateDataDto): string {
    // 데이터 존재 여부 체크 - 우선순위 적용
    const hasSpreadsheetData = !!(dto.spreadsheetData && dto.spreadsheetData.sheets.length > 0);
    const hasExtendedContext = !!dto.extendedSheetContext;
    const sheetsData = dto.sheetsData || dto.currentData;
    const hasSheetsData = !!(sheetsData && sheetsData.sheets.length > 0);
    
    const hasExistingData = hasSpreadsheetData || hasExtendedContext || hasSheetsData;
    
    // 다중 시트 여부 체크
    const isMultiSheet = (dto.spreadsheetData?.sheets?.length || 0) > 1 || 
                        (dto.extendedSheetContext?.totalSheets || 0) > 1 || 
                        (sheetsData?.sheets?.length || 0) > 1;
    
    return `당신은 스프레드시트 데이터 생성 및 가공 전문가입니다.

## 주요 역할
사용자가 다음과 같은 상황에서 도움을 요청할 때 엑셀/스프레드시트 형태의 데이터를 생성해주는 것이 목표입니다:

1. **비정형 데이터를 엑셀 형태로 변환**: 텍스트, 이미지, PDF 등에서 추출한 정보를 정리된 표 형태로 만들기
2. **목업 데이터 생성**: 개발이나 테스트용 샘플 데이터 제작
3. **수동 입력 대신 자동 생성**: 반복적이고 규칙적인 데이터를 수작업 대신 자동으로 생성
4. **데이터 구조화**: 흩어져 있는 정보를 체계적인 표 형태로 정리
5. **템플릿 생성**: 특정 목적에 맞는 데이터 양식 및 예시 데이터 제작

## 응답 형식
JSON 형식으로 응답해야 합니다:

\`\`\`json
{
  "sheetName": "생성할 데이터의 목적에 맞는 시트명",
  "headers": ["열1", "열2", "열3", ...],
  "data": [
    ["행1-열1값", "행1-열2값", "행1-열3값", ...],
    ["행2-열1값", "행2-열2값", "행2-열3값", ...],
    ...
  ],
  "sheetIndex": null,
  "explanation": "생성된 데이터에 대한 설명과 활용 방법",
  "changeLog": [
    {"type": "create", "description": "새 데이터 시트 생성"},
    {"type": "add", "row": 1, "column": 0, "after": "값", "description": "데이터 항목 추가"}
  ]
}
\`\`\`

## 데이터 생성 원칙
1. **실용성**: 실제 사용 가능한 현실적인 데이터 생성
2. **일관성**: 각 열의 데이터 형식과 패턴을 일관되게 유지
3. **완성도**: 최소 10-20개 이상의 의미 있는 데이터 행 제공
4. **한국어 우선**: 모든 텍스트는 한국어로 작성 (특별한 요청이 없는 한)
5. **형식 표준화**: 날짜(YYYY-MM-DD), 전화번호, 이메일 등 표준 형식 사용

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
12. 사용자에게 보여질 설명(explanation)은 마크다운 형식을 사용하지 말고 일반 텍스트로 작성하세요.

## 현재 상황 컨텍스트
${hasExistingData ? `
기존에 업로드된 데이터가 있습니다:
${hasSpreadsheetData ? `
- 🆕 프론트엔드 새 구조 (spreadsheetData) 감지
- 파일명: ${dto.spreadsheetData?.fileName || '없음'}
- 활성 시트: ${dto.spreadsheetData?.activeSheet || '없음'}
- 총 시트 수: ${dto.spreadsheetData?.sheets?.length || 0}
` : hasExtendedContext ? `
- 📋 확장 컨텍스트 구조
- 시트명: ${dto.extendedSheetContext?.sheetName || '없음'}
- 총 시트 수: ${dto.extendedSheetContext?.totalSheets || 0}
` : `
- 📊 기존 시트 데이터 구조
- 활성 시트: ${sheetsData?.activeSheet || '없음'}
- 총 시트 수: ${sheetsData?.sheets?.length || 0}
`}
${isMultiSheet ? '- 다중 시트 환경' : '- 단일 시트 환경'}

기존 데이터의 패턴을 분석하여 요청에 맞게 수정하거나 새로운 데이터를 추가 생성하세요.
` : `
현재 업로드된 시트가 없습니다. 사용자의 요청에 따라 새로운 데이터를 처음부터 생성해야 합니다.
사용자가 원하는 데이터의 구조와 내용을 파악하여 완전히 새로운 스프레드시트 데이터를 만들어주세요.
`}
`;
  }

  // ✅ createUserPrompt 메서드 수정 - CSV 데이터 포함
  private createUserPrompt(userInput: string, dto: GenerateDataDto): string {
    const context = this.getDataContext(dto);
    
    // 전체 데이터 정보 추출
    const fullDataInfo = this.extractFullDataInfo(dto);
    
    // 헤더 정보 안전하게 추출
    const headers = this.extractHeaders(dto);
    
    // 데이터 존재 여부
    const sheetsData = dto.sheetsData || dto.currentData;
    const hasExistingData = !!(dto.extendedSheetContext || (sheetsData?.sheets && sheetsData.sheets.length > 0));
    
    // ✅ CSV 데이터 추출 및 제한
    const csvData = this.extractCsvData(dto);
    
    return `**사용자 요청**: "${userInput}"

${hasExistingData ? `
## 기존 데이터 참고 정보:
${context ? `
- **시트명**: ${context.sheetName || '알 수 없음'}
- **컬럼**: ${headers.length > 0 ? headers.join(', ') : '없음'}
- **데이터 행 수**: ${context.rowCount || (context.data ? context.data.length - 1 : 0)}
- **데이터 열 수**: ${context.columnCount || headers.length}

${csvData ? `
## 참고할 기존 데이터:
\`\`\`
${csvData}
\`\`\`

**참고사항**: 위 데이터의 패턴과 구조를 참고하여 새로운 요청을 처리하세요.
` : '기존 데이터 정보를 추출할 수 없습니다.'}
` : '기존 데이터 정보를 추출할 수 없습니다.'}
` : `
## 새로운 데이터 생성 요청
현재 업로드된 시트가 없으므로, 사용자의 요청에 따라 완전히 새로운 데이터를 생성해야 합니다.
`}

## 작업 안내
사용자의 요청을 분석하여 다음 중 적절한 작업을 수행하세요:

${hasExistingData ? `
### 기존 데이터 활용 시나리오:
- **데이터 확장**: 기존 패턴을 따라 더 많은 데이터 생성
- **데이터 변환**: 기존 데이터를 다른 형태로 재구성
- **데이터 수정**: 특정 조건에 따라 기존 데이터 업데이트
- **새 시트 추가**: 기존 데이터와 관련된 새로운 시트 생성
` : `
### 새로운 데이터 생성 시나리오:
- **비정형 → 정형**: 텍스트나 이미지에서 추출한 정보를 표 형태로 정리
- **목업 데이터**: 개발/테스트용 샘플 데이터 생성 (고객 목록, 제품 정보, 주문 데이터 등)
- **템플릿 제작**: 특정 업무용 양식과 예시 데이터 생성
- **자동 생성**: 규칙적인 패턴의 대량 데이터 생성 (시간표, 좌석 배치, 일정표 등)
- **데이터 구조화**: 흩어진 정보를 체계적으로 정리
`}

## 생성 가이드라인
1. **헤더 설계**: 명확하고 의미 있는 열 이름 사용
2. **데이터 품질**: 현실적이고 일관된 데이터 생성
3. **충분한 양**: 최소 10-20개 행의 의미 있는 데이터 제공
4. **한국 환경**: 한국 이름, 한국 주소, 한국 전화번호 등 현지화된 데이터
5. **표준 형식**: 날짜, 시간, 전화번호, 이메일 등 표준 형식 준수

반드시 JSON 형식으로 응답하고, 생성된 데이터의 목적과 활용 방법을 설명에 포함해주세요.`;
  }

  // ✅ CSV 데이터 추출 메서드 추가 - 프론트엔드 호환성 추가
  private extractCsvData(dto: GenerateDataDto): string {
    // 우선순위: spreadsheetData > sheetsData > currentData
    
    // 1. 프론트엔드 새 구조 (spreadsheetData) 우선 처리
    if (dto.spreadsheetData && dto.spreadsheetData.sheets && dto.spreadsheetData.sheets.length > 0) {
      const activeSheet = dto.spreadsheetData.sheets.find(sheet => sheet.name === dto.spreadsheetData!.activeSheet) || dto.spreadsheetData.sheets[0];
      
      if (activeSheet && activeSheet.headers && activeSheet.data) {
        // SimpleSheetData 구조에서 CSV 생성
        let csvData = activeSheet.headers.join(',') + '\n';
        csvData += activeSheet.data.map(row => row.join(',')).join('\n');
        
        // CSV 데이터 크기 제한
        return this.limitCsvData(csvData, activeSheet.data.length);
      }
    }
    
    // 2. 기존 sheetsData/currentData 처리
    const sheetsData = dto.sheetsData || dto.currentData;
    if (sheetsData && sheetsData.sheets && sheetsData.sheets.length > 0) {
      const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet);
      
      if (activeSheet && activeSheet.csv) {
        // 기존 CSV 데이터 사용
        return this.limitCsvData(activeSheet.csv, activeSheet.csv.split('\n').length);
      }
    }
    
    return '';
  }

  // CSV 데이터 크기 제한 헬퍼 메서드
  private limitCsvData(csvData: string, totalRows: number): string {
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
          limitedCsv += '\n... (데이터가 더 있습니다. 총 ' + totalRows + '행)';
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

  // ✅ 전체 데이터 정보 추출 메서드 수정
  private extractFullDataInfo(dto: GenerateDataDto): string {
    const sheetsData = dto.sheetsData || dto.currentData;
    
    if (sheetsData && sheetsData.sheets && sheetsData.sheets.length > 0) {
      const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet);
      
      if (activeSheet) {
        const hasFullData = activeSheet.metadata?.fullData;
        const hasCsvData = !!activeSheet.csv;
        const rowCount = activeSheet.metadata?.rowCount || 0;
        
        return `- **전체 데이터 행 수**: ${rowCount}
- **전체 데이터 사용 가능**: ${hasFullData || hasCsvData ? '예' : '아니오'}
- **CSV 데이터 제공**: ${hasCsvData ? '예' : '아니오'}
- **데이터 처리 범위**: ${rowCount > 1000 ? '대용량 데이터 (1000행 이상)' : '일반 데이터'}`;
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
          // ✅ fullData 우선 사용, 없으면 CSV 파싱
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

  // ✅ extractHeaders 메서드 수정 - 프론트엔드 호환성 추가
  private extractHeaders(dto: GenerateDataDto): string[] {
    // 우선순위: spreadsheetData > extendedSheetContext > sheetsData > currentData
    
    // 1. 프론트엔드 새 구조 (spreadsheetData) 우선 처리
    if (dto.spreadsheetData && dto.spreadsheetData.sheets && dto.spreadsheetData.sheets.length > 0) {
      const activeSheet = dto.spreadsheetData.sheets.find(sheet => sheet.name === dto.spreadsheetData!.activeSheet) || dto.spreadsheetData.sheets[0];
      
      if (activeSheet && activeSheet.headers) {
        return activeSheet.headers;
      }
    }
    
    // 2. 기존 extendedSheetContext 처리
    if (dto.extendedSheetContext) {
      return dto.extendedSheetContext.headers.map(h => h.name || h.column);
    }
    
    // 3. 기존 sheetsData/currentData 처리
    const sheetsData = dto.sheetsData || dto.currentData;
    if (sheetsData && sheetsData.sheets && sheetsData.sheets.length > 0) {
      const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet);
      
      if (activeSheet) {
        // 메타데이터의 헤더 우선 사용
        if (activeSheet.metadata?.headers) {
          return activeSheet.metadata.headers;
        }
        
        // CSV에서 헤더 추출
        if (activeSheet.csv) {
          const firstLine = activeSheet.csv.split('\n')[0];
          if (firstLine) {
            return firstLine.split(',').map(header => header.trim());
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

  // 스프레드시트 메타데이터 업데이트 (양방향 참조)
  private async updateSpreadsheetMetadata(chatId: string, spreadsheetId: string, editedData: EditedDataDto): Promise<void> {
    try {
      this.logger.log('==================== 스프레드시트 메타데이터 업데이트 시작 ====================');
      
      // 스프레드시트 메타데이터 구성
      const spreadsheetMetadata = {
        fileName: editedData.sheetName,
        spreadsheetId: spreadsheetId,
        sheets: [{
          sheetName: editedData.sheetName,
          sheetIndex: 0,
          headers: editedData.headers || []
        }],
        activeSheetIndex: 0,
        totalSheets: 1
      };

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
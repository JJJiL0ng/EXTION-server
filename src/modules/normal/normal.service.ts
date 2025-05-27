// src/modules/normalchat/normalchat.service.ts - 수정된 서비스
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { NormalChatDto, NormalChatResponseDto } from './dto/normal-chat.dto';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { CreateMessageDto, MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NormalChatService {
  private readonly logger = new Logger(NormalChatService.name);
  private readonly openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async chat(dto: NormalChatDto): Promise<NormalChatResponseDto> {
    try {
      this.logger.log(`일반 채팅 요청: ${dto.userInput}`);
      this.logger.log(`사용자 ID: ${dto.userId}`);
      this.logger.log(`채팅 ID: ${dto.chatId || '새 채팅'}`);

      // === 1. 채팅 세션 처리 ===
      let chatId = dto.chatId;
      
      // 새 채팅인 경우 생성
      if (!chatId) {
        const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);
        chatId = await this.firebaseService.createChat(dto.userId, { title: chatTitle });
        this.logger.log(`새 채팅 생성: ${chatId}`);
      } else {
        // 기존 채팅 존재 확인
        const existingChat = await this.firebaseService.getChat(chatId);
        if (!existingChat) {
          throw new BadRequestException('존재하지 않는 채팅입니다.');
        }
        if (existingChat.userId !== dto.userId) {
          throw new BadRequestException('채팅 접근 권한이 없습니다.');
        }
      }

      // === 2. 사용자 메시지 저장 ===
      const userMessageDto: CreateMessageDto = {
        content: dto.userInput,
        role: MessageRole.USER,
        type: MessageType.TEXT,
        mode: MessageMode.NORMAL,
        sheetContext: dto.extendedSheetContext ? {
          sheetIndex: dto.extendedSheetContext.sheetIndex,
          sheetName: dto.extendedSheetContext.sheetName,
        } : undefined,
      };

      const userMessageId = await this.firebaseService.createMessage(chatId, userMessageDto);
      this.logger.log(`사용자 메시지 저장: ${userMessageId}`);

      // === 3. 기존 AI 로직 수행 ===
      const aiResponse = await this.generateAIResponse(dto);

      // === 4. AI 응답 메시지 저장 ===
      const aiMessageDto: CreateMessageDto = {
        content: aiResponse,
        role: MessageRole.EXTION_AI,
        type: MessageType.TEXT,
        mode: MessageMode.NORMAL,
        sheetContext: dto.extendedSheetContext ? {
          sheetIndex: dto.extendedSheetContext.sheetIndex,
          sheetName: dto.extendedSheetContext.sheetName,
        } : undefined,
      };

      const aiMessageId = await this.firebaseService.createMessage(chatId, aiMessageDto);
      this.logger.log(`AI 응답 메시지 저장: ${aiMessageId}`);

      // === 5. 스프레드시트 메타데이터 업데이트 ===
      if (dto.sheetsData || dto.currentData) {
        const sheetsData = dto.sheetsData || dto.currentData;
        await this.firebaseService.updateSpreadsheetMetadata(chatId, {
          fileName: sheetsData?.fileName || 'Unknown',
          totalSheets: sheetsData?.sheets?.length || 0,
          activeSheetIndex: sheetsData?.sheets?.findIndex(s => s.name === sheetsData?.activeSheet) || 0,
          sheetNames: sheetsData?.sheets?.map(s => s.name) || [],
        });
      }

      // === 6. 응답 반환 ===
      const result: NormalChatResponseDto = {
        success: true,
        message: aiResponse,
        chatId,
        userMessageId,
        aiMessageId,
        timestamp: new Date().toISOString(),
        spreadsheetMetadata: dto.sheetsData ? {
          hasSpreadsheet: true,
          fileName: dto.sheetsData?.fileName || 'Unknown',
          totalSheets: dto.sheetsData?.sheets?.length || 0,
          activeSheetIndex: dto.sheetsData?.sheets?.findIndex(s => s.name === dto.sheetsData?.activeSheet) || 0,
          sheetNames: dto.sheetsData?.sheets?.map(s => s.name) || [],
          lastModifiedAt: new Date(),
        } : undefined,
      };

      this.logger.log('==================== Firebase 저장 완료 ====================');
      this.logger.log(`채팅 ID: ${chatId}`);
      this.logger.log(`사용자 메시지 ID: ${userMessageId}`);
      this.logger.log(`AI 메시지 ID: ${aiMessageId}`);
      this.logger.log('==================== 응답 전송 ====================');

      return result;

    } catch (error) {
      this.logger.error('일반 채팅 오류:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      return {
        success: false,
        message: '',
        error: error.message || '일반 채팅 중 오류가 발생했습니다.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // === 기존 AI 응답 생성 로직 분리 ===
  private async generateAIResponse(dto: NormalChatDto): Promise<string> {
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
          this.logger.log(`  * CSV 데이터 크기: ${sheet.csv?.length || 0} 문자`);
        });
      }
    }

    this.logger.log('==================== 프론트엔드에서 받은 데이터 끝 ====================');

    // 데이터 컨텍스트 조회
    const dataContext = this.getDataContext(dto);
    
    // 시스템 프롬프트 생성
    const systemPrompt = this.createSystemPrompt(dto);

    // 사용자 프롬프트 생성 (CSV 데이터 포함)
    const userPrompt = this.createUserPrompt(dto.userInput, dto);

    // ✅ 프롬프트 크기 체크 및 로깅
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

    this.logger.log(`AI 응답 생성 완료: ${aiResponse.length}자`);
    return aiResponse;
  }

  // === 채팅 제목 자동 생성 ===
  private generateChatTitle(userInput: string): string {
    // 사용자 입력을 기반으로 간단한 제목 생성
    const title = userInput.length > 30 ? userInput.substring(0, 30) + '...' : userInput;
    return title || '새로운 채팅';
  }

  // === 기존 메서드들 유지 ===
  private getDataContext(dto: NormalChatDto): any {
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
          // ✅ 원본 CSV 데이터 추가
          csvData: activeSheet.csv,
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
    return csv.split('\n').map(line => line.split(','));
  }

  // ✅ getContextType 메서드 추가
  private getContextType(dto: NormalChatDto): string {
    if (dto.extendedSheetContext) return 'ExtendedSheetContext';
    if (dto.sheetsData) return 'SheetsData';
    if (dto.currentData) return 'CurrentData (Legacy)';
    return 'None';
  }

  private createSystemPrompt(dto: NormalChatDto): string {
    const sheetsData = dto.sheetsData || dto.currentData;
    const hasExistingData = !!(dto.extendedSheetContext || (sheetsData && sheetsData.sheets.length > 0));
    const isMultiSheet = (dto.extendedSheetContext?.totalSheets || 0) > 1 || (sheetsData?.sheets?.length || 0) > 1;
    
    return `당신은 스프레드시트 데이터 분석 전문가입니다.

## 임무
사용자의 요청에 따라 스프레드시트 데이터를 분석하고 인사이트 혹은 관련 데이터를 제공해야 합니다.

## 중요 규칙
1. 모든 응답은 한국어로 작성하세요.
2. 데이터가 있는 경우, 구체적인 수치와 통계를 포함하세요.
3. 가능한 한 이해하기 쉽게 설명하세요.
4. 전문적이면서도 친근한 톤을 유지하세요.
5. 필요한 경우 추가 분석이나 제안을 포함하세요.
6. 데이터가 없는 경우 적절한 안내를 제공하세요.
7. 마크다운이 아닌 일반 텍스트로 응답하세요.
8. 전체 데이터를 기준으로 분석하세요 (샘플 데이터가 아닌)
9. ✅ 제공된 실제 CSV 데이터를 바탕으로 정확한 분석을 수행하세요.
10. ✅ 데이터의 패턴, 트렌드, 이상값 등을 구체적으로 언급하세요.

## 데이터 컨텍스트
${hasExistingData ? `
현재 분석 가능한 실제 데이터가 있습니다:
${isMultiSheet ? `
- 다중 시트 환경
- 총 시트 수: ${dto.extendedSheetContext?.totalSheets || sheetsData?.sheets?.length || 0}
- 활성 시트: ${dto.extendedSheetContext?.sheetName || sheetsData?.activeSheet || '없음'}
` : `
- 단일 시트 환경
- 시트명: ${dto.extendedSheetContext?.sheetName || sheetsData?.sheets?.[0]?.name || '없음'}
`}
- ✅ 실제 CSV 데이터가 제공되어 정밀한 분석이 가능합니다
- ✅ 모든 행과 열을 대상으로 상세 분석을 수행하세요
` : `
현재 분석할 데이터가 없습니다. 사용자에게 데이터를 업로드하도록 안내하세요.
`}`;
  }

  // ✅ createUserPrompt 메서드 수정 - CSV 데이터 포함
  private createUserPrompt(userInput: string, dto: NormalChatDto): string {
    const context = this.getDataContext(dto);
    
    // 전체 데이터 정보 추출
    const fullDataInfo = this.extractFullDataInfo(dto);
    
    // 헤더 정보 안전하게 추출
    const headers = this.extractHeaders(dto);
    
    const sheetsData = dto.sheetsData || dto.currentData;
    const hasExistingData = !!(dto.extendedSheetContext || (sheetsData?.sheets && sheetsData.sheets.length > 0));
    
    // ✅ CSV 데이터 추출 및 제한
    const csvData = this.extractCsvData(dto);
    
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

${csvData ? `
## ✅ 실제 데이터 (CSV 형식):
\`\`\`
${csvData}
\`\`\`

**중요**: 위의 실제 데이터를 바탕으로 정확한 분석을 수행해주세요.
- 각 행과 열의 실제 값들을 참조하여 분석하세요
- 데이터의 패턴, 트렌드, 통계를 구체적으로 계산하세요
- 이상값이나 특이사항이 있다면 구체적으로 언급하세요
` : ''}
` : '현재 데이터 정보를 추출할 수 없습니다.'}
` : '## 현재 데이터가 없습니다. 사용자에게 데이터 업로드를 안내하세요.'}

사용자의 요청에 대해 전문적이고 친근한 톤으로 응답해주세요.
데이터가 있는 경우 **실제 제공된 데이터**를 기준으로 구체적인 분석과 인사이트를 제공하고,
데이터가 없는 경우 적절한 안내를 제공해주세요.

**중요**: 샘플 데이터가 아닌 실제 전체 데이터를 기준으로 분석하세요.`;
  }

  // ✅ CSV 데이터 추출 메서드 추가
  private extractCsvData(dto: NormalChatDto): string {
    const sheetsData = dto.sheetsData || dto.currentData;
    
    if (sheetsData && sheetsData.sheets && sheetsData.sheets.length > 0) {
      const activeSheet = sheetsData.sheets.find(sheet => sheet.name === sheetsData.activeSheet);
      
      if (activeSheet && activeSheet.csv) {
        // ✅ CSV 데이터 크기 제한 (너무 큰 경우 잘라내기)
        const maxCsvLength = 50000; // 최대 50,000 문자
        let csvData = activeSheet.csv;
        
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
  private extractFullDataInfo(dto: NormalChatDto): string {
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

  // ✅ extractHeaders 메서드 수정
  private extractHeaders(dto: NormalChatDto): string[] {
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
}
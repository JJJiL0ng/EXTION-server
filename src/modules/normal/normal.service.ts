// src/modules/normalchat/normalchat.service.ts - 수정된 서비스
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { NormalChatDto, NormalChatResponseDto } from './dto/normal-chat.dto';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { SheetService } from '../../common/sheet/sheet.service';
import { CreateMessageDto, MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NormalChatService {
  private readonly logger = new Logger(NormalChatService.name);
  private readonly openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
    private sheetService: SheetService,
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
            spreadsheetId: dto.spreadsheetData.spreadsheetId, // 스프레드시트 ID 포함
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
          if (dto.spreadsheetData.spreadsheetId) {
            const existingChat = await this.firebaseService.getChat(chatId);
            if (existingChat && !existingChat.spreadsheetId) {
              await this.firebaseService.updateChatSpreadsheetId(chatId, dto.spreadsheetData.spreadsheetId);
              this.logger.log(`채팅에 스프레드시트 ID 연결: ${dto.spreadsheetData.spreadsheetId}`);
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
        type: MessageType.TEXT,
        mode: MessageMode.NORMAL,
        ...(sheetContext && { sheetContext }),
      };

      const userMessageId = await this.firebaseService.createMessage(chatId, userMessageDto);
      this.logger.log(`사용자 메시지 저장: ${userMessageId}`);

      // === 4. AI 응답 생성 ===
      const aiResponse = await this.generateAIResponse(dto, activeSheetData, spreadsheetMetadata);

      // === 5. AI 응답 메시지 저장 ===
      const aiMessageDto: CreateMessageDto = {
        content: aiResponse,
        role: MessageRole.EXTION_AI,
        type: MessageType.TEXT,
        mode: MessageMode.NORMAL,
        ...(sheetContext && { sheetContext }),
      };

      const aiMessageId = await this.firebaseService.createMessage(chatId, aiMessageDto);
      this.logger.log(`AI 응답 메시지 저장: ${aiMessageId}`);

      // === 6. 응답 반환 ===
      const result: NormalChatResponseDto = {
        success: true,
        message: aiResponse,
        chatId,
        userMessageId,
        aiMessageId,
        timestamp: new Date().toISOString(),
        spreadsheetMetadata: this.buildSpreadsheetMetadataResponse(spreadsheetMetadata),
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

  // === AI 응답 생성 로직 ===
  private async generateAIResponse(
    dto: NormalChatDto,
    activeSheetData: any,
    spreadsheetMetadata: any
  ): Promise<string> {
    this.logger.log('==================== AI 응답 생성 시작 ====================');
    this.logger.log(`사용자 입력: ${dto.userInput}`);

    // 시스템 프롬프트 생성
    const systemPrompt = this.createSystemPrompt(activeSheetData, spreadsheetMetadata);

    // 사용자 프롬프트 생성
    const userPrompt = this.createUserPrompt(dto.userInput, activeSheetData, spreadsheetMetadata);

    // 프롬프트 크기 체크
    const totalPromptSize = systemPrompt.length + userPrompt.length;
    this.logger.log(`총 프롬프트 크기: ${totalPromptSize} 문자`);
    this.logger.log(`시스템 프롬프트 크기: ${systemPrompt.length} 문자`);
    this.logger.log(`사용자 프롬프트 크기: ${userPrompt.length} 문자`);

    if (totalPromptSize > 100000) {
      this.logger.warn(`프롬프트 크기가 큽니다: ${totalPromptSize} 문자. 응답이 제한될 수 있습니다.`);
    }

    // OpenAI API 호출
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
    const title = userInput.length > 30 ? userInput.substring(0, 30) + '...' : userInput;
    return title || '새로운 채팅';
  }

  // === 시스템 프롬프트 생성 ===
  private createSystemPrompt(activeSheetData: any, spreadsheetMetadata: any): string {
    const hasSpreadsheetData = !!(activeSheetData && spreadsheetMetadata);
    const isMultiSheet = spreadsheetMetadata?.sheets?.length > 1;

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
7. 마크다운 형식을 사용하지 말고 일반 텍스트로 응답하세요.
8. 전체 데이터를 기준으로 분석하세요.
9. 제공된 실제 데이터를 바탕으로 정확한 분석을 수행하세요.
10. 데이터의 패턴, 트렌드, 이상값 등을 구체적으로 언급하세요.

## 데이터 컨텍스트
${hasSpreadsheetData ? `
현재 분석 가능한 실제 데이터가 있습니다:
${isMultiSheet ? `
- 다중 시트 환경
- 총 시트 수: ${spreadsheetMetadata.sheets.length}
- 활성 시트: ${spreadsheetMetadata.sheets[spreadsheetMetadata.activeSheetIndex]?.sheetName || '알 수 없음'}
- 파일명: ${spreadsheetMetadata.fileName}
` : `
- 단일 시트 환경
- 시트명: ${spreadsheetMetadata.sheets[0]?.sheetName || '알 수 없음'}
- 파일명: ${spreadsheetMetadata.fileName}
`}
- 실제 데이터가 제공되어 정밀한 분석이 가능합니다
- 모든 행과 열을 대상으로 상세 분석을 수행하세요
` : `
현재 분석할 데이터가 없습니다. 사용자에게 데이터를 업로드하도록 안내하세요.
`}`;
  }

  // === 사용자 프롬프트 생성 ===
  private createUserPrompt(
    userInput: string,
    activeSheetData: any,
    spreadsheetMetadata: any
  ): string {
    const hasData = !!(activeSheetData && spreadsheetMetadata);

    let promptContent = `사용자 요청: "${userInput}"

`;

    if (hasData) {
      const activeSheet = spreadsheetMetadata.sheets[0];

      promptContent += `## 현재 데이터 정보:
- **스프레드시트**: ${spreadsheetMetadata.fileName}
- **시트명**: ${activeSheet.sheetName}
- **컬럼**: ${activeSheetData.headers?.join(', ') || activeSheet.headers?.join(', ') || '없음'}
- **전체 데이터 행 수**: ${activeSheetData.rowCount || 0}
- **전체 데이터 열 수**: ${activeSheetData.columnCount || activeSheet.headers?.length || 0}

`;

      // 실제 데이터가 있는 경우 포함
      if (activeSheetData.data?.rows && activeSheetData.data.rows.length > 0) {
        const limitedRows = this.limitDataForPrompt(
          activeSheetData.data.rows,
          activeSheetData.headers || activeSheet.headers
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

  // === 프롬프트용 데이터 제한 ===
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
}
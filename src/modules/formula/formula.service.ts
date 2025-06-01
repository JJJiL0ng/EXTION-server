import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ProcessFormulaDto } from './dto/process-formula.dto';
import { FormulaResponseDto } from './dto/formula-response.dto';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { CreateMessageDto, MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';

@Injectable()
export class FormulaService {
  private readonly logger = new Logger(FormulaService.name);
  private readonly openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not set in environment variables');
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  async generateFormula(processFormulaDto: ProcessFormulaDto): Promise<FormulaResponseDto> {
    try {
      this.logger.log(`함수 생성 요청: ${processFormulaDto.userInput}`);
      this.logger.log(`사용자 ID: ${processFormulaDto.userId}`);
      this.logger.log(`채팅 ID: ${processFormulaDto.chatId || '새 채팅'}`);
      this.logger.log(`스프레드시트 ID: ${processFormulaDto.spreadsheetId || '없음'}`);
      this.logger.log(`스프레드시트 데이터 내 ID: ${processFormulaDto.spreadsheetData?.spreadsheetId || '없음'}`);

      // === 1. 채팅 세션 처리 ===
      let chatId = processFormulaDto.chatId;

      if (!chatId) {
        // chatId가 전혀 없는 경우 - 새 채팅 생성
        const chatTitle = processFormulaDto.chatTitle || this.generateChatTitle(processFormulaDto.userInput);
        chatId = await this.firebaseService.createChat(processFormulaDto.userId, { 
          title: chatTitle,
          spreadsheetId: processFormulaDto.spreadsheetId || processFormulaDto.spreadsheetData?.spreadsheetId // 스프레드시트 ID 포함
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
          const chatTitle = processFormulaDto.chatTitle || this.generateChatTitle(processFormulaDto.userInput);

          // 프론트엔드가 제공한 chatId를 사용하여 채팅 생성
          await this.firebaseService.createChatWithId(processFormulaDto.userId, chatId, { 
            title: chatTitle,
            spreadsheetId: processFormulaDto.spreadsheetId || processFormulaDto.spreadsheetData?.spreadsheetId // 스프레드시트 ID 포함
          });
          
          // 생성된 채팅에서 spreadsheetId 확인
          const createdChatWithId = await this.firebaseService.getChat(chatId);
          this.logger.log(`✅ 특정 ID 채팅 spreadsheetId 저장 확인: ${createdChatWithId?.spreadsheetId || '없음'}`);
        } else {
          // 기존 채팅 소유권 확인
          if (existingChat.userId !== processFormulaDto.userId) {
            throw new BadRequestException('채팅 접근 권한이 없습니다.');
          }
          this.logger.log(`기존 채팅 사용: ${chatId}`);
          
          // 기존 채팅에 스프레드시트 ID가 없고 새로 전달된 경우 업데이트
          const newSpreadsheetId = processFormulaDto.spreadsheetId || processFormulaDto.spreadsheetData?.spreadsheetId;
          if (!existingChat.spreadsheetId && newSpreadsheetId) {
            await this.firebaseService.updateChatSpreadsheetId(chatId, newSpreadsheetId);
            this.logger.log(`기존 채팅에 스프레드시트 ID 연결: ${newSpreadsheetId}`);
            
            // 업데이트된 채팅에서 spreadsheetId 확인
            const updatedChat = await this.firebaseService.getChat(chatId);
            this.logger.log(`✅ 기존 채팅 spreadsheetId 업데이트 확인: ${updatedChat?.spreadsheetId || '없음'}`);
          }
        }
      }

      // === 2. 스프레드시트 데이터 처리 ===
      let spreadsheetMetadata: any = null;
      let sheetContext: any = null;

      if (processFormulaDto.spreadsheetData?.sheets && processFormulaDto.spreadsheetData.sheets.length > 0) {
        this.logger.log('프론트엔드에서 전송된 스프레드시트 데이터 사용');
        this.logger.log(`활성 시트: ${processFormulaDto.spreadsheetData?.activeSheet}`);
        this.logger.log(`전체 시트 수: ${processFormulaDto.spreadsheetData?.sheets?.length || 0}`);

        // 현재 활성 시트의 데이터 가져오기
        const currentSheet = processFormulaDto.spreadsheetData?.sheets?.[0]; // 프론트엔드에서 현재 시트만 보내므로 첫 번째 시트

        if (currentSheet) {
          this.logger.log(`현재 시트명: ${currentSheet.name}`);
          this.logger.log(`데이터 행 수: ${currentSheet.data?.length || 0}`);
          this.logger.log(`데이터 열 수: ${currentSheet.headers?.length || 0}`);

          // spreadsheetMetadata 구성
          spreadsheetMetadata = {
            hasSpreadsheet: true,
            fileName: processFormulaDto.spreadsheetData?.fileName || currentSheet.name,
            spreadsheetId: processFormulaDto.spreadsheetData?.spreadsheetId, // 스프레드시트 데이터 내 ID 사용
            totalSheets: processFormulaDto.spreadsheetData?.sheets?.length || 0,
            activeSheetIndex: 0,
            sheetNames: [currentSheet.name],
            lastModifiedAt: new Date(),
          };

          // sheetContext 구성 (Firebase 메시지 저장용)
          sheetContext = {
            sheetIndex: currentSheet.sheetIndex || 0,
            sheetName: currentSheet.name,
            affectedCells: [],
            totalRows: currentSheet.data?.length || 0,
            totalColumns: currentSheet.headers?.length || 0,
            headers: currentSheet.headers || []
          };

          this.logger.log(`변환 완료 - 시트명: ${currentSheet.name}`);

          // 채팅에 스프레드시트 ID가 연결되지 않은 경우 연결
          if (processFormulaDto.spreadsheetData?.spreadsheetId) {
            const existingChat = await this.firebaseService.getChat(chatId);
            if (existingChat && !existingChat.spreadsheetId) {
              await this.firebaseService.updateChatSpreadsheetId(chatId, processFormulaDto.spreadsheetData.spreadsheetId);
              this.logger.log(`채팅에 스프레드시트 ID 연결: ${processFormulaDto.spreadsheetData.spreadsheetId}`);
              
              // 연결 후 실제 저장 확인
              const finalChat = await this.firebaseService.getChat(chatId);
              this.logger.log(`✅ 최종 채팅 spreadsheetId 연결 확인: ${finalChat?.spreadsheetId || '없음'}`);
            } else if (existingChat?.spreadsheetId) {
              this.logger.log(`✅ 채팅에 이미 spreadsheetId 존재: ${existingChat.spreadsheetId}`);
            }
          }
        }
      } else if (processFormulaDto.sheetContext) {
        // 하위 호환성을 위한 기존 sheetContext 처리
        this.logger.log('기존 sheetContext 사용 (하위 호환성)');
        
        sheetContext = {
          sheetIndex: 0,
          sheetName: processFormulaDto.sheetContext.sheetName,
          affectedCells: [],
          totalRows: 0,
          totalColumns: processFormulaDto.sheetContext.headers?.length || 0,
          headers: processFormulaDto.sheetContext.headers?.map(h => h.name) || []
        };

        spreadsheetMetadata = {
          hasSpreadsheet: true,
          fileName: processFormulaDto.sheetContext.sheetName,
          totalSheets: 1,
          activeSheetIndex: 0,
          sheetNames: [processFormulaDto.sheetContext.sheetName],
          lastModifiedAt: new Date(),
        };
      } else {
        this.logger.log('스프레드시트 데이터가 없습니다.');
        spreadsheetMetadata = {
          hasSpreadsheet: false,
          totalSheets: 0,
          activeSheetIndex: 0,
          sheetNames: [],
          lastModifiedAt: new Date(),
        };
      }

      // === 3. 사용자 메시지 저장 ===
      this.logger.log('=== 사용자 메시지 Firebase 저장 시작 ===');
      const userMessageDto: CreateMessageDto = {
        content: processFormulaDto.userInput,
        role: MessageRole.USER,
        type: MessageType.FORMULA,
        mode: MessageMode.FORMULA,
        ...(sheetContext && { sheetContext }),
      };

      this.logger.log(`저장할 사용자 메시지 데이터:`, JSON.stringify({
        content: userMessageDto.content,
        role: userMessageDto.role,
        type: userMessageDto.type,
        mode: userMessageDto.mode,
        hasSheetContext: !!userMessageDto.sheetContext
      }, null, 2));

      let userMessageId: string;
      try {
        // Firebase 연결 상태 확인
        this.logger.log(`Firebase 연결 상태 확인 중...`);
        this.logger.log(`채팅 ID: ${chatId}`);
        this.logger.log(`채팅 컬렉션 경로: chats/${chatId}/messages`);
        
        userMessageId = await this.firebaseService.createMessage(chatId, userMessageDto);
        this.logger.log(`✅ 사용자 메시지 Firebase 저장 성공: ${userMessageId}`);
        this.logger.log(`채팅 ID: ${chatId}, 메시지 ID: ${userMessageId}`);
      } catch (error) {
        this.logger.error(`❌ 사용자 메시지 Firebase 저장 실패:`, error);
        this.logger.error(`오류 타입: ${error.constructor.name}`);
        this.logger.error(`오류 메시지: ${error.message}`);
        this.logger.error(`오류 스택:`, error.stack);
        this.logger.error(`채팅 ID: ${chatId}`);
        this.logger.error(`사용자 메시지 DTO:`, JSON.stringify(userMessageDto, null, 2));
        throw new InternalServerErrorException('사용자 메시지 저장에 실패했습니다.');
      }

      // === 4. 기존 함수 생성 로직 ===
      // 시트 컨텍스트를 문자열로 변환
      const contextString = this.buildContextString(processFormulaDto);
      
      // GPT에게 보낼 프롬프트 구성
      const systemMessage = this.buildSystemMessage();
      const userMessage = this.buildUserMessage(processFormulaDto.userInput, contextString);

      // OpenAI API 호출
      const gptResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 500,
        temperature: 0.1,
      });

      const gptAnswer = gptResponse.choices[0]?.message?.content;
      
      if (!gptAnswer) {
        throw new InternalServerErrorException('AI 응답을 받을 수 없습니다.');
      }

      // GPT 응답 파싱
      const parsedResponse = this.parseGptResponse(gptAnswer);
      
      if (!parsedResponse.success) {
        throw new InternalServerErrorException(parsedResponse.error || '함수 생성에 실패했습니다.');
      }

      // === 5. AI 응답 메시지 저장 ===
      this.logger.log('=== AI 응답 메시지 Firebase 저장 시작 ===');
      const aiContent = `생성된 함수: \`${parsedResponse.formula}\`\n\n${parsedResponse.explanation?.korean || '함수가 생성되었습니다.'}`;
      
      // formulaData에서 undefined 값들을 필터링
      const formulaData: any = {};
      if (parsedResponse.formula) formulaData.formula = parsedResponse.formula;
      if (parsedResponse.cellAddress) formulaData.cellAddress = parsedResponse.cellAddress;
      if (parsedResponse.functionType) formulaData.functionType = parsedResponse.functionType;
      if (parsedResponse.explanation) formulaData.explanation = parsedResponse.explanation;
      if (parsedResponse.examples) formulaData.examples = parsedResponse.examples;
      if (parsedResponse.alternatives) formulaData.alternatives = parsedResponse.alternatives;
      if (parsedResponse.warning) formulaData.warning = parsedResponse.warning;
      
      const aiMessageDto: CreateMessageDto = {
        content: aiContent,
        role: MessageRole.EXTION_AI,
        type: MessageType.FORMULA,
        mode: MessageMode.FORMULA,
        ...(sheetContext && { sheetContext }),
        formulaData,
      };

      this.logger.log(`저장할 AI 메시지 데이터:`, JSON.stringify({
        content: aiMessageDto.content.substring(0, 100) + '...',
        role: aiMessageDto.role,
        type: aiMessageDto.type,
        mode: aiMessageDto.mode,
        hasSheetContext: !!aiMessageDto.sheetContext,
        hasFormulaData: !!aiMessageDto.formulaData,
        formula: parsedResponse.formula
      }, null, 2));

      let aiMessageId: string;
      try {
        // Firebase 연결 상태 확인
        this.logger.log(`AI 메시지 Firebase 저장 준비 중...`);
        this.logger.log(`채팅 ID: ${chatId}`);
        this.logger.log(`AI 메시지 길이: ${aiContent.length} 문자`);
        
        aiMessageId = await this.firebaseService.createMessage(chatId, aiMessageDto);
        this.logger.log(`✅ AI 응답 메시지 Firebase 저장 성공: ${aiMessageId}`);
        this.logger.log(`채팅 ID: ${chatId}, 메시지 ID: ${aiMessageId}`);

        // === 6. 분석 카운터 증가 ===
        try {
          await this.firebaseService.incrementAnalyticsCounter(chatId, 'formulaCount');
          this.logger.log(`✅ 분석 카운터 증가 성공`);
        } catch (counterError) {
          this.logger.error(`❌ 분석 카운터 증가 실패:`, counterError);
          // 카운터 실패는 전체 프로세스를 중단하지 않음
        }

        // === 스프레드시트 메타데이터 업데이트 (양방향 참조) ===
        if (processFormulaDto.spreadsheetData?.spreadsheetId && spreadsheetMetadata) {
          this.updateSpreadsheetMetadata(chatId, processFormulaDto.spreadsheetData.spreadsheetId, spreadsheetMetadata, parsedResponse).catch(error => {
            this.logger.error('스프레드시트 메타데이터 업데이트 중 오류 (비동기):', error);
          });
        }
        
        this.logger.log(`함수 생성 완료: ${parsedResponse.formula}`);
        
        // === 7. 응답 반환 ===
        const result: FormulaResponseDto = {
          ...parsedResponse,
          chatId,
          userMessageId,
          aiMessageId,
          timestamp: new Date().toISOString(),
          spreadsheetMetadata,
        };

        // Firebase 저장 완료 로그
        this.logger.log('==================== Firebase 채팅 로그 저장 완료 ====================');
        this.logger.log(`✅ 채팅 ID: ${chatId}`);
        this.logger.log(`✅ 사용자 메시지 ID: ${userMessageId}`);
        this.logger.log(`✅ AI 메시지 ID: ${aiMessageId}`);
        this.logger.log(`✅ 함수: ${result.formula || 'N/A'}`);
        this.logger.log(`✅ 타임스탬프: ${result.timestamp}`);
        this.logger.log('==================== 프론트엔드 응답 전송 ====================');
        
        return result;

      } catch (error) {
        this.logger.error(`❌ AI 응답 메시지 Firebase 저장 실패:`, error);
        this.logger.error(`오류 타입: ${error.constructor.name}`);
        this.logger.error(`오류 메시지: ${error.message}`);
        this.logger.error(`오류 스택:`, error.stack);
        this.logger.error(`채팅 ID: ${chatId}`);
        this.logger.error(`AI 메시지 DTO:`, JSON.stringify({
          ...aiMessageDto,
          content: aiMessageDto.content.substring(0, 200) + '...'
        }, null, 2));
        throw new InternalServerErrorException('AI 응답 메시지 저장에 실패했습니다.');
      }

    } catch (error) {
      this.logger.error('함수 생성 중 오류 발생:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      const errorResult: FormulaResponseDto = {
        success: false,
        error: error.message || '함수 생성 중 오류가 발생했습니다.',
        timestamp: new Date().toISOString()
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
    return title || '새로운 함수 채팅';
  }

  private buildContextString(dto: ProcessFormulaDto): string {
    // 새로운 spreadsheetData가 있으면 우선 사용
    if (dto.spreadsheetData?.sheets && dto.spreadsheetData.sheets.length > 0) {
      const currentSheet = dto.spreadsheetData?.sheets?.[0];
      
      if (!currentSheet) {
        return '시트 정보가 없습니다.';
      }
      
      let context = `시트 이름: ${currentSheet.name}\n\n`;
      context += `헤더 정보:\n`;
      
      currentSheet.headers?.forEach((header, index) => {
        const column = String.fromCharCode(65 + index); // A, B, C...
        context += `- ${column}열: ${header}\n`;
      });
      
      context += `\n데이터 행 수: ${currentSheet.data?.length || 0}\n`;
      context += `데이터 열 수: ${currentSheet.headers?.length || 0}\n`;
      
      if (currentSheet.data && currentSheet.data.length > 0) {
        context += `\n샘플 데이터:\n`;
        currentSheet.data.slice(0, 3).forEach((row, index) => {
          context += `${index + 1}. [${row.join(', ')}]\n`;
        });
      }
      
      return context;
    }
    
    // 하위 호환성을 위한 기존 sheetContext 처리
    const { sheetContext } = dto;
    
    if (!sheetContext) {
      return '시트 정보가 없습니다.';
    }
    
    let context = `시트 이름: ${sheetContext.sheetName}\n\n`;
    context += `헤더 정보:\n`;
    
    sheetContext.headers?.forEach(header => {
      context += `- ${header.column}열: ${header.name}\n`;
    });
    
    context += `\n데이터 범위: ${sheetContext.dataRange?.startRow}행부터 ${sheetContext.dataRange?.endRow}행까지\n`;
    
    if (sheetContext.sampleData && sheetContext.sampleData.length > 0) {
      context += `\n샘플 데이터:\n`;
      sheetContext.sampleData.slice(0, 3).forEach((row, index) => {
        context += `${index + 1}. ${JSON.stringify(row)}\n`;
      });
    }
    
    return context;
  }

  private buildSystemMessage(): string {
    return `
당신은 hyperformula 함수 전문가입니다. 사용자의 자연어 요청을 분석하여 적절한 hyperformula 함수를 생성해주세요.

규칙:
1. 오직 hyperformula에서 지원하는 함수만 사용하세요.
2. 함수는 반드시 =로 시작해야 합니다.
3. 셀 범위는 제공된 데이터 범위 내에서만 사용하세요.
4. 함수 외에 설명도 함께 제공해주세요.
5. 함수를 넣을 셀 주소는 기존의 셀 밖에 가장 적합할 셀에 넣어주세요.(ex:평균이나 합산의 결과면 해당 열의 마지막 셀에 넣어주세요.)
6. 함수를 넣을 셀 주소는 영어로 작성해주세요.(ex:k1)
7. 사용자에게 보여질 설명은 마크다운 형식을 사용하지 말고 일반 텍스트로 작성하세요.

응답 형식:
{
  "formula": "생성된 함수 (예: =AVERAGE(B2:B50))",
  "explanation": "함수 설명 (한국어)",
  "cellAddress": "함수를 넣을 셀 주소"
}

지원되는 함수 예시:
- AVERAGE, SUM, COUNT, MAX, MIN
- COUNTIF, SUMIF, AVERAGEIF
- SORT, FILTER (단순한 경우만)
- VLOOKUP, INDEX, MATCH
`;
  }

  private buildUserMessage(userInput: string, context: string): string {
    return `
현재 스프레드시트 정보:
${context}

사용자 요청: "${userInput}"

위 정보를 바탕으로 적절한 스프레드시트 함수를 생성해주세요.
`;
  }

  private parseGptResponse(gptAnswer: string): FormulaResponseDto {
    try {
      // GPT 응답에서 JSON 부분만 추출
      const jsonMatch = gptAnswer.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        // JSON 형식이 아닌 경우, 텍스트에서 함수 추출 시도
        const formulaMatch = gptAnswer.match(/=[\w(),:]+/);
        if (formulaMatch) {
          return {
            success: true,
            formula: formulaMatch[0],
            explanation: {
              korean: '적절한 함수를 생성했습니다.',
            },
            cellAddress: this.suggestCellAddress(),
          };
        }
        
        throw new Error('함수를 찾을 수 없습니다.');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // explanation 필드를 안전하게 처리
      let explanation;
      if (typeof parsed.explanation === 'string') {
        explanation = { korean: parsed.explanation };
      } else if (parsed.explanation && typeof parsed.explanation === 'object') {
        explanation = parsed.explanation;
      } else {
        explanation = { korean: '함수를 생성했습니다.' };
      }
      
      return {
        success: true,
        formula: parsed.formula || '',
        explanation,
        cellAddress: parsed.cellAddress || this.suggestCellAddress(),
        functionType: this.extractFunctionType(parsed.formula || ''),
      };
      
    } catch (error) {
      this.logger.error('GPT 응답 파싱 오류:', error);
      
      // 파싱 실패 시 간단한 함수 추출 시도
      const formulaMatch = gptAnswer.match(/=[\w(),:]+/);
      if (formulaMatch) {
        return {
          success: true,
          formula: formulaMatch[0],
          explanation: {
            korean: '함수를 생성했습니다. 정확성을 확인해주세요.',
          },
          cellAddress: this.suggestCellAddress(),
        };
      }
      
      return {
        success: false,
        error: '응답을 해석할 수 없습니다. 다시 시도해주세요.',
      };
    }
  }

  private extractFunctionType(formula: string): string {
    const matches = formula.match(/=([A-Z]+)/);
    return matches ? matches[1] : 'UNKNOWN';
  }

  private suggestCellAddress(): string {
    // 기본적으로 E1을 제안 (결과 표시용)
    return 'E1';
  }

  // 향후 확장을 위한 메서드들
  async validateFormula(formula: string): Promise<boolean> {
    // TODO: 함수 유효성 검증 로직
    const validPattern = /^=[\w(),:]+$/;
    return validPattern.test(formula);
  }

  private getSupportedFunctions(): string[] {
    return [
      // 기본 수학 함수
      'SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'MEDIAN',
      // 조건부 집계 함수
      'COUNTIF', 'SUMIF', 'AVERAGEIF', 'COUNTIFS', 'SUMIFS', 'AVERAGEIFS',
      // 검색 및 참조 함수
      'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'INDIRECT', 'ADDRESS',
      // 날짜 및 시간 함수
      'TODAY', 'NOW', 'DATE', 'YEAR', 'MONTH', 'DAY', 'EOMONTH',
      // 논리 함수
      'IF', 'AND', 'OR', 'NOT', 'IFERROR', 'IFS',
      // 텍스트 함수
      'CONCATENATE', 'LEFT', 'RIGHT', 'MID', 'FIND', 'SEARCH', 'SUBSTITUTE'
      // HyperFormula에서 지원하지 않는 함수는 제외
      // 'SORT', 'FILTER', 'UNIQUE' 등
    ];
  }

  // 스프레드시트 메타데이터 업데이트 (양방향 참조)
  private async updateSpreadsheetMetadata(chatId: string, spreadsheetId: string, spreadsheetMetadata: any, parsedResponse: FormulaResponseDto): Promise<void> {
    try {
      this.logger.log('==================== 스프레드시트 메타데이터 업데이트 시작 ====================');
      
      // 함수 정보를 포함한 스프레드시트 메타데이터 구성
      const enhancedMetadata = {
        ...spreadsheetMetadata,
        formulaInfo: {
          lastFormula: parsedResponse.formula,
          cellAddress: parsedResponse.cellAddress,
          functionType: parsedResponse.functionType,
          createdAt: new Date()
        }
      };

      // Firebase 서비스를 통해 스프레드시트 메타데이터 업데이트
      await this.firebaseService.updateSpreadsheetMetadata(spreadsheetId, enhancedMetadata);

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
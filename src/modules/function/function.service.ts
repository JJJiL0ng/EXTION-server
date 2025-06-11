import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { CreateMessageDto, MessageRole, MessageType, MessageMode } from '../../common/dto/chat.dto';
import { ProcessFunctionDto, FunctionResponseDto, FunctionDetailsDto } from './dto/process-function.dto';
import { ChatHistoryCacheService } from '../../common/cache/cache.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FunctionService {
  private readonly logger = new Logger(FunctionService.name);
  // private readonly openai: OpenAI;
  private readonly anthropic: Anthropic;

  constructor(
    private configService: ConfigService,
    private firebaseService: FirebaseService,
    private chatHistoryCacheService: ChatHistoryCacheService,
  ) {
    /* this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    }); */
    this.anthropic = new Anthropic({
      apiKey: this.configService.get('CLAUDE_API_KEY'),
    });
  }

  async processFunction(dto: ProcessFunctionDto): Promise<FunctionResponseDto> {
    try {
      this.logger.log(`함수 실행 요청: ${dto.userInput}`);
      let chatId = dto.chatId;

      if (!chatId) {
        const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);
        chatId = await this.firebaseService.createChat(dto.userId || `guest_${uuidv4()}`, { 
          title: chatTitle,
          spreadsheetId: dto.spreadsheetData?.spreadsheetId
        });
        this.logger.log(`새 채팅 생성: ${chatId}`);
      } else {
        const existingChat = await this.firebaseService.getChat(chatId);
        if (!existingChat) {
          const chatTitle = dto.chatTitle || this.generateChatTitle(dto.userInput);
          await this.firebaseService.createChatWithId(dto.userId || `guest_${uuidv4()}`, chatId, {
            title: chatTitle,
            spreadsheetId: dto.spreadsheetData?.spreadsheetId
          });
          this.logger.log(`Firebase에 채팅이 없어서 새로 생성: ${chatId}`);
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

          // 기존 채팅에 spreadsheetId가 없고 새로 전달된 경우 업데이트
          const newSpreadsheetId = dto.spreadsheetData?.spreadsheetId;
          if (!existingChat.spreadsheetId && newSpreadsheetId) {
            await this.firebaseService.updateChatSpreadsheetId(chatId, newSpreadsheetId);
            this.logger.log(`기존 채팅에 스프레드시트 ID 연결: ${newSpreadsheetId}`);
          }
        }
      }

      const userMessageDto: CreateMessageDto = {
        content: dto.userInput,
        role: MessageRole.USER,
        type: MessageType.TEXT,
        mode: MessageMode.FUNCTION,
      };
      const userMessageId = await this.firebaseService.createMessage(chatId, userMessageDto);
      this.logger.log(`사용자 메시지 저장: ${userMessageId}`);

      // 사용자 메시지를 캐시에 추가
      this.chatHistoryCacheService.addMessageToCache(chatId, {
        id: userMessageId,
        content: userMessageDto.content,
        role: userMessageDto.role,
        mode: userMessageDto.mode || MessageMode.FUNCTION,
        timestamp: new Date(),
      });

      const systemPrompt = this.createSystemPrompt();
      const userPrompt = this.createUserPrompt(dto);

      // 이전 대화 기록 가져오기
      const historyMessages = await this.chatHistoryCacheService.getMessagesForOpenAI(chatId);
      this.logger.log(`가져온 대화 기록: ${historyMessages.length}개`);

      /* const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      });

      const aiResponse = completion.choices[0]?.message?.content; */
      const completion = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        system: systemPrompt,
        messages: [
          ...historyMessages,
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 4096,
      });

      const firstBlock = completion.content[0];
      const aiResponse = firstBlock?.type === 'text' ? firstBlock.text : null;
      
      if (!aiResponse) {
        throw new InternalServerErrorException('AI 응답을 받을 수 없습니다.');
      }
      
      const result = this.extractDataFromResponse(aiResponse);

      const aiMessageDto: CreateMessageDto = {
        content: result.explanation,
        role: MessageRole.EXTION_AI,
        type: MessageType.FUNCTION,
        mode: MessageMode.FUNCTION,
        metadata: result
      };
      const aiMessageId = await this.firebaseService.createMessage(chatId, aiMessageDto);
      this.logger.log(`AI 응답 메시지 저장: ${aiMessageId}`);

      // AI 응답 메시지를 캐시에 추가
      this.chatHistoryCacheService.addMessageToCache(chatId, {
        id: aiMessageId,
        content: aiMessageDto.content,
        role: aiMessageDto.role,
        mode: aiMessageDto.mode || MessageMode.FUNCTION,
        timestamp: new Date(),
        metadata: aiMessageDto.metadata,
      });

      return {
        ...result,
        chatId,
        userMessageId,
        aiMessageId,
      };

    } catch (error) {
      this.logger.error('함수 처리 오류:', error);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(error.message || '함수 처리 중 오류가 발생했습니다.');
    }
  }

  private generateChatTitle(userInput: string): string {
    return userInput.length > 20 ? userInput.substring(0, 20) + '...' : userInput;
  }

  private createSystemPrompt(): string {
    return `당신은 사용자의 자연어 요청을 분석하여, 엑셀 함수와 동일한 결과를 내는 데이터 분석가입니다. 당신의 임무는 SUM, AVERAGE 같은 집계 함수부터 SORT, FILTER 같은 배열 변환 함수까지, 모든 종류의 엑셀 함수 기능을 수행하고 그 결과를 반환하는 것입니다.

## 임무
1.  사용자의 요청(예: "구매 금액 총합", "데이터 오름차순 정렬")을 정확히 이해합니다.
2.  제공된 데이터를 바탕으로 요청된 계산이나 변환을 **정확하게 수행**합니다.
3.  결과를 배치할 가장 적절한 셀 위치(A1 표기법)를 결정합니다.
4.  **요청 유형에 따라 결과의 형식을 결정합니다.**
   -   **집계 (Aggregation) 요청 (SUM, AVERAGE 등):** \`result\` 필드에 단일 값(숫자 또는 문자열)을 반환합니다.
   -   **배열 (Array) 변환 요청 (SORT, FILTER 등):** \`result\` 필드에 2차원 배열(\`string[][]\`)을 반환합니다. 이 배열은 시트의 새로운 위치에 표시될 데이터 블록입니다.
5.  최종 결과를 지정된 JSON 형식으로 반환합니다.

## 응답 형식
반드시 다음 JSON 구조를 따라야 합니다.

### 예시 1: 집계 함수 (SUM)
\`\`\`json
{
  "explanation": "G2:G11 범위의 합계를 계산하여 G12 셀에 표시할 결과를 준비했습니다.",
  "functionDetails": {
    "functionType": "SUM",
    "sourceRange": "G2:G11",
    "targetCell": "G12",
    "result": 153000,
    "formula": "=SUM(G2:G11)"
  }
}
\`\`\`

### 예시 2: 배열 함수 (SORT)
\`\`\`json
{
  "explanation": "A2:C10 범위를 첫 번째 열 기준으로 오름차순 정렬하여 E2 셀부터 표시할 결과를 준비했습니다.",
  "functionDetails": {
    "functionType": "SORT",
    "sourceRange": "A2:C10",
    "targetCell": "E2",
    "result": [
      ["Product A", "10", "1000"],
      ["Product B", "5", "500"],
      ["Product C", "12", "1200"]
    ],
    "formula": "=SORT(A2:C10, 1, 1)"
  }
}
\`\`\`

## 중요 규칙
- \`functionDetails.result\`: **가장 중요한 필드입니다.** 집계 결과(단일 값) 또는 변환된 데이터 배열(2D \`string[][]\`)을 담습니다.
- \`functionDetails.targetCell\`: 결과가 시작될 **단일 셀 주소**입니다. 배열 결과의 경우, 이 셀은 데이터 블록의 좌측 상단 모서리가 됩니다.
- \`result\`에 포함되는 모든 값(배열 내부 포함)은 문자열로 변환해야 합니다. (예: \`123\` -> \`"123"\`)
- JSON 외에 다른 텍스트, 마크다운, 주석을 포함하지 마세요.`;
  }

  private createUserPrompt(dto: ProcessFunctionDto): string {
    const { userInput, spreadsheetData } = dto;
    
    let prompt = `사용자 요청: "${userInput}"\n\n`;

    if (spreadsheetData && spreadsheetData.sheets?.length > 0) {
      const activeSheet = spreadsheetData.sheets.find(s => s.name === spreadsheetData.activeSheet) || spreadsheetData.sheets[0];
      const headers = activeSheet.data?.[0] || [];
      const rowCount = activeSheet.data ? activeSheet.data.length -1 : 0;

      prompt += `## 현재 시트 정보:\n`;
      prompt += `- 시트명: ${activeSheet.name}\n`;
      prompt += `- 컬럼: ${headers.join(', ')}\n`;
      prompt += `- 데이터 행 수: ${rowCount > 0 ? rowCount : 0}\n\n`;

      const csvData = activeSheet.data.map(row => row.join(',')).join('\n');
      prompt += `## 실제 데이터 (CSV 형식):\n\`\`\`\n${csvData}\n\`\`\`\n\n`;
      prompt += `위 데이터를 기반으로 사용자의 요청에 따라 실제 계산이나 데이터 변환을 수행하고, 시스템 프롬프트에 명시된 JSON 형식으로 결과를 반환하세요.`;
    } else {
      prompt += `## 데이터 없음\n\n데이터가 제공되지 않았습니다. 사용자의 요청만으로 함수를 유추하여 응답하세요.`;
    }

    return prompt;
  }

  private extractDataFromResponse(aiResponse: string): Pick<FunctionResponseDto, 'success' | 'explanation' | 'functionDetails'> {
    this.logger.debug(`AI 응답 분석 시작: ${aiResponse}`);
    try {
      const jsonRegex = /```json([\s\S]*?)```|(\{[\s\S]*\})/;
      const match = aiResponse.match(jsonRegex);
      
      let jsonString = '';
      if (match && match[1]) {
        jsonString = match[1].trim();
      } else if (match && match[2]) {
        jsonString = match[2].trim();
      } else if (aiResponse.trimStart().startsWith('{')) {
        jsonString = aiResponse.trim();
      } else {
        throw new Error('응답에서 유효한 JSON 형식을 찾을 수 없습니다.');
      }

      const parsedData = JSON.parse(jsonString);

      if (!parsedData.explanation || !parsedData.functionDetails) {
        throw new Error('필수 필드(explanation, functionDetails)가 누락되었습니다.');
      }
      
      const details = parsedData.functionDetails;
      if (!details.functionType || !details.sourceRange || !details.targetCell || details.result === undefined || !details.formula) {
        throw new Error('functionDetails에 필수 필드가 누락되었습니다.');
      }
      
      const functionDetails: FunctionDetailsDto = {
        functionType: String(details.functionType),
        sourceRange: String(details.sourceRange),
        targetCell: String(details.targetCell),
        result: details.result,
        formula: String(details.formula),
      };

      return {
        success: true,
        explanation: parsedData.explanation,
        functionDetails: functionDetails,
      };

    } catch (error) {
      this.logger.error('응답 데이터 추출 오류:', error);
      throw new InternalServerErrorException(`데이터 추출 실패: ${error.message}`);
    }
  }
}

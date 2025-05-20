// src/modules/normalchat/normalchat.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { NormalChatDto, NormalChatResponseDto } from './dto/normal-chat.dto';

@Injectable()
export class NormalChatService {
  private readonly logger = new Logger(NormalChatService.name);
  private readonly openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async chat(dto: NormalChatDto): Promise<NormalChatResponseDto> {
    try {
      this.logger.log(`일반 채팅 요청: ${dto.userInput}`);

      // 데이터 컨텍스트 조회
      const dataContext = this.getDataContext(dto);
      
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
        temperature: 0.7,
        max_tokens: 2000,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      
      if (!aiResponse) {
        throw new InternalServerErrorException('AI 응답을 받을 수 없습니다.');
      }

      return {
        success: true,
        message: aiResponse
      };

    } catch (error) {
      this.logger.error('일반 채팅 오류:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      return {
        success: false,
        message: error.message || '일반 채팅 중 오류가 발생했습니다.'
      };
    }
  }

  private getDataContext(dto: NormalChatDto): any {
    if (dto.extendedSheetContext) {
      return dto.extendedSheetContext;
    }
    
    if (dto.currentData && dto.currentData.sheets && dto.currentData.sheets.length > 0) {
      const activeSheet = dto.currentData.sheets.find(sheet => sheet.name === dto.currentData?.activeSheet);
      
      if (activeSheet) {
        return {
          sheetName: activeSheet.name,
          headers: activeSheet.metadata?.headers?.map((name, index) => ({
            column: String.fromCharCode(65 + index),
            name
          })) || [],
          data: this.parseCsvToArray(activeSheet.csv)
        };
      }
    }
    
    return null;
  }

  private parseCsvToArray(csv: string): string[][] {
    if (!csv) return [[]];
    return csv.split('\n').map(line => line.split(','));
  }

  private createSystemPrompt(dto: NormalChatDto): string {
    const hasExistingData = !!(dto.extendedSheetContext || (dto.currentData && dto.currentData.sheets.length > 0));
    
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

## 데이터 컨텍스트
${hasExistingData ? `
현재 분석 가능한 데이터가 있습니다:
- 시트명: ${dto.extendedSheetContext?.sheetName || dto.currentData?.activeSheet || '없음'}
- 데이터 행 수: ${dto.extendedSheetContext?.dataRange?.endRow || '알 수 없음'}
` : `
현재 분석할 데이터가 없습니다. 사용자에게 데이터를 업로드하도록 안내하세요.
`}`;
  }

  private createUserPrompt(userInput: string, dto: NormalChatDto): string {
    const context = this.getDataContext(dto);
    const hasExistingData = !!(dto.extendedSheetContext || (dto.currentData?.sheets && dto.currentData.sheets.length > 0));
    
    return `사용자 요청: "${userInput}"

${hasExistingData ? `
## 현재 데이터 정보:
${context ? `
- **시트명**: ${context.sheetName || '알 수 없음'}
- **컬럼**: ${context.headers?.map(h => h.name).join(', ') || '없음'}
- **데이터 행 수**: ${context.data ? context.data.length - 1 : 0}
` : '현재 데이터 정보를 추출할 수 없습니다.'}
` : '## 현재 데이터가 없습니다. 사용자에게 데이터 업로드를 안내하세요.'}

사용자의 요청에 대해 전문적이고 친근한 톤으로 응답해주세요.
데이터가 있는 경우 구체적인 분석과 인사이트를 제공하고,
데이터가 없는 경우 적절한 안내를 제공해주세요.`;
  }
}
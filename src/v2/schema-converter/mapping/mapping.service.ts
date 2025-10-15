import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { createMappingSuggestionRunnable } from './mapping-agent/runnable/mappingSuggestion.runnable';

export interface MappingSuggestionInput {
    sourceSheetName: string;
    sourceSheet: Record<string, any>;
    sourceSheetRange?: number[];
    selectedSourceSheetName?: string;
    targetSheetName: string;
    targetSheet: Record<string, any>;
    targetSheetRange?: number[];
    selectedTargetSheetName?: string;
}

@Injectable()
export class MappingService {
    private readonly logger = new Logger(MappingService.name);
    private readonly geminiNormal: ChatGoogleGenerativeAI; // 2.5 flash
    private readonly geminiLarge: ChatGoogleGenerativeAI; // 2.5 pro

    constructor(
        private readonly configService: ConfigService,
    ) {
        this.geminiNormal = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-flash',
            temperature: 0.1,
            maxOutputTokens: 6000,
            streaming: false, // 스트리밍 비활성화
        });

        this.geminiLarge = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-pro',
            temperature: 0.0,
            maxOutputTokens: 8000,
            streaming: false, // 스트리밍 비활성화
        });
    }

    /**
     * 매핑 제안 생성
     * - mappingSuggestion.runnable을 사용하여 소스와 타겟 시트 간 매핑 제안 생성
     *
     * @param input - 소스/타겟 시트 정보 및 범위
     * @returns 매핑 제안 결과 (JSON string)
     */
    async generateMappingSuggestion(input: MappingSuggestionInput): Promise<string> {
        this.logger.log('Generating mapping suggestion...');

        try {
            // mappingSuggestion.runnable 생성 (geminiNormal 사용)
            const mappingSuggestionRunnable = createMappingSuggestionRunnable(this.geminiNormal);

            // 입력 데이터 준비
            const runnableInput = {
                sourceSheetName: input.sourceSheetName,
                sourceSheet: JSON.stringify(input.sourceSheet, null, 2),
                sourceSheetRange: input.sourceSheetRange?.join('-') || 'all',
                selectedSourceSheetName: input.selectedSourceSheetName || input.sourceSheetName,
                targetSheetName: input.targetSheetName,
                targetSheet: JSON.stringify(input.targetSheet, null, 2),
                targetSheetRange: input.targetSheetRange?.join('-') || 'all',
                selectedTargetSheetName: input.selectedTargetSheetName || input.targetSheetName,
            };

            this.logger.debug('Runnable input prepared:', runnableInput);

            // Runnable 실행
            const result = await mappingSuggestionRunnable.invoke(runnableInput);

            this.logger.log('Mapping suggestion generated successfully');
            return result;
        } catch (error) {
            this.logger.error('Failed to generate mapping suggestion:', error);
            throw new Error(`매핑 제안 생성 실패: ${error.message}`);
        }
    }
}

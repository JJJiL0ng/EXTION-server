import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { createMappingSuggestionRunnable } from './mapping-agent/runnable/mappingSuggestion.runnable';
import { sheetNameParser } from './../mapping/mapping-agent/sheetParser/sheetNameParser';

export type ModelType = 'small' | 'normal' | 'large';

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
    private readonly geminiSmall: ChatGoogleGenerativeAI; // 2.5 flash-lite

    constructor(
        private readonly configService: ConfigService,
    ) {
        this.geminiNormal = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-flash',
            temperature: 0.1,
            maxOutputTokens: 6000,
            streaming: false, // 스트리밍 비활성화
            maxRetries: 2, // 재시도 2회
        });

        this.geminiLarge = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-pro', // 복잡한 매핑 분석용 large model
            temperature: 0.1,
            maxOutputTokens: 8000,
            streaming: false, // 스트리밍 비활성화
            maxRetries: 2, // 재시도 2회
        });
        this.geminiSmall = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-flash-lite', // 간단한 매핑 분석용 small model
            temperature: 0.1,
            maxOutputTokens: 8000,
            streaming: false, // 스트리밍 비활성화
            maxRetries: 2, // 재시도 2회
        });
    }

    /**
     * 매핑 제안 생성
     * - mappingSuggestion.runnable을 사용하여 소스와 타겟 시트 간 매핑 제안 생성
     *
     * @param input - 소스/타겟 시트 정보 및 범위
     * @param modelType - 사용할 모델 타입 ('small' | 'normal' | 'large')
     * @returns 매핑 제안 결과 (JSON string)
     */
    async generateMappingSuggestion(input: MappingSuggestionInput, modelType: ModelType = 'small'): Promise<string> {
        const startTime = Date.now();
        
        // 모델 선택 및 이름 매핑
        let selectedModel: ChatGoogleGenerativeAI;
        let modelName: string;
        
        switch (modelType) {
            case 'small':
                selectedModel = this.geminiSmall;
                modelName = 'gemini-2.5-flash-lite (Small)';
                break;
            case 'large':
                selectedModel = this.geminiLarge;
                modelName = 'gemini-2.5-pro (Large)';
                break;
            case 'normal':
            default:
                selectedModel = this.geminiNormal;
                modelName = 'gemini-2.5-flash (Normal)';
                break;
        }
        
        this.logger.log(`[PERF] Starting mapping suggestion - source: ${input.sourceSheetName}, target: ${input.targetSheetName}, model: ${modelName}`);

        try {
            // mappingSuggestion.runnable 생성 (모델 선택)
            const mappingSuggestionRunnable = createMappingSuggestionRunnable(selectedModel);

            // Step 1: Parse sheets
            const parseStartTime = Date.now();
            const parsedSourceSheet = await sheetNameParser(
                input.selectedSourceSheetName ? [input.selectedSourceSheetName] : [],
                input.sourceSheet,
                { logger: this.logger },
            );

            const parsedTargetSheet = await sheetNameParser(
                input.selectedTargetSheetName ? [input.selectedTargetSheetName] : [],
                input.targetSheet,
                { logger: this.logger },
            );
            const parseTime = Date.now() - parseStartTime;
            this.logger.log(`[PERF] Sheet parsing took: ${parseTime}ms`);

            // Step 2: Stringify sheets (미리 직렬화하여 LangChain의 암묵적 직렬화 방지)
            const stringifyStartTime = Date.now();
            const sourceSheetString = JSON.stringify(parsedSourceSheet, null, 2);
            const targetSheetString = JSON.stringify(parsedTargetSheet, null, 2);
            const stringifyTime = Date.now() - stringifyStartTime;
            this.logger.log(`[PERF] JSON stringification took: ${stringifyTime}ms (source: ${(sourceSheetString.length / 1024).toFixed(2)}KB, target: ${(targetSheetString.length / 1024).toFixed(2)}KB)`);

            // 입력 데이터 준비 (문자열로 전달)
            const runnableInput = {
                sourceSheet: sourceSheetString,
                sourceSheetRange: input.sourceSheetRange,
                targetSheet: targetSheetString,
                targetSheetRange: input.targetSheetRange,
            };

            this.logger.log(`[PERF] Invoking LangChain runnable with ${modelName}...`);
            const llmStartTime = Date.now();

            // Runnable 실행
            const result = await mappingSuggestionRunnable.invoke(runnableInput);

            const llmTime = Date.now() - llmStartTime;
            const totalTime = Date.now() - startTime;
            this.logger.log(`[PERF] LLM invocation took: ${llmTime}ms`);
            this.logger.log(`[PERF] Total mapping suggestion time: ${totalTime}ms (parse: ${parseTime}ms, stringify: ${stringifyTime}ms, LLM: ${llmTime}ms)`);
            this.logger.log(`Mapping suggestion generated successfully. Result length: ${result?.length || 0}`);

            return result;
        } catch (error) {
            const totalTime = Date.now() - startTime;
            this.logger.error(`[PERF] Failed after ${totalTime}ms - Error: ${error.message}`, error.stack);
            throw new Error(`매핑 제안 생성 실패: ${error.message}`);
        }
    }
}

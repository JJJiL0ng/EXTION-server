import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import {
    CreateMappingScriptReqDto,
    CreateMappingScriptResDto,
} from './dto/mappingScript.dto';
import { PrismaService } from '../../../../v2/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { createMappingScriptMakerRunnable } from '../mapping-agent/runnable/mappingScriptMaker.runable';
import { sheetNameParser } from '../mapping-agent/sheetParser/sheetNameParser';

@Injectable()
export class MappingScriptMakerService {
    private readonly logger = new Logger(MappingScriptMakerService.name);
    private readonly geminiNormal: ChatGoogleGenerativeAI;
    private readonly geminiLarge: ChatGoogleGenerativeAI;
    private readonly geminiSmall: ChatGoogleGenerativeAI;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
    ) {
        // AI 모델 초기화
        this.geminiNormal = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-flash',
            temperature: 0.0,
            maxOutputTokens: 6000,
            streaming: false,
            maxRetries: 2,
        });

        this.geminiLarge = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-pro',
            temperature: 0.0,
            maxOutputTokens: 8000,
            streaming: false,
            maxRetries: 2,
        });

        this.geminiSmall = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-flash-lite',
            temperature: 0.0,
            maxOutputTokens: 8000,
            streaming: false,
            maxRetries: 2,
        });
    }

    /**
     * 매핑 스크립트 생성 (AI 사용)
     * - workFlowCodeId로 WorkflowCode의 mappingSuggestion 로드
     * - AI를 사용하여 mappingScript JSON 생성
     * - 생성된 mappingScript를 WorkflowCode에 업데이트
     */
    async createMappingScript(dto: CreateMappingScriptReqDto): Promise<CreateMappingScriptResDto> {
        const { sourceSheetVersionId, targetSheetVersionId, workFlowCodeId, modelType = 'small' } = dto;

        this.logger.log(
            `Creating mapping script - sourceSheetVersionId: ${sourceSheetVersionId}, targetSheetVersionId: ${targetSheetVersionId}, workFlowCodeId: ${workFlowCodeId}, model: ${modelType}`,
        );

        // 1. Load WorkflowCode (contains mappingSuggestion)
        const workflowCode = await this.prisma.workflowCode.findUnique({
            where: { id: workFlowCodeId },
        });

        if (!workflowCode) {
            throw new NotFoundException(`Workflow code not found: ${workFlowCodeId}`);
        }

        if (!workflowCode.mappingSuggestion) {
            throw new BadRequestException('WorkflowCode does not have mappingSuggestion');
        }

        // 2. Load source and target sheet versions
        const [sourceSheetVersion, targetSheetVersion] = await Promise.all([
            this.prisma.sourceSheetVersion.findUnique({
                where: { id: sourceSheetVersionId },
            }),
            this.prisma.targetSheetVersion.findUnique({
                where: { id: targetSheetVersionId },
            }),
        ]);

        if (!sourceSheetVersion) {
            throw new NotFoundException(`Source sheet version not found: ${sourceSheetVersionId}`);
        }

        if (!targetSheetVersion) {
            throw new NotFoundException(`Target sheet version not found: ${targetSheetVersionId}`);
        }

        // 3. Select AI model
        let selectedModel: ChatGoogleGenerativeAI;
        let modelName: string;

        switch (modelType) {
            case 'large':
                selectedModel = this.geminiLarge;
                modelName = 'gemini-2.5-pro (Large)';
                break;
            case 'normal':
                selectedModel = this.geminiNormal;
                modelName = 'gemini-2.5-flash (Normal)';
                break;
            case 'small':
            default:
                selectedModel = this.geminiSmall;
                modelName = 'gemini-2.5-flash-lite (Small)';
                break;
        }

        this.logger.log(`Using AI model: ${modelName}`);

        // 4. Create runnable and invoke
        const mappingScriptMakerRunnable = createMappingScriptMakerRunnable(selectedModel);

        // Prepare input for the runnable
        const runnableInput = {
            sourceSheet: JSON.stringify(sourceSheetVersion.data, null, 2),
            targetSheet: JSON.stringify(targetSheetVersion.data, null, 2),
            mappingSuggestion: workflowCode.mappingSuggestion,
        };

        this.logger.log('Invoking AI to generate mapping script...');
        const startTime = Date.now();

        const mappingScriptString = await mappingScriptMakerRunnable.invoke(runnableInput);

        const elapsedTime = Date.now() - startTime;
        this.logger.log(`AI generation completed in ${elapsedTime}ms`);

        // 5. Parse the result
        let mappingScript: Record<string, any>;
        try {
            mappingScript = JSON.parse(mappingScriptString);
        } catch (error) {
            throw new BadRequestException(`Failed to parse AI-generated mapping script: ${error.message}`);
        }

        // 6. Update WorkflowCode with generated mappingScript
        await this.prisma.workflowCode.update({
            where: { id: workFlowCodeId },
            data: {
                mappingScript,
            },
        });

        this.logger.log(`Mapping script saved to WorkflowCode: ${workFlowCodeId}`);

        return {
            success: true,
            workFlowCodeId,
            mappingScript,
        };
    }
}
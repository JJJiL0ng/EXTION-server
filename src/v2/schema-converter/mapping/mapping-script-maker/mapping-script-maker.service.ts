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
            maxOutputTokens: 16384, // 증가: 큰 매핑 스크립트 지원
            streaming: false,
            maxRetries: 2,
        });

        this.geminiLarge = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-pro',
            temperature: 0.0,
            maxOutputTokens: 16384, // 증가: 큰 매핑 스크립트 지원
            streaming: false,
            maxRetries: 2,
        });

        this.geminiSmall = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-flash-lite',
            temperature: 0.0,
            maxOutputTokens: 16384, // 증가: 큰 매핑 스크립트 지원
            streaming: false,
            maxRetries: 2,
        });
    }

    /**
     * 매핑 스크립트 생성 (AI 사용)
     * - workFlowCodeId로 WorkflowCode의 mappingSuggestion 로드
     * - userId 검증: WorkflowCode가 해당 유저의 것인지 확인
     * - AI를 사용하여 mappingScript JSON 생성
     * - 생성된 mappingScript를 WorkflowCode에 업데이트
     */
    async createMappingScript(dto: CreateMappingScriptReqDto): Promise<CreateMappingScriptResDto> {
        const { userId, sourceSheetVersionId, targetSheetVersionId, workFlowCodeId, modelType = 'small' } = dto;

        this.logger.log(
            `Creating mapping script - userId: ${userId}, sourceSheetVersionId: ${sourceSheetVersionId}, targetSheetVersionId: ${targetSheetVersionId}, workFlowCodeId: ${workFlowCodeId}, model: ${modelType}`,
        );

        // 1. Load WorkflowCode (contains mappingSuggestion) with workflow relation
        const workflowCode = await this.prisma.workflowCode.findUnique({
            where: { id: workFlowCodeId },
            include: {
                workflow: true, // Include workflow to check userId
            },
        });

        if (!workflowCode) {
            throw new NotFoundException(`Workflow code not found: ${workFlowCodeId}`);
        }

        // 2. Validate userId - ensure the workflow belongs to the user
        if (workflowCode.workflow.userId !== userId) {
            this.logger.warn(
                `Unauthorized access attempt - userId: ${userId}, workflowOwnerId: ${workflowCode.workflow.userId}`,
            );
            throw new BadRequestException(
                `Unauthorized: This workflow belongs to a different user`,
            );
        }

        if (!workflowCode.mappingSuggestion) {
            throw new BadRequestException('WorkflowCode does not have mappingSuggestion');
        }

        this.logger.log(`UserId validation passed - user owns this workflow`);

        // 3. Load source and target sheet versions
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

        // 4. Select AI model
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

        // 5. Prepare sheet data - use parsedData if available, otherwise use raw data
        let sourceSheetData: Record<string, any>;
        let targetSheetData: Record<string, any>;
        let parseTime = 0;

        if (sourceSheetVersion.parsedData && targetSheetVersion.parsedData) {
            // Use pre-parsed data
            this.logger.log('[PERF] Using pre-parsed data from database');
            sourceSheetData = sourceSheetVersion.parsedData as Record<string, any>;
            targetSheetData = targetSheetVersion.parsedData as Record<string, any>;
        } else {
            // Parse raw data
            this.logger.log('[PERF] Parsing raw sheet data...');
            const parseStartTime = Date.now();

            const parsedSourceSheet = await sheetNameParser(
                sourceSheetVersion.mappingSheetName ? [sourceSheetVersion.mappingSheetName] : [],
                sourceSheetVersion.data as Record<string, any>,
                { logger: this.logger },
            );

            const parsedTargetSheet = await sheetNameParser(
                targetSheetVersion.mappingSheetName ? [targetSheetVersion.mappingSheetName] : [],
                targetSheetVersion.data as Record<string, any>,
                { logger: this.logger },
            );

            sourceSheetData = parsedSourceSheet || (sourceSheetVersion.data as Record<string, any>);
            targetSheetData = parsedTargetSheet || (targetSheetVersion.data as Record<string, any>);

            parseTime = Date.now() - parseStartTime;
            this.logger.log(`[PERF] Sheet parsing took: ${parseTime}ms`);
        }

        // 6. Create runnable and invoke
        const mappingScriptMakerRunnable = createMappingScriptMakerRunnable(selectedModel);

        // Prepare input for the runnable
        // Format range info: "rowStart-rowEnd-colStart-colEnd"
        const sourceRange = sourceSheetVersion.sourceSheetRange as number[] | null;
        const sourceSheetRange = sourceRange
            ? `${sourceRange[0]}-${sourceRange[1]}-0-end`
            : 'all';

        const targetRange = targetSheetVersion.targetSheetRange as number[] | null;
        const targetSheetRange = targetRange
            ? `${targetRange[0]}-${targetRange[1]}-0-end`
            : 'all';

        const runnableInput = {
            sourceSheetRange,
            sourceSheet: JSON.stringify(sourceSheetData, null, 2),
            targetSheetRange,
            targetSheet: JSON.stringify(targetSheetData, null, 2),
            mappingRequest: workflowCode.mappingSuggestion,
        };

        this.logger.log('Invoking AI to generate mapping script...');
        const startTime = Date.now();

        const mappingScriptString = await mappingScriptMakerRunnable.invoke(runnableInput);

        const elapsedTime = Date.now() - startTime;
        this.logger.log(`[PERF] AI generation completed in ${elapsedTime}ms (parse: ${parseTime}ms, AI: ${elapsedTime}ms)`);

        // 7. Parse the result
        let mappingScript: Record<string, any>;
        try {
            mappingScript = JSON.parse(mappingScriptString);
        } catch (error) {
            throw new BadRequestException(`Failed to parse AI-generated mapping script: ${error.message}`);
        }

        // 8. Update WorkflowCode with generated mappingScript
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
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { createMultiturnMappingRunnable } from '../mapping-agent/runnable/multiturnMapping.runnable';
import { editScriptReqDto, editScriptResDto } from './dto/editScript.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { sheetNameParser } from '../mapping-agent/sheetParser/sheetNameParser';

@Injectable()
export class MultiturnChattingService {
    private readonly logger = new Logger(MultiturnChattingService.name);
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
            maxOutputTokens: 16384,
            streaming: false,
            maxRetries: 2,
        });

        this.geminiLarge = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-pro',
            temperature: 0.0,
            maxOutputTokens: 16384,
            streaming: false,
            maxRetries: 2,
        });

        this.geminiSmall = new ChatGoogleGenerativeAI({
            apiKey: this.configService.get<string>('GOOGLE_API_KEY'),
            model: 'gemini-2.5-flash-lite',
            temperature: 0.0,
            maxOutputTokens: 16384,
            streaming: false,
            maxRetries: 2,
        });
    }

    /**
     * 멀티턴 채팅으로 매핑 제안(mappingSuggestion) 수정
     * - 현재 WorkflowCode의 mappingSuggestion을 읽어옴
     * - userId 검증: Workflow가 해당 유저의 것인지 확인
     * - 채팅 히스토리와 사용자 메시지를 기반으로 AI가 수정된 제안 생성
     * - 새로운 WorkflowCode 생성 (mappingSuggestion만, mappingScript는 빈 객체)
     * - SchemaConverterChat에 메시지 저장
     *
     * Note: mappingScript 생성은 사용자가 제안을 승인할 때 별도 API로 처리
     */
    async editMappingScript(dto: editScriptReqDto): Promise<editScriptResDto> {
        const { userId, message, workFlowId, workFlowCodeId, sourceSheetVersionId, targetSheetVersionId, modelType = 'small' } = dto;

        this.logger.log(
            `Editing mapping script - userId: ${userId}, workFlowId: ${workFlowId}, workFlowCodeId: ${workFlowCodeId}, model: ${modelType}`,
        );

        // 1. 워크플로우 확인 및 채팅 로드
        const workflow = await this.prisma.schemaConverterWorkflow.findUnique({
            where: { id: workFlowId },
            include: {
                chat: {
                    include: {
                        messages: {
                            orderBy: { createdAt: 'asc' },
                        },
                    },
                },
            },
        });

        if (!workflow) {
            throw new NotFoundException(`Workflow not found: ${workFlowId}`);
        }

        // 2. Validate userId - ensure the workflow belongs to the user
        if (workflow.userId !== userId) {
            this.logger.warn(
                `Unauthorized access attempt - userId: ${userId}, workflowOwnerId: ${workflow.userId}`,
            );
            throw new BadRequestException(
                `Unauthorized: This workflow belongs to a different user`,
            );
        }

        this.logger.log(`UserId validation passed - user owns this workflow`);

        // 3. 채팅이 없으면 생성
        let chat = workflow.chat;
        if (!chat) {
            this.logger.log(`Creating new chat for workflow: ${workFlowId}`);
            chat = await this.prisma.schemaConverterChat.create({
                data: {
                    workflowId: workFlowId,
                },
                include: {
                    messages: true,
                },
            });
        }

        // 4. 현재 WorkflowCode 로드
        const currentCode = await this.prisma.workflowCode.findUnique({
            where: { id: workFlowCodeId },
        });

        if (!currentCode) {
            throw new NotFoundException(`WorkflowCode not found: ${workFlowCodeId}`);
        }

        // mappingSuggestion이 없어도 새로 생성 가능 (빈 문자열로 시작)

        // 5. 소스 및 타겟 시트 버전 로드
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

        // 6. AI 모델 선택
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

        // 7. 시트 데이터 준비 (parsedData 우선 사용)
        let sourceSheetData: Record<string, any>;
        let targetSheetData: Record<string, any>;

        if (sourceSheetVersion.parsedData && targetSheetVersion.parsedData) {
            this.logger.log('[PERF] Using pre-parsed data from database');
            sourceSheetData = sourceSheetVersion.parsedData as Record<string, any>;
            targetSheetData = targetSheetVersion.parsedData as Record<string, any>;
        } else {
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

            const parseTime = Date.now() - parseStartTime;
            this.logger.log(`[PERF] Sheet parsing took: ${parseTime}ms`);
        }

        // 8. 대화 히스토리 구성
        const chatHistory = chat.messages.map((msg) => ({
            role: msg.role.toLowerCase(),
            content: msg.content,
        }));

        // Range 정보 포맷팅
        const sourceRange = sourceSheetVersion.sourceSheetRange as number[] | null;
        const targetRange = targetSheetVersion.targetSheetRange as number[] | null;

        // 9. mappingSuggestion 생성
        this.logger.log('Generating mapping suggestion with previous context...');
        const multiturnMappingRunnable = createMultiturnMappingRunnable(selectedModel);

        // 이전 매핑 제안 (currentCode에서 가져옴)
        const previousMappingSuggestion = currentCode.mappingSuggestion || '';

        // 대화 히스토리를 문자열로 변환
        const chatHistoryStr = chatHistory.length > 0
            ? chatHistory.map((msg) => `[${msg.role.toUpperCase()}]: ${msg.content}`).join('\n')
            : '(아직 대화 기록이 없습니다)';

        const suggestionStartTime = Date.now();

        // multiturn mapping runnable 호출
        // MULTITURN_MAPPING_HUMAN_PROMPT 파라미터 구조에 맞춰 전달
        const modifiedMappingSuggestion = await multiturnMappingRunnable.invoke({
            sourceSheet: JSON.stringify(sourceSheetData, null, 2),
            sourceSheetRange: sourceRange ? `${sourceRange[0]}-${sourceRange[1]}-0-end` : 'all',
            targetSheet: JSON.stringify(targetSheetData, null, 2),
            targetSheetRange: targetRange ? `${targetRange[0]}-${targetRange[1]}-0-end` : 'all',
            previousMappingSuggestion: previousMappingSuggestion,
            mappingRequest: `${message}\n\n# 대화 히스토리\n${chatHistoryStr}`,
        });

        const suggestionElapsedTime = Date.now() - suggestionStartTime;
        this.logger.log(`[PERF] Mapping suggestion generation completed in ${suggestionElapsedTime}ms`);

        // 10. 새 WorkflowCode 생성 (버전 체인)
        // mappingScript는 빈 객체로 저장 (사용자가 승인 후 별도 API로 생성)
        const newCode = await this.prisma.workflowCode.create({
            data: {
                workflowId: workFlowId,
                name: `매핑 제안 수정 - ${new Date().toISOString()}`,
                code: currentCode.code,
                mappingSuggestion: modifiedMappingSuggestion, // 새로 생성된 mappingSuggestion 사용
                mappingScript: {}, // 빈 객체 (사용자 승인 후 생성 예정)
                parentId: workFlowCodeId, // 버전 체인
                generatedByChatId: chat.id,
            },
        });

        this.logger.log(`New WorkflowCode created: ${newCode.id}`);

        // 11. 채팅 메시지 저장
        await this.prisma.$transaction([
            this.prisma.schemaConverterMessage.create({
                data: {
                    chatId: chat.id,
                    role: 'USER',
                    content: message,
                },
            }),
            this.prisma.schemaConverterMessage.create({
                data: {
                    chatId: chat.id,
                    role: 'ASSISTANT',
                    content: '매핑 제안을 수정했습니다.',
                    metadata: {
                        workflowCodeId: newCode.id,
                    },
                },
            }),
        ]);

        this.logger.log(`Chat messages saved for workflow: ${workFlowId}`);

        return {
            success: true,
            workFlowCodeId: newCode.id,
            mappingSuggestion: modifiedMappingSuggestion,
        };
    }
}

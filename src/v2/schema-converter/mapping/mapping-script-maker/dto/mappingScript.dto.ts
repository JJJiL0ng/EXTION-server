export class CreateMappingScriptReqDto {
    sourceSheetVersionId: string;
    targetSheetVersionId: string;
    workFlowCodeId: string;
    modelType?: 'small' | 'normal' | 'large'; // AI 모델 선택 (기본값: 'small')
}

export class CreateMappingScriptResDto {
    success: boolean;
    workFlowCodeId: string;
    mappingScript: Record<string, any>;
}


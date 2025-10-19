export class FixScriptReqDto {
    message: string;
    workFlowId: string;
    workFlowCodeId: string;
    sourceSheetVersionId: string;
    targetSheetVersionId: string;
}

export class FixScriptResDto {
    success: boolean;
    workFlowCodeId: string;
    mappingScript: Record<string, any>;
}
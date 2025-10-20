import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class CreateMappingScriptReqDto {
    @IsString()
    @IsNotEmpty()
    userId: string;

    @IsString()
    @IsNotEmpty()
    sourceSheetVersionId: string;

    @IsString()
    @IsNotEmpty()
    targetSheetVersionId: string;

    @IsString()
    @IsNotEmpty()
    workFlowCodeId: string;

    @IsOptional()
    @IsIn(['small', 'normal', 'large'])
    modelType?: 'small' | 'normal' | 'large'; // AI 모델 선택 (기본값: 'small')
}

export class CreateMappingScriptResDto {
    success: boolean;
    workFlowCodeId: string;
    mappingScript: Record<string, any>;
}


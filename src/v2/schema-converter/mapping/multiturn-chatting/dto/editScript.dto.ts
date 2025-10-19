import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class editScriptReqDto {
    @IsString()
    @IsNotEmpty()
    message: string;

    @IsString()
    @IsNotEmpty()
    workFlowId: string;

    @IsString()
    @IsNotEmpty()
    workFlowCodeId: string;

    @IsString()
    @IsNotEmpty()
    sourceSheetVersionId: string;

    @IsString()
    @IsNotEmpty()
    targetSheetVersionId: string;

    @IsOptional()
    @IsIn(['small', 'normal', 'large'])
    modelType?: 'small' | 'normal' | 'large';
}

export class editScriptResDto {
    success: boolean;
    workFlowCodeId: string;
    mappingSuggestion: string;
}
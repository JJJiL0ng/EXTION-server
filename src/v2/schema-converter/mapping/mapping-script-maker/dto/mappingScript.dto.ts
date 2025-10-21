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

// 매핑 아이템: source와 target의 row, col 정보를 담은 객체
export interface MappingItem {
    source_row: number;
    source_col: number;
    target_row: number;
    target_col: number;
}

// 매핑 스크립트: 소스/타겟 시트 이름과 매핑 배열
export interface MappingScript {
    source_sheet: string;
    target_sheet: string;
    mappings: MappingItem[];
}

export class CreateMappingScriptResDto {
    success: boolean;
    workFlowCodeId: string;
    mappingScript: MappingScript;
}


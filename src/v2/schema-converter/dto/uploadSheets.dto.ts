// src/schema-converter/dto/upload-sheets.dto.ts

import { IsNotEmpty, IsObject, IsOptional, IsString, IsBoolean, IsArray } from 'class-validator';

export class UploadSheetsDto {
    @IsNotEmpty()
    @IsObject()
    sourceSheetData: Record<string, any>;

    @IsNotEmpty()
    @IsObject()
    targetSheetData: Record<string, any>;

    @IsString()
    sourceSheetName: string; // "소스 v1", "2025-01-15 업로드" 등

    @IsString()
    targetSheetName: string; // "타겟 v1" 등

    @IsNotEmpty()
    @IsBoolean()
    isFirstWorkFlowGenerated: boolean; // 처음 워크플로우 생성 여부

    @IsOptional()
    @IsBoolean()
    isExcuteMappingSuggestion?: boolean; // 매핑 제안 실행 여부 (기본값: true)

    @IsOptional()
    @IsArray()
    sourceSheetRange?: number[]; // [시작행, 종료행] - 선택사항

    @IsOptional()
    @IsString()
    selectedSourceSheetName?: string; // 선택된 시트 이름 - 선택사항

    @IsOptional()
    @IsArray()
    targetSheetRange?: number[]; // [시작행, 종료행] - 선택사항

    @IsOptional()
    @IsString()
    selectedTargetSheetName?: string; // 선택된 시트 이름 - 선택사항

    @IsOptional()
    @IsString()
    workFlowId?: string; // 기존 워크플로우 ID
}

export class UploadSheetsResDto {
    success: boolean;
    workflowId: string;
    sourceSheetVersionId: string;
    targetSheetVersionId: string;
    mappingSuggestions?: string; // 매핑 제안 결과 (선택적)
}

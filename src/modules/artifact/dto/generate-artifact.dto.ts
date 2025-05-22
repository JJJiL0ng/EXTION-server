// src/modules/artifact/dto/generate-artifact.dto.ts - 수정된 버전
import { IsString, IsArray, IsOptional, IsEnum, IsNotEmpty, MaxLength, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export enum ArtifactType {
  CHART = 'chart',
  TABLE = 'table',
  ANALYSIS = 'analysis'
}

export class HeaderInfo {
  @IsString()
  column: string;

  @IsString()
  name: string;
}

export class DataRange {
  @IsString()
  startRow: string;

  @IsString()
  endRow: string;

  @IsOptional()
  @IsString()
  startColumn?: string;

  @IsOptional()
  @IsString()
  endColumn?: string;

  @IsOptional()
  @IsString()
  startColLetter?: string;

  @IsOptional()
  @IsString()
  endColLetter?: string;
}

// 시트 데이터 메타데이터 클래스 정의
export class SheetMetadata {
  @IsNumber()
  rowCount: number;

  @IsNumber()
  columnCount: number;

  @IsOptional()
  @IsNumber()
  headerRow?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DataRange)
  dataRange?: DataRange;
}

// ✅ 시트 데이터 아이템 메타데이터 수정 (DataFix/DataGeneration과 동일하게)
export class SheetDataItemMetadata {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  headers?: string[];

  @IsOptional()
  @IsNumber()
  rowCount?: number;

  @IsOptional()
  @IsNumber()
  columnCount?: number;

  @IsOptional()
  @IsArray()
  sampleData?: string[][]; // ✅ any[] → string[][]로 변경

  // ✅ 새로 추가: 전체 데이터 필드
  @IsOptional()
  @IsArray()
  fullData?: string[][];

  @IsOptional()
  @IsNumber()
  sheetIndex?: number;

  // ✅ 새로 추가: 원본 메타데이터
  @IsOptional()
  originalMetadata?: any;
}

// 다중 시트를 위한 새로운 인터페이스
export class SheetData {
  @IsString()
  sheetName: string;

  @IsArray()
  @IsString({ each: true })
  headers: string[];

  @IsArray()
  data: string[][];

  @IsOptional()
  @ValidateNested()
  @Type(() => SheetMetadata)
  metadata?: SheetMetadata;
}

// 확장된 시트 컨텍스트
export class ExtendedSheetContext {
  @IsString()
  sheetName: string;

  @IsNumber()
  sheetIndex: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeaderInfo)
  headers: HeaderInfo[];

  @ValidateNested()
  @Type(() => DataRange)
  dataRange: DataRange;

  @IsOptional()
  @IsArray()
  sampleData?: Record<string, string>[];

  @IsNumber()
  totalSheets: number;

  @IsArray()
  @IsString({ each: true })
  sheetList: string[];
}

// 시트 데이터 아이템 수정
export class SheetDataItem {
  @IsString()
  name: string;

  @IsString()
  csv: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SheetDataItemMetadata)
  metadata?: SheetDataItemMetadata;
}

// ✅ 다중 시트 데이터 구조 수정 (DataFix/DataGeneration과 동일하게)
export class SheetsData {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SheetDataItem)
  sheets: SheetDataItem[];

  @IsString()
  activeSheet: string;

  // ✅ 새로 추가: 전체 컨텍스트 정보
  @IsOptional()
  @IsNumber()
  totalSheets?: number;

  @IsOptional()
  @IsString()
  fileName?: string;
}

// 기존 SheetContext는 하위 호환성을 위해 유지
export class SheetContext {
  @IsString()
  sheetName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeaderInfo)
  headers: HeaderInfo[];

  @ValidateNested()
  @Type(() => DataRange)
  dataRange: DataRange;

  @IsOptional()
  @IsArray()
  sampleData?: Record<string, string>[];
}

export class GenerateArtifactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  userInput: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SheetContext)
  sheetContext?: SheetContext;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExtendedSheetContext)
  extendedSheetContext?: ExtendedSheetContext;

  @IsOptional()
  @ValidateNested()
  @Type(() => SheetsData)
  sheetsData?: SheetsData;

  @IsString()
  @IsOptional()
  language?: string = 'ko';
}

export class ArtifactResponseDto {
  success: boolean;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(ArtifactType)
  type?: ArtifactType;

  @IsOptional()
  explanation?: {
    korean: string;
    english?: string;
  };

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  timestamp?: Date;
}
// src/common/dto/chat.dto.ts - 공통 채팅 관련 DTO
import { IsString, IsOptional, IsNotEmpty, IsUUID, IsEnum, IsBoolean, IsArray, ValidateNested, IsDateString, IsNumber } from 'class-validator';
import { Type, Transform } from 'class-transformer';

// 메시지 타입 enum
export enum MessageType {
  TEXT = 'text',
  FILE_UPLOAD = 'file_upload', 
  FORMULA = 'formula',
  ARTIFACT = 'artifact',
  DATA_GENERATION = 'data_generation',
  DATA_FIX = 'data_fix'
}

export enum MessageRole {
  USER = 'user',
  EXTION_AI = 'Extion ai',
  SYSTEM = 'system'
}

export enum MessageMode {
  NORMAL = 'normal',
  FORMULA = 'formula', 
  ARTIFACT = 'artifact',
  DATA_GENERATION = 'datageneration',
  DATA_FIX = 'datafix'
}

// 시트 컨텍스트 DTO
export class SheetContextDto {
  @IsNumber()
  @IsOptional()
  sheetIndex?: number;

  @IsString()
  sheetName: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  affectedCells?: string[];

  @IsNumber()
  @IsOptional()
  totalRows?: number;

  @IsNumber()
  @IsOptional()
  totalColumns?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  headers?: string[];
}

// 수식 데이터 DTO
export class FormulaDataDto {
  @IsString()
  formula: string;

  @IsString()
  cellAddress: string;

  @IsString()
  @IsOptional()
  functionType?: string;

  @IsOptional()
  explanation?: {
    korean?: string;
    english?: string;
  } | string; // 하위 호환성을 위해 string도 허용

  @IsOptional()
  examples?: Array<{
    range: string;
    formula: string;
    description: string;
  }>;

  @IsOptional()
  alternatives?: Array<{
    formula: string;
    reason: string;
    complexity?: number;
  }>;

  @IsString()
  @IsOptional()
  warning?: string;

  @IsNumber()
  @IsOptional()
  sheetIndex?: number;

  @IsBoolean()
  @IsOptional()
  crossSheetReference?: boolean;
}

// 아티팩트 데이터 DTO
export class ArtifactDataDto {
  @IsEnum(['chart', 'table', 'analysis'])
  type: 'chart' | 'table' | 'analysis';

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  codeSnippet?: string;

  @IsString()
  artifactId: string;

  @IsString()
  code: string;

  @IsString()
  @IsOptional()
  explanation?: string;
}

// 데이터 변경 정보 DTO
export class DataChangeInfoDto {
  @IsEnum(['generation', 'modification', 'sorting', 'filtering'])
  changeType: 'generation' | 'modification' | 'sorting' | 'filtering';

  @IsArray()
  @IsNumber({}, { each: true })
  affectedSheets: number[];

  @IsNumber()
  rowsChanged: number;

  @IsNumber()
  columnsChanged: number;

  @IsString()
  summary: string;
}

// 파일 업로드 정보 DTO
export class FileUploadInfoDto {
  @IsString()
  fileName: string;

  @IsNumber()
  fileSize: number;

  @IsEnum(['xlsx', 'csv'])
  fileType: 'xlsx' | 'csv';

  @IsArray()
  @IsString({ each: true })
  sheetsAdded: string[];

  @IsNumber()
  processingTime: number;
}

// 채팅 메시지 생성 DTO
export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsEnum(MessageRole)
  role: MessageRole;

  @IsEnum(MessageType)
  type: MessageType;

  @IsEnum(MessageMode)
  @IsOptional()
  mode?: MessageMode;

  @IsOptional()
  @ValidateNested()
  @Type(() => SheetContextDto)
  sheetContext?: SheetContextDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FormulaDataDto)
  formulaData?: FormulaDataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ArtifactDataDto)
  artifactData?: ArtifactDataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DataChangeInfoDto)
  dataChangeInfo?: DataChangeInfoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FileUploadInfoDto)
  fileUploadInfo?: FileUploadInfoDto;
}

// 채팅 생성 DTO
export class CreateChatDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;
}

// 채팅 업데이트 DTO
export class UpdateChatDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  @IsEnum(['active', 'archived', 'deleted'])
  status?: 'active' | 'archived' | 'deleted';
}

// 스프레드시트 메타데이터 DTO
export class SpreadsheetMetadataDto {
  @IsBoolean()
  hasSpreadsheet: boolean;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsNumber()
  totalSheets: number;

  @IsNumber()
  activeSheetIndex: number;

  @IsArray()
  @IsString({ each: true })
  sheetNames: string[];

  @Transform(({ value }) => new Date(value))
  @IsDateString()
  lastModifiedAt: Date;
}
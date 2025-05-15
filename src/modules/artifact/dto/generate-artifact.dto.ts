//src/modules/artifact/dto/generate-artifact.dto.ts
import { IsString, IsArray, IsOptional, IsEnum, IsNotEmpty, MaxLength } from 'class-validator';

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
}

export class SheetContext {
  @IsString()
  sheetName: string;

  @IsArray()
  headers: HeaderInfo[];

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
  sheetContext?: SheetContext;

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
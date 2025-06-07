// src/modules/artifact/dto/generate-artifact.dto.ts
import { IsString, IsArray, IsOptional, IsNotEmpty, MaxLength, ValidateNested, IsNumber, IsBoolean, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 단일 시트의 데이터 구조입니다.
 * 클라이언트의 SimpleSheetData 인터페이스 및 createRequestBody 구현과 일치합니다.
 */
export class SimpleSheetDataDto {
  @IsString()
  @IsNotEmpty()
  name: string;
  
  @IsArray()
  // 각 행이 문자열 배열인지 확인합니다.
  @IsArray({ each: true })
  data: string[][];
  
  @IsOptional()
  @IsNumber()
  sheetIndex?: number;
}

/**
 * 전체 스프레드시트의 데이터 구조입니다.
 * 클라이언트의 SpreadsheetData 인터페이스와 일치합니다.
 */
export class SpreadsheetDataDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimpleSheetDataDto)
  sheets: SimpleSheetDataDto[];
  
  @IsString()
  @IsNotEmpty()
  activeSheet: string;
  
  @IsString()
  @IsNotEmpty()
  fileName: string;
  
  @IsString()
  // spreadsheetId는 빈 문자열일 수 있으므로 IsNotEmpty는 제외합니다.
  spreadsheetId: string;
}

/**
 * 아티팩트 생성 요청의 메인 DTO입니다.
 * 클라이언트의 ProcessDataRequestDTO 인터페이스와 일치합니다.
 */
export class GenerateArtifactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000) // 사용자 입력 길이를 넉넉하게 설정
  userInput: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  chatId: string;

  // 클라이언트에서 항상 spreadsheetData 객체를 보내므로 IsOptional을 제거합니다.
  @ValidateNested()
  @Type(() => SpreadsheetDataDto)
  spreadsheetData: SpreadsheetDataDto;

  @IsOptional()
  @IsString()
  language?: string = 'ko';

  @IsOptional()
  @IsString()
  messageId?: string;
  
  @IsOptional()
  @IsString()
  chatTitle?: string;
}

export enum ArtifactType {
  CHART = 'chart',
  TABLE = 'table',
  ANALYSIS = 'analysis',
}

class ExplanationDto {
  @IsString()
  korean: string;
}

class SpreadsheetMetadataResponseDto {
  @IsBoolean()
  hasSpreadsheet: boolean;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsNumber()
  totalSheets?: number;

  @IsOptional()
  @IsNumber()
  activeSheetIndex?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sheetNames?: string[];
}

export class ArtifactResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  code: string;

  @IsEnum(ArtifactType)
  type: ArtifactType;

  @ValidateNested()
  @Type(() => ExplanationDto)
  explanation: ExplanationDto;

  @IsString()
  title: string;

  @IsString()
  timestamp: string;

  @IsString()
  chatId: string;

  @IsString()
  userMessageId: string;

  @IsString()
  aiMessageId: string;

  @ValidateNested()
  @Type(() => SpreadsheetMetadataResponseDto)
  spreadsheetMetadata: SpreadsheetMetadataResponseDto;
}
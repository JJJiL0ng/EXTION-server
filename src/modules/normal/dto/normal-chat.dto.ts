// src/modules/normalchat/dto/normal-chat.dto.ts
import { IsString, IsOptional, IsNotEmpty, MaxLength, ValidateNested, IsBoolean, IsUUID, IsArray, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

// 프론트엔드의 getDataForGPTAnalysis 반환 구조에 맞춘 DTO
export class SheetMetadataDto {
  @IsArray()
  @IsString({ each: true })
  headers: string[];

  @IsNumber()
  rowCount: number;

  @IsNumber()
  columnCount: number;

  @IsArray()
  fullData: string[][];

  @IsOptional()
  @IsArray()
  sampleData?: string[][];

  @IsNumber()
  sheetIndex: number;

  @IsOptional()
  originalMetadata?: any;
}

// ✅ 시트 데이터 아이템 - csv 필드를 선택사항으로 수정
export class SheetDataItemDto {
  @IsString()
  name: string;

  // ✅ csv 필드를 선택사항으로 변경
  @IsOptional()
  @IsString()
  csv?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SheetMetadataDto)
  metadata?: SheetMetadataDto;
}

// 다중 시트 데이터 구조
export class SheetsDataDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SheetDataItemDto)
  sheets: SheetDataItemDto[];

  @IsString()
  activeSheet: string;

  @IsOptional()
  @IsNumber()
  totalSheets?: number;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsNumber()
  currentSheetIndex?: number;
}

// ExtendedSheetContext는 기존과 동일하게 유지
export class HeaderInfoDto {
  @IsString()
  column: string;

  @IsString()
  name: string;
}

export class DataRangeDto {
  @IsString()
  startRow: string;

  @IsString()
  endRow: string;

  @IsString()
  startColumn: string;

  @IsString()
  endColumn: string;
}

export class ExtendedSheetContext {
  @IsString()
  sheetName: string;

  @IsNumber()
  sheetIndex: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeaderInfoDto)
  headers: HeaderInfoDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DataRangeDto)
  dataRange?: DataRangeDto;

  @IsOptional()
  sampleData?: Record<string, string>[];

  @IsNumber()
  totalSheets: number;

  @IsArray()
  sheetList: string[];
}

// 일반 채팅 요청 DTO 수정
export class NormalChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  userInput: string;

  @IsString()
  userId: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsString()
  @IsOptional()
  chatTitle?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExtendedSheetContext)
  extendedSheetContext?: ExtendedSheetContext;

  // 새로운 sheetsData 구조
  @IsOptional()
  @ValidateNested()
  @Type(() => SheetsDataDto)
  sheetsData?: SheetsDataDto;

  // 레거시 호환성을 위해 유지
  @IsOptional()
  @ValidateNested()
  @Type(() => SheetsDataDto)
  currentData?: SheetsDataDto;

  @IsString()
  @IsOptional()
  language?: string = 'ko';

  @IsString()
  @IsOptional()
  messageId?: string;
}

// 응답 DTO는 기존과 동일
export class NormalChatResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsString()
  @IsOptional()
  messageId?: string;

  @IsString()
  @IsOptional()
  userMessageId?: string;

  @IsString()
  @IsOptional()
  aiMessageId?: string;

  @IsOptional()
  spreadsheetMetadata?: any;

  @IsString()
  @IsOptional()
  error?: string;

  @IsString()
  @IsOptional()
  timestamp?: string;
}
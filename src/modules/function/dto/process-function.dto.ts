import { IsString, IsArray, IsOptional, IsNotEmpty, MaxLength, ValidateNested, IsNumber, IsBoolean, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

// 간단한 시트 데이터 구조
export class SimpleSheetData {
  @IsString()
  name: string;
  
  @IsArray()
  data: string[][];
  
  @IsOptional()
  @IsNumber()
  sheetIndex?: number;
}

// 스프레드시트 데이터 구조
export class SpreadsheetData {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimpleSheetData)
  sheets: SimpleSheetData[];
  
  @IsString()
  activeSheet: string;
  
  @IsOptional()
  @IsString()
  fileName?: string;
  
  @IsString()
  spreadsheetId: string;
}

// 데이터 수정 요청 DTO
export class ProcessDataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  userInput: string;
  
  @ValidateNested()
  @Type(() => SpreadsheetData)
  spreadsheetData: SpreadsheetData;
  
  @IsOptional()
  @IsString()
  language?: string = 'ko';
  
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsString()
  chatTitle?: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsNumber()
  targetSheetIndex?: number;

  @IsString()
  @IsOptional()
  spreadsheetId?: string;
}

// 데이터 수정 결과 DTO
export class EditedDataDto {
  @IsString()
  sheetName: string;
  
  @IsArray()
  data: string[][];
}

// 변경 내역 DTO
export class ChangesDto {
  @IsString()
  @IsIn(['sort', 'filter', 'modify', 'transform'])
  type: 'sort' | 'filter' | 'modify' | 'transform';
  
  @IsString()
  details: string;
}

export class FunctionDetailsDto {
  @IsString()
  functionType: string;

  @IsString()
  sourceRange: string;

  @IsString()
  targetCell: string;

  result: any;
  
  @IsString()
  formula: string;
}

// 데이터 수정 응답 DTO
export class FunctionResponseDto {
  @IsBoolean()
  success: boolean;
  
  @IsString()
  explanation: string;
  
  @ValidateNested()
  @Type(() => FunctionDetailsDto)
  functionDetails: FunctionDetailsDto;
  
  @IsOptional()
  @ValidateNested()
  @Type(() => EditedDataDto)
  editedData?: EditedDataDto;
  
  @IsOptional()
  @IsNumber()
  sheetIndex?: number;
  
  @IsOptional()
  @ValidateNested()
  @Type(() => ChangesDto)
  changes?: ChangesDto;
  
  @IsString()
  @IsOptional()
  error?: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsString()
  @IsOptional()
  userMessageId?: string;

  @IsString()
  @IsOptional()
  aiMessageId?: string;

  @IsString()
  @IsOptional()
  messageId?: string;

  @IsOptional()
  spreadsheetMetadata?: {
    fileName?: string;
    totalSheets?: number;
    activeSheetIndex?: number;
    sheetNames?: string[];
  };
}

export class ProcessFunctionDto {
  @IsString()
  @IsNotEmpty()
  userInput: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsString()
  @IsOptional()
  chatTitle?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SpreadsheetData)
  spreadsheetData?: SpreadsheetData;
}
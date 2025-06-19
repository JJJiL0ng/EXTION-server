import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSheetTableDataDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  index: number;

  @IsArray()
  data: any[][];
}

export class CreateSpreadsheetDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsOptional()
  originalFileName?: string;

  @IsInt()
  @IsOptional()
  fileSize?: number;

  @IsString()
  @IsOptional()
  fileType?: string;

  @IsInt()
  @IsOptional()
  activeSheetIndex?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSheetTableDataDto)
  sheets: CreateSheetTableDataDto[];
}

// 자동저장을 위한 경량화된 DTO
export class AutoSaveSpreadsheetDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  spreadsheetId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSheetTableDataDto)
  sheets: CreateSheetTableDataDto[];

  @IsInt()
  @IsOptional()
  activeSheetIndex?: number;

  @IsBoolean()
  @IsOptional()
  isIncremental?: boolean = true; // 증분 저장 여부
}

// 자동저장 상태 확인용 DTO
export class AutoSaveStatusDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  spreadsheetId: string;
} 
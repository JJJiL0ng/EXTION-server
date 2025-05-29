// src/common/dto/spreadsheet.dto.ts - 스프레드시트 저장 관련 DTO
import { IsString, IsNumber, IsArray, IsOptional, IsBoolean, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum DataStorageType {
  FIRESTORE = 'firestore',
  CLOUD_STORAGE = 'cloud_storage',
  ENCRYPTED = 'encrypted'
}

export class SheetDataDto {
  @IsArray()
  @IsString({ each: true })
  headers: string[];

  @IsArray()
  rows: string[][];

  @IsArray()
  @IsOptional()
  rawData?: string[][];
}

export class DataReferenceDto {
  @IsString()
  storagePath: string;

  @IsEnum(['json', 'csv', 'compressed'])
  format: 'json' | 'csv' | 'compressed';

  @IsNumber()
  size: number;

  @IsString()
  checksum: string;
}

export class FormulaDto {
  @IsString()
  cellAddress: string;

  @IsString()
  formula: string;

  @IsString()
  @IsOptional()
  result?: string;

  @IsArray()
  @IsString({ each: true })
  dependencies: string[];

  @Type(() => Date)
  appliedAt: Date;
}

export class CreateSpreadsheetDto {
  @IsString()
  chatId: string;

  @IsString()
  fileName: string;

  @IsString()
  originalFileName: string;

  @IsNumber()
  fileSize: number;

  @IsEnum(['xlsx', 'csv'])
  fileType: 'xlsx' | 'csv';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SheetMetadataDto)
  sheets: SheetMetadataDto[];

  @IsNumber()
  activeSheetIndex: number;

  @IsEnum(DataStorageType)
  dataStorageType: DataStorageType;

  @IsString()
  @IsOptional()
  dataPath?: string;
}

export class SheetMetadataDto {
  @IsString()
  sheetName: string;

  @IsNumber()
  sheetIndex: number;

  @IsArray()
  @IsString({ each: true })
  headers: string[];

  @ValidateNested()
  @Type(() => SheetDataDto)
  @IsOptional()
  data?: SheetDataDto;

  @ValidateNested()
  @Type(() => DataReferenceDto)
  @IsOptional()
  dataReference?: DataReferenceDto;

  @IsArray()
  @IsOptional()
  computedData?: string[][];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaDto)
  @IsOptional()
  formulas?: FormulaDto[];
}

export class UpdateSheetDataDto {
  @IsString()
  spreadsheetId: string;

  @IsNumber()
  sheetIndex: number;

  @ValidateNested()
  @Type(() => SheetDataDto)
  @IsOptional()
  data?: SheetDataDto;

  @IsArray()
  @IsOptional()
  computedData?: string[][];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaDto)
  @IsOptional()
  formulas?: FormulaDto[];
}
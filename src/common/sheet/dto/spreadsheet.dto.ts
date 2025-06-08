// src/common/dto/spreadsheet.dto.ts - 스프레드시트 저장 관련 DTO
import { IsString, IsNumber, IsArray, IsOptional, IsBoolean, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum DataStorageType {
  FIRESTORE = 'firestore',
  CLOUD_STORAGE = 'cloud_storage',
  ENCRYPTED = 'encrypted'
}

// 캐싱 전략을 위한 enum 추가
export enum CacheStrategy {
  NONE = 'none',
  MEMORY = 'memory',
  REDIS = 'redis'
}

// 청크 옵션 DTO
export class ChunkOptionsDto {
  @IsOptional()
  @IsNumber()
  chunkSize?: number = 100;

  @IsOptional()
  @IsEnum(CacheStrategy)
  cacheStrategy?: CacheStrategy = CacheStrategy.MEMORY;

  @IsOptional()
  @IsBoolean()
  enableCompression?: boolean = false;
}

export class SheetDataDto {

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
  @IsOptional()
  @IsString()
  spreadsheetId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsString()
  fileName: string;

  @IsString()
  originalFileName: string;

  @IsNumber()
  fileSize: number;

  @IsString()
  fileType: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SheetDto)
  sheets: SheetDto[];

  @IsOptional()
  @IsNumber()
  activeSheetIndex?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChunkOptionsDto)
  chunkOptions?: ChunkOptionsDto;

  @IsOptional()
  @IsEnum(DataStorageType)
  dataStorageType?: DataStorageType;

  @IsString()
  @IsOptional()
  dataPath?: string;
}

export class SheetDto {
  @IsString()
  sheetName: string;

  @IsNumber()
  sheetIndex: number;

  @IsOptional()
  @IsArray()
  data?: string[][];

  @IsOptional()
  @IsArray()
  computedData?: any[];

  @IsOptional()
  @IsArray()
  formulas?: any[];
}

export class UpdateSheetDataDto {
  @IsString()
  spreadsheetId: string;

  @IsNumber()
  sheetIndex: number;

  @IsOptional()
  @IsArray()
  data?: string[][];

  @IsOptional()
  @IsArray()
  computedData?: any[];

  @IsOptional()
  @IsArray()
  formulas?: any[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ChunkOptionsDto)
  chunkOptions?: ChunkOptionsDto;
}

// 배치 업데이트를 위한 DTO
export class BatchUpdateSheetDto {
  @IsString()
  spreadsheetId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSheetDataDto)
  updates: UpdateSheetDataDto[];

  @IsOptional()
  @IsString()
  batchId?: string;
}

// 페이지네이션을 위한 DTO
export class GetSheetDataDto {
  @IsString()
  spreadsheetId: string;

  @IsNumber()
  sheetIndex: number;

  @IsOptional()
  @IsNumber()
  startRow?: number;

  @IsOptional()
  @IsNumber()
  endRow?: number;

  @IsOptional()
  @IsNumber()
  limit?: number = 100;

  @IsOptional()
  @IsNumber()
  offset?: number = 0;

  @IsOptional()
  @IsBoolean()
  useCache?: boolean = true;
}

// === 전체 스프레드시트 교체를 위한 DTO ===
export class ReplaceSpreadsheetDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SheetDto)
  sheets: SheetDto[];

  @IsOptional()
  @IsNumber()
  activeSheetIndex?: number = 0;

  @IsOptional()
  @IsString()
  description?: string = '전체 시트 데이터 교체';
}
import { IsString, IsArray, IsOptional, IsNotEmpty, MaxLength, ValidateNested, IsNumber, IsBoolean, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

// 헤더 정보 인터페이스
export class HeaderInfo {
  @IsString()
  column: string;

  @IsString()
  name: string;
}

// 데이터 범위 인터페이스
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

// 시트 데이터 아이템 메타데이터 클래스 정의
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
  sampleData?: any[];

  @IsOptional()
  @IsNumber()
  sheetIndex?: number;
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

// 다중 시트 데이터 구조
export class SheetsData {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SheetDataItem)
  sheets: SheetDataItem[];

  @IsString()
  activeSheet: string;
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

// 데이터 수정 요청 DTO
export class ProcessDataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  userInput: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExtendedSheetContext)
  extendedSheetContext?: ExtendedSheetContext;

  @IsOptional()
  @ValidateNested()
  @Type(() => SheetsData)
  currentData?: SheetsData;

  @IsString()
  @IsOptional()
  language?: string = 'ko';
}

// 데이터 수정 결과 DTO
export class EditedDataDto {
  @IsString()
  sheetName: string;

  @IsArray()
  @IsString({ each: true })
  headers: string[];

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

// 데이터 수정 응답 DTO
export class DataFixResponseDto {
  @IsBoolean()
  success: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => EditedDataDto)
  editedData?: EditedDataDto;

  @IsOptional()
  @IsNumber()
  sheetIndex?: number;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChangesDto)
  changes?: ChangesDto;

  @IsOptional()
  @IsString()
  error?: string;
}

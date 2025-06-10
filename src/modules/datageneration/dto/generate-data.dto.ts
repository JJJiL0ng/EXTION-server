// src/modules/datageneration/dto/generate-data.dto.ts
import { IsString, IsArray, IsOptional, IsNotEmpty, MaxLength, ValidateNested, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

// === 프론트엔드 호환 구조 추가 ===

// 프론트엔드 SimpleSheetData 구조와 호환
export class SimpleSheetData {
  @IsString()
  name: string;

  @IsArray()
  @IsString({ each: true })
  headers: string[];

  @IsArray()
  data: string[][];

  @IsOptional()
  @IsNumber()
  sheetIndex?: number;
}

// 프론트엔드 SpreadsheetData 구조와 호환
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
  
  @IsOptional()
  @IsString()
  spreadsheetId?: string;
}

// === 기존 구조 유지 (하위 호환성) ===

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

// ✅ 시트 데이터 아이템 메타데이터 수정
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
  @IsArray()
  originalMetadata?: any[];
}

// 시트 데이터 아이템 수정 - ✅ csv 필드를 선택사항으로 변경
export class SheetDataItem {
  @IsString()
  name: string;

  // ✅ csv 필드를 선택사항으로 변경 (fullData가 있으면 csv는 불필요)
  @IsOptional()
  @IsString()
  csv?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SheetDataItemMetadata)
  metadata?: SheetDataItemMetadata;
}

// ✅ 다중 시트 데이터 구조 수정
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

// ✅ 데이터 생성 요청 DTO 수정 - 프론트엔드 호환성 추가
export class GenerateDataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  userInput: string;

  // ✅ 채팅 관련 필드 추가
  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsString()
  @IsOptional()
  chatTitle?: string;

  // === 프론트엔드 호환 필드 (새로 추가) ===
  @IsOptional()
  @ValidateNested()
  @Type(() => SpreadsheetData)
  spreadsheetData?: SpreadsheetData;

  // === 기존 필드들 (하위 호환성 유지) ===
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtendedSheetContext)
  extendedSheetContext?: ExtendedSheetContext;

  // ✅ 새로 추가: sheetsData 필드 (프론트엔드와 일치)
  @IsOptional()
  @ValidateNested()
  @Type(() => SheetsData)
  sheetsData?: SheetsData;

  // ✅ 기존 호환성 유지
  @IsOptional()
  @ValidateNested()
  @Type(() => SheetsData)
  currentData?: SheetsData;

  @IsString()
  @IsOptional()
  language?: string = 'ko';
}

// 데이터 생성 결과 DTO
export class EditedDataDto {
  @IsString()
  sheetName: string;

  @IsArray()
  @IsString({ each: true })
  headers: string[];

  @IsArray()
  data: string[][];
}

// 변경 로그 항목 DTO
export class ChangeLogItem {
  @IsString()
  type: 'add' | 'update' | 'delete' | 'create';

  @IsOptional()
  @IsNumber()
  row?: number;

  @IsOptional()
  @IsNumber()
  column?: number;

  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// 데이터 생성 응답 DTO
export class DataGenerationResponseDto {
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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChangeLogItem)
  changeLog?: ChangeLogItem[];

  @IsOptional()
  @IsString()
  error?: string;

  // ✅ 채팅 관련 응답 필드 추가
  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsString()
  userMessageId?: string;

  @IsOptional()
  @IsString()
  aiMessageId?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  // ✅ 저장된 스프레드시트 ID 추가
  @IsOptional()
  @IsString()
  spreadsheetId?: string;
}
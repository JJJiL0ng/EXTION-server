// src/modules/formula/dto/process-formula.dto.ts
import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  IsObject,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class HeaderInfo {
  @IsString()
  @IsNotEmpty()
  column: string; // ex) "A", "B", "C"

  @IsString()
  @IsNotEmpty()
  name: string; // ex) "이름", "키", "몸무게"
}

export class DataRange {
  @IsString()
  @IsNotEmpty()
  startRow: string; // ex) "2"

  @IsString()
  @IsNotEmpty()
  endRow: string; // ex) "50"

  @IsOptional()
  @IsString()
  startColumn?: string; // ex) "A"

  @IsOptional()
  @IsString()
  endColumn?: string; // ex) "D"
}

// 단순화된 시트 데이터 구조 (artifact와 동일)
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

// 스프레드시트 데이터 구조 (artifact와 동일)
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

export class SheetContext {
  @IsString()
  @IsNotEmpty()
  sheetName: string; // 시트 이름

  @IsArray()
  @Type(() => HeaderInfo)
  headers: HeaderInfo[]; // 헤더 정보

  @Type(() => DataRange)
  @IsObject()
  dataRange: DataRange; // 데이터 범위

  @IsOptional()
  @IsObject()
  sampleData?: Record<string, any>[]; // 선택적: 샘플 데이터 (처음 몇 행)
}

export class ProcessFormulaDto {
  @IsString()
  @IsNotEmpty()
  userInput: string; // 사용자의 자연어 입력

  @IsString()
  @IsNotEmpty()
  userId: string; // 사용자 ID

  @IsString()
  @IsOptional()
  chatId?: string; // 채팅 ID (선택적, 없으면 새 채팅 생성)

  @IsString()
  @IsOptional()
  chatTitle?: string; // 채팅 제목 (새 채팅일 때)

  @IsOptional()
  @ValidateNested()
  @Type(() => SpreadsheetData)
  spreadsheetData?: SpreadsheetData; // 새로운 스프레드시트 데이터 구조

  @Type(() => SheetContext)
  @IsObject()
  sheetContext: SheetContext; // 시트 컨텍스트 정보 (하위 호환성)

  @IsOptional()
  @IsString()
  language?: string = 'ko'; // 응답 언어 (기본값: "ko")

  @IsOptional()
  @IsString()
  messageId?: string; // 메시지 ID

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredFunctions?: string[]; // 선호하는 함수 타입 (예: ["AVERAGE", "SUM"])

  @IsString()
  @IsOptional()
  spreadsheetId?: string; // 스프레드시트와의 양방향 참조를 위한 필드 추가
}

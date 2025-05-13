import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  IsObject,
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

  @Type(() => SheetContext)
  @IsObject()
  sheetContext: SheetContext; // 시트 컨텍스트 정보

  @IsOptional()
  @IsString()
  language?: string; // 응답 언어 (기본값: "ko")

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredFunctions?: string[]; // 선호하는 함수 타입 (예: ["AVERAGE", "SUM"])
}

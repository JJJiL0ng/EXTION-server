// src/modules/formula/dto/formula-response.dto.ts
import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsNumber,
} from 'class-validator';

export class FormulaExplanation {
  @IsString()
  @IsNotEmpty()
  korean: string; // 한국어 설명

  @IsOptional()
  @IsString()
  english?: string; // 영어 설명
}

export class FormulaExample {
  @IsString()
  @IsNotEmpty()
  range: string; // 예시 범위 (예: "B2:B10")

  @IsString()
  @IsNotEmpty()
  formula: string; // 예시 함수 (예: "=AVERAGE(B2:B10)")

  @IsString()
  @IsNotEmpty()
  description: string; // 예시 설명
}

export class AlternativeFormula {
  @IsString()
  @IsNotEmpty()
  formula: string; // 대안 함수

  @IsString()
  @IsNotEmpty()
  reason: string; // 대안을 제시하는 이유

  @IsOptional()
  @IsNumber()
  complexity?: number; // 복잡도 (1-5)
}

export class FormulaResponseDto {
  @IsBoolean()
  success: boolean; // 성공 여부

  @IsOptional()
  @IsString()
  formula?: string; // 생성된 함수

  @IsOptional()
  @IsString()
  cellAddress?: string; // 함수를 넣을 셀 주소 (예: "E1")

  @IsOptional()
  @IsString()
  functionType?: string; // 함수 타입 (예: "AVERAGE", "SUM")

  @IsOptional()
  explanation?: FormulaExplanation; // 함수 설명

  @IsOptional()
  @IsArray()
  examples?: FormulaExample[]; // 사용 예시

  @IsOptional()
  @IsArray()
  alternatives?: AlternativeFormula[]; // 대안 함수들

  @IsOptional()
  @IsString()
  warning?: string; // 주의사항

  @IsOptional()
  @IsString()
  error?: string; // 에러 메시지

  @IsOptional()
  @IsString()
  requestId?: string; // 요청 추적을 위한 ID

  // 채팅 관련 필드 추가
  @IsOptional()
  @IsString()
  chatId?: string; // 채팅 ID

  @IsOptional()
  @IsString()
  userMessageId?: string; // 사용자 메시지 ID

  @IsOptional()
  @IsString()
  aiMessageId?: string; // AI 메시지 ID

  @IsOptional()
  @IsString()
  timestamp?: string; // 타임스탬프

  @IsOptional()
  spreadsheetMetadata?: {
    hasSpreadsheet?: boolean;
    fileName?: string;
    totalSheets?: number;
    activeSheetIndex?: number;
    sheetNames?: string[];
    lastModifiedAt?: Date;
  };
}

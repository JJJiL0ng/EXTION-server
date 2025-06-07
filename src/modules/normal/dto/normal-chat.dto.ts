// src/modules/normalchat/dto/normal-chat.dto.ts
import { IsString, IsOptional, IsNotEmpty, MaxLength, ValidateNested, IsBoolean, IsUUID, IsArray, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

// 단순화된 시트 데이터 구조
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

// 일반 채팅 요청 DTO
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
  @Type(() => SpreadsheetData)
  spreadsheetData?: SpreadsheetData;

  @IsString()
  @IsOptional()
  language?: string = 'ko';

  @IsString()
  @IsOptional()
  messageId?: string;

  @IsString()
  @IsOptional()
  spreadsheetId?: string;
}

// 일반 채팅 응답 DTO
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
  spreadsheetMetadata?: {
    fileName?: string;
    totalSheets?: number;
    activeSheetIndex?: number;
    sheetNames?: string[];
  };

  @IsString()
  @IsOptional()
  error?: string;

  @IsString()
  @IsOptional()
  timestamp?: string;
}
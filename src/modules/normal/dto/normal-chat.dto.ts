// src/modules/normalchat/dto/normal-chat.dto.ts - 수정된 일반 채팅 DTO
import { IsString, IsOptional, IsNotEmpty, MaxLength, ValidateNested, IsBoolean, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ExtendedSheetContext, SheetsData } from '../../datageneration/dto/generate-data.dto';
import { SpreadsheetMetadataDto } from '../../../common/dto/chat.dto';

// 일반 채팅 요청 DTO - Firebase 연동 추가
export class NormalChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  userInput: string;

  // === Firebase 연동 필드 추가 ===
  @IsString()
  @IsUUID()
  userId: string; // Firebase Auth UID

  @IsString()
  @IsUUID()
  @IsOptional()
  chatId?: string; // 기존 채팅 ID (새 채팅이면 없음)

  @IsString()
  @IsOptional()
  chatTitle?: string; // 새 채팅 제목

  // === 기존 스프레드시트 관련 필드 ===
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtendedSheetContext)
  extendedSheetContext?: ExtendedSheetContext;

  @IsOptional()
  @ValidateNested()
  @Type(() => SheetsData)
  sheetsData?: SheetsData;

  @IsOptional()
  @ValidateNested()
  @Type(() => SheetsData)
  currentData?: SheetsData;

  @IsString()
  @IsOptional()
  language?: string = 'ko';

  // === 메시지 메타데이터 ===
  @IsString()
  @IsOptional()
  messageId?: string; // 프론트에서 생성한 임시 ID
}

// 일반 채팅 응답 DTO - Firebase 정보 추가
export class NormalChatResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  message: string;

  // === Firebase 관련 응답 필드 ===
  @IsString()
  @IsOptional()
  chatId?: string; // 채팅 ID (새로 생성되거나 기존)

  @IsString()
  @IsOptional()
  messageId?: string; // 저장된 메시지 ID

  @IsString()
  @IsOptional()
  userMessageId?: string; // 사용자 메시지 ID

  @IsString()
  @IsOptional()
  aiMessageId?: string; // AI 응답 메시지 ID

  @IsOptional()
  @ValidateNested()
  @Type(() => SpreadsheetMetadataDto)
  spreadsheetMetadata?: SpreadsheetMetadataDto;

  @IsString()
  @IsOptional()
  error?: string;

  // === 추가 메타데이터 ===
  @IsString()
  @IsOptional()
  timestamp?: string;
}

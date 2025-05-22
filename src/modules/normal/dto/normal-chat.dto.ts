// src/modules/normalchat/dto/normal-chat.dto.ts
import { IsString, IsOptional, IsNotEmpty, MaxLength, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ExtendedSheetContext, SheetsData } from '../../datageneration/dto/generate-data.dto';

// 일반 채팅 요청 DTO
export class NormalChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  userInput: string;

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

// 일반 채팅 응답 DTO
export class NormalChatResponseDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  error?: string;
}
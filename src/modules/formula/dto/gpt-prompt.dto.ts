import { IsNotEmpty, IsString, IsArray, IsOptional, IsNumber } from 'class-validator';

export class FormulaContext {
  @IsString()
  @IsNotEmpty()
  userQuery: string; // 사용자 요청

  @IsString()
  @IsNotEmpty()
  sheetInfo: string; // 시트 정보 (헤더, 범위 등)

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableFunctions?: string[]; // 사용 가능한 함수 목록

  @IsOptional()
  @IsString()
  language?: string; // 응답 언어
}

export class GptPromptDto {
  @IsString()
  @IsNotEmpty()
  systemMessage: string; // 시스템 메시지 (GPT 역할 정의)

  @IsString()
  @IsNotEmpty()
  userMessage: string; // 사용자 메시지 (실제 요청)

  @IsOptional()
  @IsNumber()
  maxTokens?: number; // 최대 토큰 수

  @IsOptional()
  @IsNumber()
  temperature?: number; // 창의성 정도 (0-1)

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stopSequences?: string[]; // 중지 문자열
}

import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';

export class OrchestratorChatRequestDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  sheetId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @IsIn(['KR', 'US', 'JP', 'CN', 'DE', 'FR', 'GB', 'ES', 'IT', 'BR', 'IN', 'RU'])
  countryCode: string; // ISO 3166-1 alpha-2 국가 코드

  @IsOptional()
  @IsString()
  @IsIn(['ko', 'en', 'ja', 'zh', 'de', 'fr', 'es', 'it', 'pt', 'hi', 'ru'])
  language?: string; // ISO 639-1 언어 코드 (선택적)

  @IsOptional()
  @IsString()
  timezone?: string; // IANA 시간대 (예: 'Asia/Seoul', 'America/New_York')

  @IsDateString()
  timestamp: string;
}
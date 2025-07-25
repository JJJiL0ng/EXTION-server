import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';

export class MainChatRequestDto {
  @IsString()
  chatInputMessage: string;

  @IsString()
  spreadsheetId: string;

  @IsString()
  chatId: string;

  @IsString()
  userId: string;

  @IsDateString()
  timestamp: string;
}
export class GetChatHistoryDto {
  @IsString()
  chatId: string;

  @IsString()
  userId: string;
}

export class GetUserChatList {
  @IsString()
  userId: string;
}
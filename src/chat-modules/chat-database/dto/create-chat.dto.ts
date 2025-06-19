import { IsString, IsOptional } from 'class-validator';
import { ChatListItem } from '../chat-database.service';

export class CreateChatDto {
  @IsString()
  title: string;

  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  spreadsheetId?: string;
}

export class CreateChatResponseDto {
  success: boolean;
  chatId: string;
  chat?: ChatListItem;
} 
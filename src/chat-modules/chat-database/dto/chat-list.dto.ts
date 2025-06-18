import { IsString } from 'class-validator';
import { ChatListItem } from '../chat-database.service';

export class ChatListRequestDto {
  @IsString()
  userId: string;
}

export class ChatListResponseDto {
  success: boolean;
  chats: ChatListItem[];
  count: number;
} 
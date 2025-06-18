import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ChatMessage } from '../chat-database.service';

export class LoadChatRequestDto {
  @IsString()
  chatId: string;

  @IsString()
  userId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export interface ChatInfo {
  title: string;
  createdAt: Date;
  updatedAt: Date;
  totalMessageCount: number;
  sheetMetaDataId?: string;
}

export class LoadChatResponseDto {
  success: boolean;
  chatId: string;
  messages: ChatMessage[];
  messageCount: number;
  chatInfo?: ChatInfo;
} 
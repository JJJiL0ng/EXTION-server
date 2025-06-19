import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateChatTitleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: '채팅 제목은 100자 이내여야 합니다.' })
  title: string;

  @IsString()
  @IsNotEmpty()
  userId: string;
}

export class UpdateChatTitleResponseDto {
  success: boolean;
  message?: string;
  data?: {
    chatId: string;
    title: string;
    updatedAt: Date;
  };
} 
import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MainChatRequestDto {
  @ApiProperty({ description: '사용자 입력 메시지' })
  @IsString()
  chatInputMessage: string;

  @ApiProperty({ description: '연결된 스프레드시트 ID', required: false })
  @IsOptional()
  @IsString()
  spreadsheetId?: string;

  @ApiProperty({ description: '예시하는 채팅방 ID (새 채팅이면 비워둔)', required: false })
  @IsOptional()
  @IsString()
  chatId?: string;

  @ApiProperty({ description: '사용자 ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: '요청 시각' })
  @IsDateString()
  timestamp: string;
}
export class GetChatHistoryDto {
  @ApiProperty({ description: '채팅방 ID' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: '사용자 ID' })
  @IsString()
  userId: string;
}

export class GetUserChatList {
  @ApiProperty({ description: '사용자 ID' })
  @IsString()
  userId: string;
}
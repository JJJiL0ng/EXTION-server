import { IsString, IsNotEmpty } from 'class-validator';

export class MarkdownProcessDto {
  @IsString()
  @IsNotEmpty()
  response: string;
}

export class ProcessedResponseDto {
  plainText: string;
  originalText: string;
} 
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateAiutilDto {
  @IsString()
  @IsNotEmpty()
  content: string;
} 
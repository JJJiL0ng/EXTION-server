import { IsOptional, IsString } from 'class-validator';

export class CreateSpreadSheetDto {
  @IsString()
  fileName: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsString()
  userId: string;

  @IsOptional()
  initialData?: Record<string, any>;
}

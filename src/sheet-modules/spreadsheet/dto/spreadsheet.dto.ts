import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSheetTableDataDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  index: number;

  @IsArray()
  data: any[][];
}

export class CreateSpreadsheetDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsOptional()
  originalFileName?: string;

  @IsInt()
  @IsOptional()
  fileSize?: number;

  @IsString()
  @IsOptional()
  fileType?: string;

  @IsInt()
  @IsOptional()
  activeSheetIndex?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSheetTableDataDto)
  sheets: CreateSheetTableDataDto[];
} 
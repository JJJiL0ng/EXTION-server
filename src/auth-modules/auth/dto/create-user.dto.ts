import { IsEmail, IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class CreateUserDto {
  @IsString()
  userId: string; // Firebase UID

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  photoURL?: string;

  @IsOptional()
  @IsBoolean()
  isGuest?: boolean = false;

  @IsOptional()
  @IsObject()
  preferences?: any;

  @IsOptional()
  @IsObject()
  statistics?: any;
} 
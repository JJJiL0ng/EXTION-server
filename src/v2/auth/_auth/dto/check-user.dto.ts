import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CheckUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  id?: string;
}

export interface CheckUserResponse {
  exists: boolean;
  user?: {
    id: string;
    email: string | null;
    displayName: string;
    photoURL: string | null;
    isGuest: boolean;
    createdAt: Date;
    lastActiveAt: Date;
  };
} 
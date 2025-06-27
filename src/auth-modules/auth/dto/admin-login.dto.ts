import { IsString, IsNotEmpty } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export interface AdminLoginResponse {
  success: boolean;
  adminUserId?: string;
  displayName?: string;
  message: string;
  token?: string; // 임시 토큰 (선택적)
}

import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class createInviteCodeReqDto {
    @IsString()
    node: string;

    @IsString()
    @IsOptional()
    code?: string;
}

export class createInviteCodeResDto {
    @IsBoolean()
    success: boolean;
    
    @IsString()
    link: string;
}
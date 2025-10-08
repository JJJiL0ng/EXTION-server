import { IsBoolean, IsString } from 'class-validator';

export class verifyReqDto {
    @IsString()
    inviteCode: string;
}

export class verifyResDto {
    @IsBoolean()
    success: boolean;
    @IsString()
    userId: string;
    @IsBoolean()
    isFirstTime: boolean;
}


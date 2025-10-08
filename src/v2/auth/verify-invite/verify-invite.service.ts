import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/v2/prisma/prisma.service';
import { verifyReqDto, verifyResDto } from './dto/verifyInvite.dto';

@Injectable()
export class VerifyInviteService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyInviteCode(dto: verifyReqDto): Promise<verifyResDto> {
    // 1. 초대 코드 존재 여부 확인
    const inviteCode = await this.prisma.inviteCode.findUnique({
      where: { code: dto.inviteCode },
      include: { user: true },
    });

    if (!inviteCode) {
      throw new NotFoundException('유효하지 않은 초대 코드입니다.');
    }

    // 2. 이미 사용된 코드인지 체크
    if (inviteCode.isUsed && inviteCode.user) {
      // 이미 사용된 코드 - 기존 유저 반환
      return {
        success: true,
        userId: inviteCode.user.id,
        isFirstTime: false,
      };
    }

    if (inviteCode.isUsed && !inviteCode.user) {
      throw new BadRequestException('이미 사용되었지만 유저가 연결되지 않은 초대 코드입니다.');
    }

    // 3. User 생성 (처음 사용하는 코드)
    const newUser = await this.prisma.user.create({
      data: {
        id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        displayName: `Guest User`,
        isGuest: true,
        inviteCodeId: inviteCode.id,
      },
    });

    // 4. InviteCode의 isUsed 업데이트
    await this.prisma.inviteCode.update({
      where: { id: inviteCode.id },
      data: {
        isUsed: true,
        usedAt: new Date(),
      },
    });

    // 5. userId 반환
    return {
      success: true,
      userId: newUser.id,
      isFirstTime: true,
    };
  }
}

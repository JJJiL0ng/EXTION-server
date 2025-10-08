import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/v2/prisma/prisma.service';
import { createInviteCodeReqDto } from './dto/invite-code.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class InviteCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async createInviteCode(dto: createInviteCodeReqDto) {
    // 커스텀 코드가 제공되면 사용, 없으면 자동 생성
    const code = dto.code || this.generateCode();

    // 중복 체크
    const existing = await this.prisma.inviteCode.findUnique({
      where: { code },
    });

    if (existing) {
      throw new Error(`초대 코드가 이미 존재합니다: ${code}`);
    }

    // 초대 코드 생성
    const inviteCode = await this.prisma.inviteCode.create({
      data: {
        code,
        note: dto.node,
        createdBy: null, // TODO: 어드민 인증 구현 후 실제 어드민 ID로 변경
      },
    });

    return {
      success: true,
      link: `https://extion.ai/invite/${inviteCode.code}`,
    };
  }

  private generateCode(): string {
    // 8바이트 랜덤 값을 16진수로 변환 (16자 길이)
    const uuid = randomBytes(8).toString('hex');
    return `EXTION-early-user-${uuid}`;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/v2/prisma/prisma.service';
import { createInviteCodeReqDto } from './dto/invite-code.dto';

@Injectable()
export class InviteCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async createInviteCode(dto: createInviteCodeReqDto) {
    // 커스텀 코드가 제공되면 사용, 없으면 자동 생성
    const code = dto.code || (await this.generateCode());

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

  private async generateCode(): Promise<string> {
    // 가장 최근 생성된 초대 코드의 번호를 조회
    const lastCode = await this.prisma.inviteCode.findFirst({
      where: {
        code: {
          startsWith: 'EXTION-early-user-',
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let nextNumber = 1;

    if (lastCode) {
      // "EXTION-early-user-XXX"에서 번호 추출
      const match = lastCode.code.match(/EXTION-early-user-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    // 3자리 숫자로 포맷 (001, 002, ...)
    const paddedNumber = nextNumber.toString().padStart(3, '0');
    return `EXTION-early-user-${paddedNumber}`;
  }
}

import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, CheckUserDto, CheckUserResponse } from './dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(createUserDto: CreateUserDto) {
    // Firebase UID 중복 체크
    const existingUserById = await this.prisma.user.findUnique({
      where: { id: createUserDto.userId },
    });

    if (existingUserById) {
      throw new ConflictException('이미 존재하는 사용자 ID입니다.');
    }

    // 이메일이 있는 경우 중복 체크
    if (createUserDto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: createUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('이미 존재하는 이메일입니다.');
      }
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          id: createUserDto.userId, // Firebase UID를 사용자 ID로 사용
          email: createUserDto.email,
          displayName: createUserDto.displayName,
          photoURL: createUserDto.photoURL,
          isGuest: createUserDto.isGuest || false,
          preferences: createUserDto.preferences || null,
          statistics: createUserDto.statistics || null,
        },
      });

      return user;
    } catch (error) {
      throw new Error('사용자 생성 중 오류가 발생했습니다.');
    }
  }

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async checkUser(checkUserDto: CheckUserDto): Promise<CheckUserResponse> {
    if (!checkUserDto.email && !checkUserDto.id) {
      throw new BadRequestException('이메일 또는 ID 중 하나는 필수입니다.');
    }

    let user: any = null;

    if (checkUserDto.email) {
      user = await this.findUserByEmail(checkUserDto.email);
    } else if (checkUserDto.id) {
      user = await this.findUserById(checkUserDto.id);
    }

    if (user) {
      return {
        exists: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          isGuest: user.isGuest,
          createdAt: user.createdAt,
          lastActiveAt: user.lastActiveAt,
        },
      };
    }

    return { exists: false };
  }
}

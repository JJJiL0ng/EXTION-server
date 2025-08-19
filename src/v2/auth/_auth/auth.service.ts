import { Injectable, ConflictException, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, CheckUserDto, CheckUserResponse, AdminLoginDto, AdminLoginResponse } from './dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  // 어드민 사용자 ID 목록 (환경변수나 DB에서 관리하는 것이 좋습니다)
  private readonly adminUserIds = process.env.ADMIN_USER_IDS?.split(',') || ['admin-user-id'];
  
  // 어드민 계정 정보 (환경변수에서 가져오기)
  private readonly adminAccounts = {
    kelly0727: {
      password: '0727',
      userId: 'admin-kelly-user-id', // 실제 Firebase UID나 고유 ID
      displayName: 'Kelly Admin'
    },
    jilong0604: {
      password: '0604', 
      userId: 'admin-jilong-user-id', // 실제 Firebase UID나 고유 ID
      displayName: 'Jilong Admin'
    }
  };

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

  async adminLogin(adminLoginDto: AdminLoginDto): Promise<AdminLoginResponse> {
    const { username, password } = adminLoginDto;

    // 어드민 계정 확인
    const adminAccount = this.adminAccounts[username];
    
    if (!adminAccount || adminAccount.password !== password) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    // 어드민 사용자 ID 목록에 포함되어 있는지 확인
    if (!this.adminUserIds.includes(adminAccount.userId)) {
      throw new ForbiddenException('어드민 권한이 없습니다.');
    }

    return {
      success: true,
      adminUserId: adminAccount.userId,
      displayName: adminAccount.displayName,
      message: '어드민 로그인이 성공했습니다.',
    };
  }

  async checkAdminPermission(userId: string) {
    if (!userId) {
      throw new BadRequestException('사용자 ID가 필요합니다.');
    }

    const isAdmin = this.adminUserIds.includes(userId);
    
    return {
      success: true,
      isAdmin,
      message: isAdmin ? '어드민 권한이 확인되었습니다.' : '어드민 권한이 없습니다.'
    };
  }

  async getAllUsers(adminUserId: string) {
    // 어드민 권한 확인
    const adminCheck = await this.checkAdminPermission(adminUserId);
    if (!adminCheck.isAdmin) {
      throw new ForbiddenException('어드민 권한이 필요합니다.');
    }

    try {
      const users = await this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          displayName: true,
          photoURL: true,
          isGuest: true,
          createdAt: true,
          lastActiveAt: true,
          _count: {
            select: {
              chats: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return {
        success: true,
        users: users.map(user => ({
          ...user,
          chatCount: user._count.chats
        })),
        count: users.length
      };
    } catch (error) {
      throw new BadRequestException('사용자 목록을 불러오는 중 오류가 발생했습니다.');
    }
  }
}

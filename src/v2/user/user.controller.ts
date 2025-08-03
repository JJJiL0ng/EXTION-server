import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { UserService } from './user.service';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  isGuest?: boolean;
}

@Controller('v2/user')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UserService) {}

  /**
   * 사용자 생성
   */
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() dto: CreateUserDto) {
    this.logger.log(`Creating user: ${dto.userId}, isGuest: ${dto.isGuest}`);
    
    const user = await this.userService.createUser(
      dto.userId, 
      dto.displayName, 
      dto.isGuest || false
    );

    return {
      success: true,
      data: user,
      message: 'User created successfully'
    };
  }
}

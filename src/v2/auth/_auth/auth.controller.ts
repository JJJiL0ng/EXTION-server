import { Controller, Post, Body, HttpStatus, HttpCode, Get, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto, CheckUserDto, CheckUserResponse, AdminLoginDto, AdminLoginResponse } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('data')
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.authService.createUser(createUserDto);
  }

  @Get('check')
  @HttpCode(HttpStatus.OK)
  async checkUser(@Query() checkUserDto: CheckUserDto): Promise<CheckUserResponse> {
    return this.authService.checkUser(checkUserDto);
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() adminLoginDto: AdminLoginDto): Promise<AdminLoginResponse> {
    return this.authService.adminLogin(adminLoginDto);
  }

  @Get('check-admin')
  @HttpCode(HttpStatus.OK)
  async checkAdminPermission(@Query('userId') userId: string) {
    return this.authService.checkAdminPermission(userId);
  }

  @Get('users')
  @HttpCode(HttpStatus.OK)
  async getAllUsers(@Query('adminUserId') adminUserId: string) {
    return this.authService.getAllUsers(adminUserId);
  }
}

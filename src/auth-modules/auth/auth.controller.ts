import { Controller, Post, Body, HttpStatus, HttpCode, Get, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto, CheckUserDto, CheckUserResponse } from './dto';

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
}

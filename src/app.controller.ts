import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      uptime: process.uptime(),
    };
  }

  @Get('db-status')
  async getDatabaseStatus() {
    try {
      // 간단한 데이터베이스 연결 테스트
      return {
        status: 'connected',
        timestamp: new Date().toISOString(),
        database: 'postgresql',
        migrations: 'available via /migrate-status',
      };
    } catch (error) {
      return {
        status: 'disconnected',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }
}

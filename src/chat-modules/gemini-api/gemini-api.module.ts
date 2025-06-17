import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeminiApiService } from './gemini-api.service';

@Module({
  imports: [ConfigModule],
  providers: [GeminiApiService],
  exports: [GeminiApiService],
})
export class GeminiApiModule {} 
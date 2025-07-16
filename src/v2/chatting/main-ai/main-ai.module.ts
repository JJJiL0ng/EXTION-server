import { Module } from '@nestjs/common';
import { MainAiService } from './main-ai.service';
import { MainAiController } from './main-ai.controller';

@Module({
  controllers: [MainAiController],
  providers: [MainAiService],
})
export class MainAiModule {}

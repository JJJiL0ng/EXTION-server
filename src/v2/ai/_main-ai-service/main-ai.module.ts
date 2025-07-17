import { Module } from '@nestjs/common';
import { MainAiService } from './main-ai.service';

@Module({
  providers: [MainAiService],
})
export class MainAiModule {}

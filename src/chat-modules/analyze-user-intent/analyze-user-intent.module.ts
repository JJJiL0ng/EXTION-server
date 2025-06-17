import { Module } from '@nestjs/common';
import { AnalyzeUserIntentService } from './analyze-user-intent.service';
import { GeminiApiModule } from 'src/chat-modules/gemini-api/gemini-api.module';

@Module({
  imports: [GeminiApiModule],
  controllers: [],
  providers: [AnalyzeUserIntentService],
  exports: [AnalyzeUserIntentService],
})
export class AnalyzeUserIntentModule {}

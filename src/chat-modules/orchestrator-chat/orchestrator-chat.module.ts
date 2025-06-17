import { Module } from '@nestjs/common';
import { OrchestratorChatService } from './orchestrator-chat.service';
import { OrchestratorChatController } from './orchestrator-chat.controller';
import { AnalyzeUserIntentModule } from '../analyze-user-intent/analyze-user-intent.module';

@Module({
  imports: [AnalyzeUserIntentModule],
  controllers: [OrchestratorChatController],
  providers: [OrchestratorChatService],
})
export class OrchestratorChatModule {}

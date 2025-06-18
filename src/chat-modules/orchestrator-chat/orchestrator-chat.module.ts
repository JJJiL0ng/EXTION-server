import { Module } from '@nestjs/common';
import { OrchestratorChatService } from './orchestrator-chat.service';
import { OrchestratorChatController } from './orchestrator-chat.controller';
import { AnalyzeUserIntentModule } from '../analyze-user-intent/analyze-user-intent.module';
import { GeneralChatModule } from '../general-chat/general-chat.module';
import { VisualizationGenerateChatModule } from '../visualization-generate-chat/visualization-generate-chat.module';
import { DataEditChatModule } from '../data-edit-chat/data-edit-chat.module';
import { DataGenerateChatModule } from '../data-generate-chat/data-generate-chat.module';
import { FunctionChatModule } from '../function-chat/function-chat.module';

@Module({
  imports: [
    AnalyzeUserIntentModule,
    GeneralChatModule,
    VisualizationGenerateChatModule,
    DataEditChatModule,
    DataGenerateChatModule,
    FunctionChatModule,
  ],
  controllers: [OrchestratorChatController],
  providers: [OrchestratorChatService],
  exports: [OrchestratorChatService],
})
export class OrchestratorChatModule {}

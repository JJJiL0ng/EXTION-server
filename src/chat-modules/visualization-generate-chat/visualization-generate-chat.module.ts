import { Module } from '@nestjs/common';
import { VisualizationGenerateChatService } from '../../common/visualization-generate-chat.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PromptModule } from '../../prompts/prompt/prompt.module';
import { ChatDatabaseModule } from '../chat-database/chat-database.module';

@Module({
  imports: [
    PrismaModule,
    PromptModule,
    ChatDatabaseModule,
  ],
  providers: [VisualizationGenerateChatService],
  exports: [VisualizationGenerateChatService],
})
export class VisualizationGenerateChatModule {}

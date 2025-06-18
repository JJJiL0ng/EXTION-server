import { Module } from '@nestjs/common';
import { DataGenerateChatService } from './data-generate-chat.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PromptModule } from '../prompts/prompt/prompt.module';
import { ChatDatabaseModule } from '../chat-database/chat-database.module';

@Module({
  imports: [
    PrismaModule,
    PromptModule,
    ChatDatabaseModule,
  ],
  providers: [DataGenerateChatService],
  exports: [DataGenerateChatService],
})
export class DataGenerateChatModule {}

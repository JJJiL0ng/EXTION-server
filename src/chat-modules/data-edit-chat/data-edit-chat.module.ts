import { Module } from '@nestjs/common';
import { DataEditChatService } from './data-edit-chat.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PromptModule } from '../prompts/prompt/prompt.module';
import { ChatDatabaseModule } from '../chat-database/chat-database.module';

@Module({
  imports: [
    PrismaModule,
    PromptModule,
    ChatDatabaseModule,
  ],
  providers: [DataEditChatService],
  exports: [DataEditChatService],
})
export class DataEditChatModule {}

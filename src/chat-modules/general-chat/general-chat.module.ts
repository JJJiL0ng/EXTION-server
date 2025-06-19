import { Module } from '@nestjs/common';
import { GeneralChatService } from './general-chat.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PromptModule } from '../prompts/prompt/prompt.module';
import { ChatDatabaseModule } from '../chat-database/chat-database.module';
import { AiutilsModule } from '../aiutils/aiutils.module';

@Module({
  imports: [
    PrismaModule,
    PromptModule,
    ChatDatabaseModule,
    AiutilsModule,
  ],
  providers: [GeneralChatService],
  exports: [GeneralChatService],
})
export class GeneralChatModule {}

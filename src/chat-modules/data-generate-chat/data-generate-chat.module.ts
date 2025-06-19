import { Module } from '@nestjs/common';
import { DataGenerateChatService } from './data-generate-chat.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PromptModule } from '../prompts/prompt/prompt.module';
import { ChatDatabaseModule } from '../chat-database/chat-database.module';
import { SpreadsheetModule } from 'src/sheet-modules/spreadsheet/spreadsheet.module';

@Module({
  imports: [
    PrismaModule,
    PromptModule,
    ChatDatabaseModule,
    SpreadsheetModule,
  ],
  providers: [DataGenerateChatService],
  exports: [DataGenerateChatService],
})
export class DataGenerateChatModule {}

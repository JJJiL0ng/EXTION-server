import { Module } from '@nestjs/common';
import { MainChatService } from './main-chat.service';
import { MainChatController } from './main-chat.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MainAiModule } from '../../ai/_main-ai-service/main-ai.module';
import { TableDataJsonSaveModule } from '../../sheet/_table-data-json-save/table-data-json-save.module';

@Module({
  imports: [PrismaModule, MainAiModule, TableDataJsonSaveModule],
  controllers: [MainChatController],
  providers: [MainChatService],
})
export class MainChatModule {}

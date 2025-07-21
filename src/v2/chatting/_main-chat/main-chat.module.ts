import { Module } from '@nestjs/common';
import { MainChatService } from './main-chat.service';
import { MainChatController } from './main-chat.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MainAiModule } from '../../ai/_main-ai-service/main-ai.module';
import { TableDataCacheModule } from '../../cache/_table-data-cache/table-data-cache.module';

@Module({
  imports: [PrismaModule, MainAiModule, TableDataCacheModule],
  controllers: [MainChatController],
  providers: [MainChatService],
})
export class MainChatModule {}

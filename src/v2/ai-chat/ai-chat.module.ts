import { Module } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { AiChatController } from './ai-chat.controller';
import { AiChatGateway } from './ai-chat.gateway';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TableDataJsonSaveModule } from '../sheet/_table-data-json-save/table-data-json-save.module';

@Module({
  // TableDataJsonSaveModule 추가하여 TableDataJsonSaveService 주입 가능
  imports: [AiAgentModule, PrismaModule, TableDataJsonSaveModule],
  controllers: [AiChatController],
  providers: [AiChatService, AiChatGateway],
})
export class AiChatModule {}

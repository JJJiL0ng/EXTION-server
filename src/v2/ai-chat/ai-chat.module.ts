import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AiChatService } from './ai-chat.service';
// import { AiChatController } from './ai-chat.controller';
import { AiChatGateway } from './ai-chat.gateway';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TableDataJsonSaveModule } from '../sheet/_table-data-json-save/table-data-json-save.module';
import { AiChatBranchService } from './services/ai-chat-branch.service';
import { AiChatMessageService } from './services/ai-chat-message.service';
import { AiChatSpreadsheetContextService } from './services/ai-chat-spreadsheet-context.service';
import { AiChatUserService } from './services/ai-chat-user.service';

@Module({
  // TableDataJsonSaveModule 추가하여 TableDataJsonSaveService 주입 가능
  imports: [
    ScheduleModule.forRoot(),
    AiAgentModule,
    PrismaModule,
    forwardRef(() => TableDataJsonSaveModule)
  ],
  // controllers: [AiChatController],
  providers: [
    AiChatService,
    AiChatGateway,
    AiChatUserService,
    AiChatBranchService,
    AiChatSpreadsheetContextService,
    AiChatMessageService,
  ],
  exports: [AiChatService],
})
export class AiChatModule {}

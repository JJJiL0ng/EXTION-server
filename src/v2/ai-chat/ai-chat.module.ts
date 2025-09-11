import { Module } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { AiChatController } from './ai-chat.controller';
import { AiChatGateway } from './ai-chat.gateway';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AiAgentModule, PrismaModule],
  controllers: [AiChatController],
  providers: [AiChatService, AiChatGateway],
})
export class AiChatModule {}

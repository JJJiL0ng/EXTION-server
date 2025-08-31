import { Module } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { AiChatController } from './ai-chat.controller';
import { AiChatGateway } from './ai-chat.gateway';

@Module({
  controllers: [AiChatController],
  providers: [AiChatService, AiChatGateway],
})
export class AiChatModule {}

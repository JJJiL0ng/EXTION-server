import { Module } from '@nestjs/common';
import { FunctionChatService } from './function-chat.service';

@Module({
  controllers: [],
  providers: [FunctionChatService],
})
export class FunctionChatModule {}

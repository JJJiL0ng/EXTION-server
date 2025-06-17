import { Module } from '@nestjs/common';
import { GeneralChatService } from './general-chat.service';

@Module({
  controllers: [],
  providers: [GeneralChatService],
})
export class GeneralChatModule {}

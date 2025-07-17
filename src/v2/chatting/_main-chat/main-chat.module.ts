import { Module } from '@nestjs/common';
import { MainChatService } from './main-chat.service';
import { MainChatController } from './main-chat.controller';

@Module({
  controllers: [MainChatController],
  providers: [MainChatService],
})
export class MainChatModule {}

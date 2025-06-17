import { Module } from '@nestjs/common';
import { DataEditChatService } from './data-edit-chat.service';

@Module({
  controllers: [],
  providers: [DataEditChatService],
})
export class DataEditChatModule {}

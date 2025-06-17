import { Module } from '@nestjs/common';
import { DataGenerateChatService } from './data-generate-chat.service';

@Module({
  controllers: [],
  providers: [DataGenerateChatService],
})
export class DataGenerateChatModule {}

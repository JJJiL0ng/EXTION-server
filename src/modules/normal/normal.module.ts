import { Module } from '@nestjs/common';
import { NormalChatService } from './normal.service';
import { NormalChatController } from './normal.controller';

@Module({
  controllers: [NormalChatController],
  providers: [NormalChatService],
})
export class NormalModule  {}

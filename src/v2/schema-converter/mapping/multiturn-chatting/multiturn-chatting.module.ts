import { Module } from '@nestjs/common';
import { MultiturnChattingService } from './multiturn-chatting.service';
import { MultiturnChattingController } from './multiturn-chatting.controller';

@Module({
  controllers: [MultiturnChattingController],
  providers: [MultiturnChattingService],
})
export class MultiturnChattingModule {}

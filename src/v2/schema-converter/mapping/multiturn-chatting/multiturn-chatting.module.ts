import { Module } from '@nestjs/common';
import { MultiturnChattingService } from './multiturn-chatting.service';
import { MultiturnChattingController } from './multiturn-chatting.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AiAgentModule } from '../../../ai-agent/ai-agent.module';

@Module({
  imports: [PrismaModule, ConfigModule, AiAgentModule],
  controllers: [MultiturnChattingController],
  providers: [MultiturnChattingService],
  exports: [MultiturnChattingService],
})
export class MultiturnChattingModule {}

import { Module } from '@nestjs/common';
import { AiutilsService } from './aiutils.service';
import { AiutilsController } from './aiutils.controller';

@Module({
  controllers: [AiutilsController],
  providers: [AiutilsService],
  exports: [AiutilsService],
})
export class AiutilsModule {}

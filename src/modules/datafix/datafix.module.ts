import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataFixController } from './datafix.controller';
import { DataFixService } from './datafix.service';

@Module({
  imports: [ConfigModule],
  controllers: [DataFixController],
  providers: [DataFixService],
  exports: [DataFixService]
})
export class DataFixModule {}
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataGenerationController } from './datageneration.controller';
import { DataGenerationService } from './datageneration.service';

@Module({
  imports: [ConfigModule],
  controllers: [DataGenerationController],
  providers: [DataGenerationService],
  exports: [DataGenerationService],
})
export class DataGenerationModule {}
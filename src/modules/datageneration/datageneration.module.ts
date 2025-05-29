import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataGenerationController } from './datageneration.controller';
import { DataGenerationService } from './datageneration.service';
import { FirebaseModule } from '../../common/firebase/firebase.module';

@Module({
  imports: [ConfigModule, FirebaseModule],
  controllers: [DataGenerationController],
  providers: [DataGenerationService],
  exports: [DataGenerationService],
})
export class DataGenerationModule {}
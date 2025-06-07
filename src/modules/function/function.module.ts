import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FunctionController } from './function.controller';
import { FunctionService } from './function.service';
import { FirebaseService } from '../../common/firebase/firebase.service';

@Module({
  imports: [ConfigModule],
  controllers: [FunctionController],
  providers: [FunctionService, FirebaseService],
  exports: [FunctionService]
})
export class FunctionModule {}

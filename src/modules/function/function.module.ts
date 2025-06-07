import { Module } from '@nestjs/common';
import { FunctionService } from './function.service';
import { FunctionController } from './function.controller';

@Module({
  controllers: [FunctionController],
  providers: [FunctionService],
})
export class FunctionModule {}

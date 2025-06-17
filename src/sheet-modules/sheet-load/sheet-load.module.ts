import { Module } from '@nestjs/common';
import { SheetLoadService } from './sheet-load.service';
import { SheetLoadController } from './sheet-load.controller';

@Module({
  controllers: [SheetLoadController],
  providers: [SheetLoadService],
})
export class SheetLoadModule {}

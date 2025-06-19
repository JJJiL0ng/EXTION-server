import { Module } from '@nestjs/common';
import { SpreadsheetService } from './spreadsheet.service';
import { SpreadsheetController } from './spreadsheet.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  controllers: [SpreadsheetController],
  providers: [SpreadsheetService],
  imports: [PrismaModule],
  exports: [SpreadsheetService], // SpreadsheetService를 다른 모듈에서 사용할 수 있도록 export
})
export class SpreadsheetModule {}

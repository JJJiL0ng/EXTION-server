import { Module } from '@nestjs/common';
import { SpreadsheetService } from './spreadsheet.service';
import { SpreadsheetController } from './spreadsheet.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  controllers: [SpreadsheetController],
  providers: [SpreadsheetService],
  imports: [PrismaModule],
})
export class SpreadsheetModule {}

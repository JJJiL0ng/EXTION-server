import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TableGenerateController } from './table-generate.controller';
import { TableGenerateService } from './table-generate.service';
import { SpreadsheetModule } from '../sheet-modules/spreadsheet/spreadsheet.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PromptModule } from '../prompts/prompt/prompt.module';

@Module({
  imports: [
    ConfigModule,
    SpreadsheetModule,
    PrismaModule,
    PromptModule,
  ],
  controllers: [TableGenerateController],
  providers: [TableGenerateService],
  exports: [TableGenerateService],
})
export class TableGenerateModule {}

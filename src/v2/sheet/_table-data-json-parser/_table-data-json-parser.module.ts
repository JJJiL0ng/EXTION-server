import { Module } from '@nestjs/common';
import { TableDataJsonParserService } from './_table-data-json-parser.service';
import { TableDataJsonParserController } from './_table-data-json-parser.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TableDataJsonParserController],
  providers: [TableDataJsonParserService],
  exports: [TableDataJsonParserService],
})
export class TableDataJsonParserModule {}

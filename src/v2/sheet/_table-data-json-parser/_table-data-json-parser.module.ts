import { Module } from '@nestjs/common';
import { TableDataJsonParserService } from './_table-data-json-parser.service';
import { TableDataJsonParserController } from './_table-data-json-parser.controller';

@Module({
  controllers: [TableDataJsonParserController],
  providers: [TableDataJsonParserService],
})
export class TableDataJsonParserModule {}

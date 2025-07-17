import { Module } from '@nestjs/common';
import { TableDataJsonParsingService } from './table-data-json-parsing.service';
import { TableDataJsonParsingController } from './table-data-json-parsing.controller';

@Module({
  controllers: [TableDataJsonParsingController],
  providers: [TableDataJsonParsingService],
})
export class TableDataJsonParsingModule {}

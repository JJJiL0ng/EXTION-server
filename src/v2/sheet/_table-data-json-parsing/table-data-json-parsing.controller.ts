import { Controller } from '@nestjs/common';
import { TableDataJsonParsingService } from './table-data-json-parsing.service';

@Controller('table-data-json-parsing')
export class TableDataJsonParsingController {
  constructor(private readonly tableDataJsonParsingService: TableDataJsonParsingService) {
  }
}

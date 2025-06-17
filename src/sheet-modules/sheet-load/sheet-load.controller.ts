import { Controller } from '@nestjs/common';
import { SheetLoadService } from './sheet-load.service';

@Controller('sheet-load')
export class SheetLoadController {
  constructor(private readonly sheetLoadService: SheetLoadService) {}
}

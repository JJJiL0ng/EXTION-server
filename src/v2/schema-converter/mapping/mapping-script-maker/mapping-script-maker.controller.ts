import { Controller } from '@nestjs/common';
import { MappingScriptMakerService } from './mapping-script-maker.service';

@Controller('mapping-script-maker')
export class MappingScriptMakerController {
  constructor(private readonly mappingScriptMakerService: MappingScriptMakerService) {}
}

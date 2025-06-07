import { Controller } from '@nestjs/common';
import { FunctionService } from './function.service';

@Controller('function')
export class FunctionController {
  constructor(private readonly functionService: FunctionService) {}
}

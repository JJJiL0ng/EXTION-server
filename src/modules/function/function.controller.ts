import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { FunctionService } from './function.service';
import { ProcessFunctionDto, FunctionResponseDto } from './dto/process-function.dto';

@Controller('function')
export class FunctionController {
  constructor(private readonly functionService: FunctionService) {}

  @Post('process')
  async processFunction(@Body() processFunctionDto: ProcessFunctionDto): Promise<FunctionResponseDto> {
    return this.functionService.processFunction(processFunctionDto);
  }
}

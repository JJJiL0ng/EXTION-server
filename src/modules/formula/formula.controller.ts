import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FormulaService } from './formula.service';
import { ProcessFormulaDto } from './dto/process-formula.dto';

@Controller('formula')
export class FormulaController {
  constructor(private readonly formulaService: FormulaService) { }

  @Post('generate')
  async generateFormula(@Body() processFormulaDto: ProcessFormulaDto) {
    return await this.formulaService.generateFormula(processFormulaDto);
  }
  
}

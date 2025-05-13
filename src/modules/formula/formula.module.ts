import { Module } from '@nestjs/common';
import { FormulaService } from './formula.service';
import { FormulaController } from './formula.controller';

@Module({
  controllers: [FormulaController],
  providers: [FormulaService],
})
export class FormulaModule {}

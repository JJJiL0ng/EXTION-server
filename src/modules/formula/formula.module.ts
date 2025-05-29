import { Module } from '@nestjs/common';
import { FormulaService } from './formula.service';
import { FormulaController } from './formula.controller';
import { FirebaseModule } from '../../common/firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [FormulaController],
  providers: [FormulaService],
})
export class FormulaModule {}

import { Module } from '@nestjs/common';
import { FormulaService } from './formula.service';
import { FormulaController } from './formula.controller';
import { FirebaseModule } from '../../common/firebase/firebase.module';
import { CacheModule } from '../../common/cache/cache.module';

@Module({
  imports: [FirebaseModule, CacheModule],
  controllers: [FormulaController],
  providers: [FormulaService],
})
export class FormulaModule {}

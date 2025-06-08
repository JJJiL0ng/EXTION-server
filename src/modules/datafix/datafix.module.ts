import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataFixController } from './datafix.controller';
import { DataFixService } from './datafix.service';
import { FirebaseModule } from '../../common/firebase/firebase.module';
import { SheetModule } from '../../common/sheet/sheet.module';
import { CacheModule } from '../../common/cache/cache.module';

@Module({
  imports: [ConfigModule, FirebaseModule, SheetModule, CacheModule],
  controllers: [DataFixController],
  providers: [DataFixService],
  exports: [DataFixService]
})
export class DataFixModule {}
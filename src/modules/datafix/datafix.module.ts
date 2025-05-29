import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataFixController } from './datafix.controller';
import { DataFixService } from './datafix.service';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { SheetService } from '../../common/sheet/sheet.service';

@Module({
  imports: [ConfigModule],
  controllers: [DataFixController],
  providers: [
    DataFixService,
    FirebaseService,
    SheetService
  ],
  exports: [DataFixService]
})
export class DataFixModule {}
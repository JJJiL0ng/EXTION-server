import { Module } from '@nestjs/common';
import { NormalChatService } from './normal.service';
import { NormalChatController } from './normal.controller';
import { FirebaseModule } from '../../common/firebase/firebase.module';
import { SheetModule } from '../../common/sheet/sheet.module';
import { CacheModule } from '../../common/cache/cache.module';


@Module({
  imports: [FirebaseModule, SheetModule, CacheModule],
  controllers: [NormalChatController],
  providers: [NormalChatService],
})
export class NormalModule  {}

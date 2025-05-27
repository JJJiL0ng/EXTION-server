import { Module } from '@nestjs/common';
import { NormalChatService } from './normal.service';
import { NormalChatController } from './normal.controller';
import { FirebaseModule } from '../../common/firebase/firebase.module';
import { SheetModule } from '../../common/sheet/sheet.module';

@Module({
  imports: [FirebaseModule, SheetModule],
  controllers: [NormalChatController],
  providers: [NormalChatService],
})
export class NormalModule  {}

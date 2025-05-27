import { Module } from '@nestjs/common';
import { NormalChatService } from './normal.service';
import { NormalChatController } from './normal.controller';
import { FirebaseModule } from '../../common/firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [NormalChatController],
  providers: [NormalChatService],
})
export class NormalModule  {}

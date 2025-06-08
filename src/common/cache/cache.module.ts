import { Module } from '@nestjs/common';
import { ChatHistoryCacheService } from './cache.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  providers: [ChatHistoryCacheService],
  exports: [ChatHistoryCacheService],
})
export class CacheModule {}

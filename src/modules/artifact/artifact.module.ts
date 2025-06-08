import { Module } from '@nestjs/common';
import { ArtifactService } from './artifact.service';
import { ArtifactController } from './artifact.controller';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { CacheModule } from '../../common/cache/cache.module';

@Module({
  controllers: [ArtifactController],
  providers: [ArtifactService, FirebaseService, CacheModule],
})
export class ArtifactModule {}

import { Module } from '@nestjs/common';
import { ArtifactService } from './artifact.service';
import { ArtifactController } from './artifact.controller';
import { FirebaseService } from '../../common/firebase/firebase.service';

@Module({
  controllers: [ArtifactController],
  providers: [ArtifactService, FirebaseService],
})
export class ArtifactModule {}

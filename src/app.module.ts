import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FormulaModule } from './modules/formula/formula.module';
import { ArtifactModule } from './modules/artifact/artifact.module';
import { DataGenerationModule } from './modules/datageneration/datageneration.module';
import { NormalModule } from './modules/normal/normal.module';
import { DataFixModule } from './modules/datafix/datafix.module';
import { FirebaseModule } from './common/firebase/firebase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    FormulaModule,
    ArtifactModule,
    DataGenerationModule,
    NormalModule,
    DataFixModule,
    FirebaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
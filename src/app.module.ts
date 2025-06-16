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
import { SheetModule } from './common/sheet/sheet.module';
import { FunctionModule } from './modules/function/function.module';
import { CacheModule } from './common/cache/cache.module';
import { DatabaseModule } from './database/database.module';
import { PrismaModule } from './prisma/prisma.module';

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
    SheetModule,
    FunctionModule,
    CacheModule,
    DatabaseModule,
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
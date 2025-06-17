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
import { OrchestratorChatModule } from './chat-modules/orchestrator-chat/orchestrator-chat.module';
import { GeneralChatModule } from './chat-modules/general-chat/general-chat.module';
import { FunctionChatModule } from './chat-modules/function-chat/function-chat.module';
import { DataEditChatModule } from './chat-modules/data-edit-chat/data-edit-chat.module';
import { DataGenerateChatModule } from './chat-modules/data-generate-chat/data-generate-chat.module';
import { VisualizationGenerateChatModule } from './chat-modules/visualization-generate-chat/visualization-generate-chat.module';
import { AnalyzeUserIntentModule } from './chat-modules/analyze-user-intent/analyze-user-intent.module';
import { GeminiApiModule } from './common/gemini-api/gemini-api.module';

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
    OrchestratorChatModule,
    GeneralChatModule,
    FunctionChatModule,
    DataEditChatModule,
    DataGenerateChatModule,
    VisualizationGenerateChatModule,
    AnalyzeUserIntentModule,
    GeminiApiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
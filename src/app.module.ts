import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { PrismaModule } from './prisma/prisma.module';
import { OrchestratorChatModule } from './chat-modules/orchestrator-chat/orchestrator-chat.module';
import { GeneralChatModule } from './chat-modules/general-chat/general-chat.module';
import { FunctionChatModule } from './chat-modules/function-chat/function-chat.module';
import { DataEditChatModule } from './chat-modules/data-edit-chat/data-edit-chat.module';
import { DataGenerateChatModule } from './chat-modules/data-generate-chat/data-generate-chat.module';
import { VisualizationGenerateChatModule } from './chat-modules/visualization-generate-chat/visualization-generate-chat.module';
import { AnalyzeUserIntentModule } from './chat-modules/analyze-user-intent/analyze-user-intent.module';
import { GeminiApiModule } from './chat-modules/gemini-api/gemini-api.module';
import { SpreadsheetModule } from './sheet-modules/spreadsheet/spreadsheet.module';
import { AuthModule } from './auth-modules/auth/auth.module';
import { ChatDatabaseModule } from './chat-modules/chat-database/chat-database.module';
import { AiutilsModule } from './chat-modules/aiutils/aiutils.module';
import { TableGenerateModule } from './table-generate/table-generate.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
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
    SpreadsheetModule,
    AuthModule,
    ChatDatabaseModule,
    AiutilsModule,
    TableGenerateModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
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
import { TableDataJsonParsingModule } from './v2/sheet/_table-data-json-parsing/table-data-json-parsing.module';
import { TableDataJsonSaveModule } from './v2/sheet/_table-data-json-save/table-data-json-save.module';
import { UserModule } from './v2/user/user.module';
import { TableDataCacheModule } from './v2/cache/_table-data-cache/table-data-cache.module';
import { MainAiModule } from './v2/ai/_main-ai/main-ai.module';
import { MainChatModule } from './v2/chatting/_main-chat/main-chat.module';

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
    TableDataJsonParsingModule,
    TableDataJsonSaveModule,
    UserModule,
    TableDataCacheModule,
    MainAiModule,
    MainChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
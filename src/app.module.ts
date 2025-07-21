import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './v2/prisma/prisma.module';
import { AuthModule } from './v2/auth/_auth/auth.module';

import { TableDataJsonParsingModule } from './v2/sheet/_table-data-json-parsing/table-data-json-parsing.module';
import { TableDataJsonSaveModule } from './v2/sheet/_table-data-json-save/table-data-json-save.module';
import { UserModule } from './v2/user/user.module';
import { TableDataCacheModule } from './v2/cache/_table-data-cache/table-data-cache.module';
import { MainAiModule } from './v2/ai/_main-ai-service/main-ai.module';
import { MainChatModule } from './v2/chatting/_main-chat/main-chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
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